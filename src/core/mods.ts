import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AppConfig } from "./config";
import type { Manifest } from "./manifest";
import { detectPlatform } from "./platform";

/**
 * Centralized mods live in MODS/<gameDir>/<modName>.
 * Each mod is symlinked into <portDir>/<mods.dir>/<modName>.
 */

export function centralModsRoot(cfg: AppConfig, m: Manifest): string {
  return path.join(cfg.modsDir, m.mods.gameDir);
}

/**
 * Where mods get symlinked for a port: <portDir>/<dir> by default, or the
 * manifest's `mods.linkRoot` when the game reads user data from the OS data
 * dir (e.g. Dusklight reads ~/.local/share/TwilitRealm/Dusklight/...).
 * Expands "~/..." and %ENV_VAR% prefixes.
 */
export function modsLinkRoot(cfg: AppConfig, m: Manifest): string {
  const config = m.mods.linkRoot;
  const platformOs = detectPlatform().os;
  const raw = typeof config === "string" ? config : config?.[platformOs];
  if (!raw) {
    if (config) {
      console.warn(`[mods] ${m.id}: linkRoot has no entry for OS "${platformOs}" — using <portDir>/<dir>`);
    }
    return path.join(cfg.portsDir, m.id, m.mods.dir);
  }
  if (raw === "~") return os.homedir();
  if (raw.startsWith("~/")) return path.join(os.homedir(), raw.slice(2));
  const m2 = raw.match(/^%([^%]+)%\/?/);
  if (m2) {
    const env = process.env[m2[1]];
    if (env) return path.join(env, raw.slice(m2[0].length));
  }
  return path.resolve(raw);
}

export function listCentralMods(cfg: AppConfig, m: Manifest): string[] {
  const root = centralModsRoot(cfg, m);
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).map((e) => e.name).sort();
}

export function isModLinked(cfg: AppConfig, m: Manifest, modName: string): boolean {
  const link = path.join(modsLinkRoot(cfg, m), modName);
  return fs.existsSync(link);
}

/**
 * Crea el enlace del mod en su destino (o una copia si el SO/permisos no lo
 * permiten):
 *   - Windows: junction para carpetas (no requiere permisos de admin) y
 *     symlink de archivo para archivos sueltos; si falla (p. ej. sin modo
 *     desarrollador) se copia el mod para que el juego pueda leerlo.
 *   - Linux/macOS: symlink normal.
 */
export function linkMod(cfg: AppConfig, m: Manifest, modName: string): void {
  const src = path.join(centralModsRoot(cfg, m), modName);
  if (!fs.existsSync(src)) throw new Error(`Mod not found in MODS/${m.mods.gameDir}: ${modName}`);
  const dest = path.join(modsLinkRoot(cfg, m), modName);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  removeLinked(dest);
  if (fs.statSync(src).isDirectory()) {
    // Carpeta: junction (Windows, no requiere permisos de admin; en el resto
    // de SO se crea un symlink normal). Si falla, symlink de directorio y,
    // como último recurso, copia.
    try {
      fs.symlinkSync(src, dest, "junction");
    } catch {
      try {
        fs.symlinkSync(src, dest, "dir");
      } catch {
        fs.cpSync(src, dest, { recursive: true });
      }
    }
  } else {
    // Archivo suelto (p. ej. un .o2r): NUNCA junction (en Windows crearía un
    // junction roto en silencio). Symlink de archivo y, si el SO no lo
    // permite (sin modo desarrollador), copia para que el juego pueda leerlo.
    try {
      fs.symlinkSync(src, dest, "file");
    } catch {
      fs.copyFileSync(src, dest);
    }
  }
}

/**
 * Borra un enlace/copia de mod del destino sin tocar el mod central ni su
 * contenido (un junction/symlink se elimina solo como enlace).
 */
function removeLinked(dest: string): void {
  try {
    const st = fs.lstatSync(dest);
    if (st.isSymbolicLink()) {
      fs.rmSync(dest, { force: true });
    } else if (st.isDirectory()) {
      fs.rmSync(dest, { recursive: true, force: true });
    } else {
      fs.rmSync(dest, { force: true });
    }
  } catch {
    // no existe
  }
}

export function unlinkMod(cfg: AppConfig, m: Manifest, modName: string): void {
  removeLinked(path.join(modsLinkRoot(cfg, m), modName));
}

/** Link all centralized mods for a port (called after install/update/scan). */
export function linkAllMods(cfg: AppConfig, m: Manifest): string[] {
  if (!isInstalledDir(cfg, m)) return [];
  const linked: string[] = [];
  for (const mod of listCentralMods(cfg, m)) {
    if (!isModLinked(cfg, m, mod)) {
      try {
        linkMod(cfg, m, mod);
        linked.push(mod);
      } catch {
        // skip broken
      }
    }
  }
  return linked;
}

export function unlinkAllMods(cfg: AppConfig, m: Manifest): void {
  const destRoot = modsLinkRoot(cfg, m);
  if (!fs.existsSync(destRoot)) return;
  // Se borran los enlaces (junctions/symlinks) y las copias/archivos cuyo
  // nombre coincide con un mod central; los archivos propios del juego o del
  // usuario en el destino se respetan.
  const managed = new Set(listCentralMods(cfg, m));
  for (const entry of fs.readdirSync(destRoot, { withFileTypes: true })) {
    const full = path.join(destRoot, entry.name);
    if (entry.isSymbolicLink() || managed.has(entry.name)) removeLinked(full);
  }
}

function isInstalledDir(cfg: AppConfig, m: Manifest): boolean {
  return fs.existsSync(path.join(cfg.portsDir, m.id)) && fs.existsSync(path.join(cfg.stateDir, `${m.id}.json`));
}

/**
 * Keeps MODS/<gameDir> folders in sync with the installed ports:
 * creates the folder for installed ports and removes the empty
 * folders of uninstalled ones. Folders that contain user mods are
 * never deleted.
 */
export function syncModsFolders(cfg: AppConfig, manifests: Manifest[]): void {
  for (const m of manifests) {
    const root = centralModsRoot(cfg, m);
    if (isInstalledDir(cfg, m)) {
      fs.mkdirSync(root, { recursive: true });
      // Also ensure the link destination exists (e.g. the game's OS data dir).
      fs.mkdirSync(modsLinkRoot(cfg, m), { recursive: true });
    } else if (fs.existsSync(root) && isEmptyDir(root)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
}

function isEmptyDir(dir: string): boolean {
  try {
    return fs.readdirSync(dir).length === 0;
  } catch {
    return false;
  }
}
