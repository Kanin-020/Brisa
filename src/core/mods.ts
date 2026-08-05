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

export function linkMod(cfg: AppConfig, m: Manifest, modName: string): void {
  const src = path.join(centralModsRoot(cfg, m), modName);
  if (!fs.existsSync(src)) throw new Error(`Mod not found in MODS/${m.mods.gameDir}: ${modName}`);
  const dest = path.join(modsLinkRoot(cfg, m), modName);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
  try {
    fs.symlinkSync(src, dest, "junction");
  } catch {
    fs.symlinkSync(src, dest);
  }
}

export function unlinkMod(cfg: AppConfig, m: Manifest, modName: string): void {
  const dest = path.join(modsLinkRoot(cfg, m), modName);
  if (fs.existsSync(dest) || fs.lstatSync(dest, { throwIfNoEntry: false })) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
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
  for (const entry of fs.readdirSync(destRoot, { withFileTypes: true })) {
    const full = path.join(destRoot, entry.name);
    if (entry.isSymbolicLink()) fs.rmSync(full, { force: true });
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
