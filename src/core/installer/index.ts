import * as fs from "node:fs";
import * as path from "node:path";
import { EXECUTABLE_MODE } from "../constants";
import type { AppConfig } from "../config";
import { download, downloadPath } from "../download";
import { getLatestRelease, pickAsset, type ReleaseInfo } from "../github";
import { loadManifest, type AssetDef, type Manifest } from "../manifest";
import { detectPlatform } from "../platform";
import type { RomFile } from "../scanner";
import { readState, writeState, type PortState } from "../state";
import { writeLauncher, removeLauncher } from "../launchers";
import { throwIfAborted } from "../tasks";
import { extractArchive } from "./archive";
import { createSymlink, findFileByName } from "./links";
import { preserveUserData, removeExceptPreserved } from "./preserve";

export { preserveUserData } from "./preserve";

export interface InstallOptions {
  /** Requirement id -> ROM file to symlink at that requirement's dest. */
  roms?: Record<string, RomFile>;
  force?: boolean;
  onProgress?: (stage: string, done: number, total: number) => void;
  /** Si se aborta, la instalación se detiene en los puntos de control. */
  signal?: AbortSignal;
}

export function resolveAssetForPlatform(m: Manifest): AssetDef | null {
  const p = detectPlatform();
  const direct = m.assets[p.key];
  if (direct) return direct;
  // Fallback: any asset of the same OS family.
  const os = p.os;
  const family = Object.entries(m.assets).find(([key]) => key.startsWith(os));
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

export function resolveExecutable(portRoot: string, asset: { executable: string | null }): string | null {
  if (!asset.executable) return null;
  const direct = path.join(portRoot, asset.executable);
  if (fs.existsSync(direct)) return direct;
  // Fallback: search recursively by basename.
  return findFileByName(portRoot, path.basename(asset.executable));
}

export async function installPort(
  cfg: AppConfig,
  manifest: Manifest,
  opts: InstallOptions = {},
): Promise<PortState> {
  const asset = resolveAssetForPlatform(manifest);
  if (!asset) throw new Error(`[${manifest.id}] no asset definition for platform ${detectPlatform().key}`);

  opts.onProgress?.("release", 0, 1);
  const release = await getLatestInfo(cfg, manifest);
  throwIfAborted(opts.signal);
  if (!release) throw new Error(`[${manifest.id}] no release found for ${manifest.repo}`);
  const assetName = pickAsset(release, asset.pattern);
  if (!assetName) {
    throw new Error(`[${manifest.id}] no asset matching "${asset.pattern}" in release ${release.tag}`);
  }

  // Download
  opts.onProgress?.("download", 0, 1);
  const downloadedFile = downloadPath(cfg, manifest.id, assetName.name);
  if (!fs.existsSync(downloadedFile) || fs.statSync(downloadedFile).size !== assetName.size) {
    await download(cfg, assetName.url, downloadedFile, (done, total) =>
      opts.onProgress?.("download", done, total),
    { signal: opts.signal });
  }
  throwIfAborted(opts.signal);

  // Extract / place
  opts.onProgress?.("extract", 0, 1);
  const portRoot = portDir(cfg, manifest.id);
  const backup = path.join(cfg.cacheDir, "old", manifest.id);
  if (fs.existsSync(portRoot)) {
    // Keep existing mods symlinks safe: move whole dir to backup, then remove.
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    if (fs.existsSync(backup)) fs.rmSync(backup, { recursive: true, force: true });
    fs.renameSync(portRoot, backup);
  }
  try {
    if (asset.type === "apk" || asset.type === "appimage") {
      fs.mkdirSync(portRoot, { recursive: true });
      fs.copyFileSync(downloadedFile, path.join(portRoot, assetName.name));
    } else {
      await extractArchive(asset, downloadedFile, portRoot);
    }
  } catch (e) {
    // Rollback: descartar el extract parcial antes de devolver el backup.
    // renameSync(backup, dir) lanzaría ENOTEMPTY si dir ya existe con contenido,
    // dejando el port roto y el backup (con los saves) varado en cache/old, que
    // la próxima actualización borraría perdiendo los datos del usuario.
    if (fs.existsSync(portRoot)) fs.rmSync(portRoot, { recursive: true, force: true });
    if (fs.existsSync(backup)) fs.renameSync(backup, portRoot);
    throw e;
  }
  throwIfAborted(opts.signal);
  // Restaurar saves/configs del port anterior antes de descartar el backup.
  preserveUserData(backup, portRoot, manifest);
  if (fs.existsSync(backup)) fs.rmSync(backup, { recursive: true, force: true });

  // Resolve the executable: for appimage/apk the asset file itself is the executable.
  let executable = resolveExecutable(portRoot, asset);
  if (!executable && (asset.type === "appimage" || asset.type === "apk")) {
    executable = path.join(portRoot, assetName.name);
  }
  // On Linux/macOS, apply chmod +x to the main executable AND all other
  // ELF binaries in the port dir (shared libs, helpers, etc.).
  ensureExecutable(executable);
  ensureAllBinariesExecutable(portRoot);

  throwIfAborted(opts.signal);

  // Symlink the ROMs (one per requirement; optional ones only when provided)
  const roms = opts.roms ?? {};
  const linkedRoms: Record<string, string> = {};
  for (const requirement of manifest.roms) {
    const rom = roms[requirement.id];
    if (rom) {
      createSymlink(rom.path, path.join(portRoot, requirement.dest));
      linkedRoms[requirement.id] = rom.path;
    }
  }

  const state: PortState = {
    id: manifest.id,
    name: manifest.name,
    repo: manifest.repo,
    version: release.tag,
    assetName: assetName.name,
    installedAt: new Date().toISOString(),
    platform: detectPlatform().key,
    executable: executable ? path.relative(portRoot, executable) : assetName.name,
    romLinked: linkedRoms[manifest.roms[0]?.id ?? ""] ?? null,
    romsLinked: linkedRoms,
  };
  writeState(cfg, state);
  // Launcher de Steam: se crea/actualiza con el port (también tras un update).
  writeLauncher(cfg, state);
  return state;
}

export function uninstallPort(cfg: AppConfig, id: string): void {
  // Quitar su launcher de Steam antes de borrar dir/estado.
  removeLauncher(cfg, id);
  const manifest = loadManifest(cfg, id);
  const dir = portDir(cfg, id);
  if (fs.existsSync(dir)) {
    if (manifest?.preserve && manifest.preserve.length > 0) {
      // Desinstalar sin perder los datos de usuario marcados con `preserve`
      // (saves, configs): se borra todo lo demás y esos archivos se quedan en
      // la carpeta del port, de modo que al reinstalarlo se restauran solos
      // (el instalador trata la carpeta sobrante como instalación previa).
      const kept = removeExceptPreserved(dir, manifest.preserve);
      if (!kept) fs.rmSync(dir, { recursive: true, force: true });
    } else {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  const stateFile = path.join(cfg.cacheDir, "state", `${id}.json`);
  if (fs.existsSync(stateFile)) fs.rmSync(stateFile, { force: true });
}

export function launchExecutable(cfg: AppConfig, id: string): string | null {
  const state = readState(cfg, id);
  if (!state) return null;
  const executable = path.join(portDir(cfg, id), state.executable);
  if (!fs.existsSync(executable)) return null;
  ensureExecutable(executable);
  return executable;
}

/** chmod +x on unix so spawn works (fixes EACCES on appimage/apk/binaries). */
export function ensureExecutable(file: string | null): void {
  if (!file || process.platform === "win32") return;
  try {
    fs.chmodSync(file, EXECUTABLE_MODE);
  } catch {
    // ok
  }
}

/**
 * Walk the port dir and apply chmod +x to every ELF binary (no extension or
 * known executable extension). This ensures that helpers, shared libraries
 * and side binaries bundled by the port also get execute permission.
 * Only runs on Unix; no-op on Windows.
 */
function ensureAllBinariesExecutable(dir: string): void {
  if (process.platform === "win32") return;
  const ELF_MAGIC = Buffer.from([0x7f, 0x45, 0x4c, 0x46]); // \x7fELF
  const walk = (d: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      // Skip files that already have +x or are clearly not binaries.
      try {
        const stat = fs.statSync(full);
        if (stat.mode & 0o111) continue; // already executable
        // Check ELF magic (first 4 bytes).
        const fd = fs.openSync(full, "r");
        const buf = Buffer.alloc(4);
        fs.readSync(fd, buf, 0, 4, 0);
        fs.closeSync(fd);
        if (buf.equals(ELF_MAGIC)) {
          fs.chmodSync(full, EXECUTABLE_MODE);
        }
      } catch {
        // skip unreadable files
      }
    }
  };
  walk(dir);
}
