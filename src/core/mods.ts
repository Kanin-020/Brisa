import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AppConfig } from "./config";
import { isInstalled } from "./installer";
import type { Manifest } from "./manifest";
import { detectPlatform } from "./platform";

/**
 * Centralized mods live in MODS/<gameDir>/<modName>.
 * Each mod is symlinked into <portDir>/<mods.dir>/<modName>.
 */

export function centralModsRoot(cfg: AppConfig, manifest: Manifest): string {
  return path.join(cfg.modsDir, manifest.mods.gameDir);
}

/**
 * Where mods get symlinked for a port: <portDir>/<dir> by default, or the
 * manifest's `mods.linkRoot` when the game reads user data from the OS data
 * dir (e.g. Dusklight reads ~/.local/share/TwilitRealm/Dusklight/...).
 * Expands "~/..." and %ENV_VAR% prefixes.
 */
export function modsLinkRoot(cfg: AppConfig, manifest: Manifest): string {
  const config = manifest.mods.linkRoot;
  const platformOs = detectPlatform().os;
  const raw = typeof config === "string" ? config : config?.[platformOs];
  if (!raw) {
    if (config) {
      console.warn(`[mods] ${manifest.id}: linkRoot has no entry for OS "${platformOs}" — using <portDir>/<dir>`);
    }
    return path.join(cfg.portsDir, manifest.id, manifest.mods.dir);
  }
  if (raw === "~") return os.homedir();
  if (raw.startsWith("~/")) return path.join(os.homedir(), raw.slice(2));
  const envMatch = raw.match(/^%([^%]+)%\/?/);
  if (envMatch) {
    const env = process.env[envMatch[1]];
    if (env) return path.join(env, raw.slice(envMatch[0].length));
  }
  return path.resolve(raw);
}

export function listCentralMods(cfg: AppConfig, manifest: Manifest): string[] {
  const root = centralModsRoot(cfg, manifest);
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).map((entry) => entry.name).sort();
}

export function isModLinked(cfg: AppConfig, manifest: Manifest, modName: string): boolean {
  const link = path.join(modsLinkRoot(cfg, manifest), modName);
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
export function linkMod(cfg: AppConfig, manifest: Manifest, modName: string): void {
  const source = path.join(centralModsRoot(cfg, manifest), modName);
  if (!fs.existsSync(source)) throw new Error(`Mod not found in MODS/${manifest.mods.gameDir}: ${modName}`);
  const dest = path.join(modsLinkRoot(cfg, manifest), modName);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  removeLinkedEntry(dest);
  if (fs.statSync(source).isDirectory()) {
    // Carpeta: junction (Windows, no requiere permisos de admin; en el resto
    // de SO se crea un symlink normal). Si falla, symlink de directorio y,
    // como último recurso, copia.
    try {
      fs.symlinkSync(source, dest, "junction");
    } catch {
      try {
        fs.symlinkSync(source, dest, "dir");
      } catch {
        fs.cpSync(source, dest, { recursive: true });
      }
    }
  } else {
    // Archivo suelto (p. ej. un .o2r): NUNCA junction (en Windows crearía un
    // junction roto en silencio). Symlink de archivo y, si el SO no lo
    // permite (sin modo desarrollador), copia para que el juego pueda leerlo.
    try {
      fs.symlinkSync(source, dest, "file");
    } catch {
      fs.copyFileSync(source, dest);
    }
  }
}

/**
 * Borra un enlace/copia de mod del destino sin tocar el mod central ni su
 * contenido (un junction/symlink se elimina solo como enlace).
 */
function removeLinkedEntry(dest: string): void {
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

export function unlinkMod(cfg: AppConfig, manifest: Manifest, modName: string): void {
  removeLinkedEntry(path.join(modsLinkRoot(cfg, manifest), modName));
}

/** Link all centralized mods for a port (called after install/update/scan). */
export function linkAllMods(cfg: AppConfig, manifest: Manifest): string[] {
  if (!isInstalled(cfg, manifest.id)) return [];
  const linked: string[] = [];
  for (const mod of listCentralMods(cfg, manifest)) {
    if (!isModLinked(cfg, manifest, mod)) {
      try {
        linkMod(cfg, manifest, mod);
        linked.push(mod);
      } catch {
        // skip broken
      }
    }
  }
  return linked;
}

export function unlinkAllMods(cfg: AppConfig, manifest: Manifest): void {
  const destRoot = modsLinkRoot(cfg, manifest);
  if (!fs.existsSync(destRoot)) return;
  // Se borran los enlaces (junctions/symlinks) y las copias/archivos cuyo
  // nombre coincide con un mod central; los archivos propios del juego o del
  // usuario en el destino se respetan.
  const managed = new Set(listCentralMods(cfg, manifest));
  for (const entry of fs.readdirSync(destRoot, { withFileTypes: true })) {
    const full = path.join(destRoot, entry.name);
    if (entry.isSymbolicLink() || managed.has(entry.name)) removeLinkedEntry(full);
  }
}

/**
 * Keeps MODS/<gameDir> folders in sync with the installed ports:
 * creates the folder for installed ports and removes the empty
 * folders of uninstalled ones. Folders that contain user mods are
 * never deleted.
 */
export function syncModsFolders(cfg: AppConfig, manifests: Manifest[]): void {
  for (const manifest of manifests) {
    const root = centralModsRoot(cfg, manifest);
    if (isInstalled(cfg, manifest.id)) {
      fs.mkdirSync(root, { recursive: true });
      // Also ensure the link destination exists (e.g. the game's OS data dir).
      fs.mkdirSync(modsLinkRoot(cfg, manifest), { recursive: true });
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
