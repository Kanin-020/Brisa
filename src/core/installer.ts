import * as fs from "node:fs";
import * as path from "node:path";
import AdmZip from "adm-zip";
import * as tar from "tar";
import type { AppConfig } from "./config";
import { download, downloadPath } from "./download";
import { getLatestRelease, pickAsset, type ReleaseInfo } from "./github";
import { matchGlob } from "./glob";
import { loadManifest, type AssetDef, type Manifest } from "./manifest";
import { detectPlatform } from "./platform";
import type { RomFile } from "./scanner";
import { readState, writeState, type PortState } from "./state";
import { writeLauncher, removeLauncher } from "./launchers";

export interface InstallOptions {
  /** Requirement id -> ROM file to symlink at that requirement's dest. */
  roms?: Record<string, RomFile>;
  force?: boolean;
  onProgress?: (stage: string, done: number, total: number) => void;
}

export function resolveAssetForPlatform(m: Manifest): AssetDef | null {
  const p = detectPlatform();
  const direct = m.assets[p.key];
  if (direct) return direct;
  // Fallback: any asset of the same OS family.
  const os = p.os;
  const family = Object.entries(m.assets).find(([k]) => k.startsWith(os));
  return family ? family[1] : null;
}

export function portDir(cfg: AppConfig, id: string): string {
  return path.join(cfg.portsDir, id);
}

export function isInstalled(cfg: AppConfig, id: string): boolean {
  return readState(cfg, id) !== null && fs.existsSync(portDir(cfg, id));
}

export async function getLatestInfo(cfg: AppConfig, m: Manifest): Promise<ReleaseInfo | null> {
  try {
    return await getLatestRelease(cfg, m.repo);
  } catch (e) {
    console.warn(`[${m.id}] could not check releases: ${(e as Error).message}`);
    return null;
  }
}

async function extract(asset: AssetDef, file: string, dest: string): Promise<void> {
  fs.mkdirSync(dest, { recursive: true });
  if (asset.type === "zip") {
    const zip = new AdmZip(file);
    zip.extractAllTo(dest, true);
  } else if (asset.type === "tar.gz") {
    await tar.x({ file, cwd: dest });
  } else {
    // appimage / apk: single file
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(file, dest);
  }
}

export function resolveExecutable(portRoot: string, asset: { executable: string | null }): string | null {
  if (!asset.executable) return null;
  const direct = path.join(portRoot, asset.executable);
  if (fs.existsSync(direct)) return direct;
  // Fallback: search recursively by basename.
  const base = path.basename(asset.executable);
  const found = findFile(portRoot, base);
  return found;
}

function findFile(dir: string, basename: string): string | null {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === basename.toLowerCase()) return full;
    if (entry.isDirectory()) {
      const sub = findFile(full, basename);
      if (sub) return sub;
    }
  }
  return null;
}

function createSymlink(target: string, link: string): void {
  fs.mkdirSync(path.dirname(link), { recursive: true });
  if (fs.existsSync(link)) fs.rmSync(link, { force: true });
  try {
    fs.symlinkSync(target, link);
  } catch {
    // Fallback: copy for platforms without symlink privileges (older Windows).
    fs.copyFileSync(target, link);
  }
}

export async function installPort(
  cfg: AppConfig,
  m: Manifest,
  opts: InstallOptions = {},
): Promise<PortState> {
  const asset = resolveAssetForPlatform(m);
  if (!asset) throw new Error(`[${m.id}] no asset definition for platform ${detectPlatform().key}`);

  opts.onProgress?.("release", 0, 1);
  const release = await getLatestInfo(cfg, m);
  if (!release) throw new Error(`[${m.id}] no release found for ${m.repo}`);
  const assetName = pickAsset(release, asset.pattern);
  if (!assetName) {
    throw new Error(`[${m.id}] no asset matching "${asset.pattern}" in release ${release.tag}`);
  }

  // Download
  opts.onProgress?.("download", 0, 1);
  const dl = downloadPath(cfg, m.id, assetName.name);
  if (!fs.existsSync(dl) || fs.statSync(dl).size !== assetName.size) {
    await download(cfg, assetName.url, dl, (done, total) => opts.onProgress?.("download", done, total));
  }

  // Extract / place
  opts.onProgress?.("extract", 0, 1);
  const dir = portDir(cfg, m.id);
  const backup = path.join(cfg.cacheDir, "old", m.id);
  if (fs.existsSync(dir)) {
    // Keep existing mods symlinks safe: move whole dir to backup, then remove.
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    if (fs.existsSync(backup)) fs.rmSync(backup, { recursive: true, force: true });
    fs.renameSync(dir, backup);
  }
  try {
    if (asset.type === "apk" || asset.type === "appimage") {
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(dl, path.join(dir, assetName.name));
    } else {
      await extract(asset, dl, dir);
    }
  } catch (e) {
    // Rollback: descartar el extract parcial antes de devolver el backup.
    // renameSync(backup, dir) lanzaría ENOTEMPTY si dir ya existe con contenido,
    // dejando el port roto y el backup (con los saves) varado en cache/old, que
    // la próxima actualización borraría perdiendo los datos del usuario.
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    if (fs.existsSync(backup)) fs.renameSync(backup, dir);
    throw e;
  }
  // Restaurar saves/configs del port anterior antes de descartar el backup.
  preserveUserData(backup, dir, m);
  if (fs.existsSync(backup)) fs.rmSync(backup, { recursive: true, force: true });

  // Resolve the executable: for appimage/apk the asset file itself is the executable.
  let exe = resolveExecutable(dir, asset);
  if (!exe && (asset.type === "appimage" || asset.type === "apk")) {
    exe = path.join(dir, assetName.name);
  }
  ensureExecutable(exe);

  // Symlink the ROMs (one per requirement; optional ones only when provided)
  const roms = opts.roms ?? {};
  const romsLinked: Record<string, string> = {};
  for (const req of m.roms) {
    const r = roms[req.id];
    if (r) {
      createSymlink(r.path, path.join(dir, req.dest));
      romsLinked[req.id] = r.path;
    }
  }

  const state: PortState = {
    id: m.id,
    name: m.name,
    repo: m.repo,
    version: release.tag,
    assetName: assetName.name,
    installedAt: new Date().toISOString(),
    platform: detectPlatform().key,
    executable: exe ? path.relative(dir, exe) : assetName.name,
    romLinked: romsLinked[m.roms[0]?.id ?? ""] ?? null,
    romsLinked,
  };
  writeState(cfg, state);
  // Launcher de Steam: se crea/actualiza con el port (también tras un update).
  writeLauncher(cfg, state);
  return state;
}

export function uninstallPort(cfg: AppConfig, id: string): void {
  // Quitar su launcher de Steam antes de borrar dir/estado.
  removeLauncher(cfg, id);
  const m = loadManifest(cfg, id);
  const dir = portDir(cfg, id);
  if (fs.existsSync(dir)) {
    if (m?.preserve && m.preserve.length > 0) {
      // Desinstalar sin perder los datos de usuario marcados con `preserve`
      // (saves, configs): se borra todo lo demás y esos archivos se quedan en
      // la carpeta del port, de modo que al reinstalarlo se restauran solos
      // (el instalador trata la carpeta sobrante como instalación previa).
      const kept = removeExceptPreserved(dir, m.preserve);
      if (!kept) fs.rmSync(dir, { recursive: true, force: true });
    } else {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  const stateFile = path.join(cfg.cacheDir, "state", `${id}.json`);
  if (fs.existsSync(stateFile)) fs.rmSync(stateFile, { force: true });
}

/**
 * Borra todo el contenido de `root` excepto los archivos/enlaces que coincidan
 * con alguno de los patrones glob de `preserve` (rutas relativas a `root`).
 * Los directorios se mantienen si contienen algo preservado (o si ellos mismos
 * coinciden). Devuelve true si quedó algo dentro de `root`.
 */
function removeExceptPreserved(root: string, patterns: string[]): boolean {
  const isPreserved = (rel: string) => patterns.some((p) => matchGlob(p, rel));
  const walk = (dir: string): boolean => {
    let kept = false;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full);
      if (entry.isDirectory()) {
        if (isPreserved(rel)) {
          // El directorio entero está preservado (p. ej. patrón literal "saves").
          kept = true;
          continue;
        }
        if (walk(full)) {
          kept = true;
        } else {
          fs.rmSync(full, { recursive: true, force: true });
        }
      } else if (isPreserved(rel)) {
        // Archivo o symlink preservado (p. ej. un save o una config).
        kept = true;
      } else {
        // Todo lo demás (binarios, symlinks de ROM y mods, …) se borra.
        fs.rmSync(full, { force: true });
      }
    }
    return kept;
  };
  return walk(root);
}

export function launchExecutable(cfg: AppConfig, id: string): string | null {
  const state = readState(cfg, id);
  if (!state) return null;
  const exe = path.join(portDir(cfg, id), state.executable);
  if (!fs.existsSync(exe)) return null;
  ensureExecutable(exe);
  return exe;
}

/**
 * Después de extraer la nueva versión, restaura desde el backup los datos de
 * usuario del port anterior para que las actualizaciones NO borren saves ni
 * configuraciones:
 *   - Todo archivo/enlace del port anterior que no exista en la nueva release
 *     (saves, configs, mods enlazados, symlinks de ROMs) se copia/enlaza de
 *     vuelta.
 *   - Los archivos que SÍ vienen en la nueva release (configs por defecto)
 *     solo se restauran si coinciden con los patrones `preserve` del
 *     manifiesto: ahí gana la configuración del usuario sobre el default.
 */
export function preserveUserData(backup: string, dir: string, m: Manifest): void {
  if (!fs.existsSync(backup)) return;
  const patterns = m.preserve ?? [];
  const destExists = (rel: string) => fs.existsSync(path.join(dir, rel));
  // Un archivo se restaura si la nueva release no lo trae, o si el manifiesto
  // lo marca en `preserve` (entonces el del usuario pisa el default).
  const keep = (rel: string) =>
    destExists(rel) ? patterns.some((p) => matchGlob(p, rel)) : true;

  const walk = (src: string, rel: string) => {
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      const srcFull = path.join(src, entry.name);
      const destFull = path.join(dir, relPath);
      if (entry.isDirectory()) {
        // Siempre se baja: keep() decide por archivo si restaurarlo. No usar
        // prefijos literales de `preserve` aquí: son globs (p. ej. "saves/**") y
        // un dir anidado que la release sí traiga ("saves/foo/") haría que se
        // saltara el descenso y se perdieran los saves del usuario.
        fs.mkdirSync(destFull, { recursive: true });
        walk(srcFull, relPath);
      } else if (entry.isSymbolicLink()) {
        if (keep(relPath)) {
          fs.mkdirSync(path.dirname(destFull), { recursive: true });
          if (destExists(relPath)) fs.rmSync(destFull, { force: true });
          try {
            const target = fs.readlinkSync(srcFull);
            // En Windows, los junctions (carpetas de mods) se restauran como
            // junction (destino absoluto, sin permisos de admin); el resto
            // como symlink normal.
            const targetIsDir =
              process.platform === "win32" &&
              fs.existsSync(target) &&
              fs.statSync(target).isDirectory();
            if (targetIsDir) {
              fs.symlinkSync(target, destFull, "junction");
            } else {
              fs.symlinkSync(target, destFull);
            }
          } catch {
            // enlace roto o sin permisos: ignorar
          }
        }
      } else if (keep(relPath)) {
        fs.mkdirSync(path.dirname(destFull), { recursive: true });
        fs.copyFileSync(srcFull, destFull);
      }
    }
  };
  walk(backup, "");
}

/** chmod +x on unix so spawn works (fixes EACCES on appimage/apk/binaries). */
export function ensureExecutable(file: string | null): void {
  if (!file || process.platform === "win32") return;
  try {
    fs.chmodSync(file, 0o755);
  } catch {
    // ok
  }
}
