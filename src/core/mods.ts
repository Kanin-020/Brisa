import * as fs from "node:fs";
import * as path from "node:path";
import type { AppConfig } from "./config";
import { portDir } from "./installer";
import type { Manifest } from "./manifest";

/**
 * Centralized mods live in MODS/<gameDir>/<modName>.
 * Each mod is symlinked into <portDir>/<mods.dir>/<modName>.
 */

export function centralModsRoot(cfg: AppConfig, m: Manifest): string {
  return path.join(cfg.modsDir, m.mods.gameDir);
}

export function listCentralMods(cfg: AppConfig, m: Manifest): string[] {
  const root = centralModsRoot(cfg, m);
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).map((e) => e.name).sort();
}

export function isModLinked(cfg: AppConfig, m: Manifest, modName: string): boolean {
  const link = path.join(portDir(cfg, m.id), m.mods.dir, modName);
  return fs.existsSync(link);
}

export function linkMod(cfg: AppConfig, m: Manifest, modName: string): void {
  const src = path.join(centralModsRoot(cfg, m), modName);
  if (!fs.existsSync(src)) throw new Error(`Mod not found in MODS/${m.mods.gameDir}: ${modName}`);
  const dest = path.join(portDir(cfg, m.id), m.mods.dir, modName);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
  try {
    fs.symlinkSync(src, dest, "junction");
  } catch {
    fs.symlinkSync(src, dest);
  }
}

export function unlinkMod(cfg: AppConfig, m: Manifest, modName: string): void {
  const dest = path.join(portDir(cfg, m.id), m.mods.dir, modName);
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
  const destRoot = path.join(portDir(cfg, m.id), m.mods.dir);
  if (!fs.existsSync(destRoot)) return;
  for (const entry of fs.readdirSync(destRoot, { withFileTypes: true })) {
    const full = path.join(destRoot, entry.name);
    if (entry.isSymbolicLink()) fs.rmSync(full, { force: true });
  }
}

function isInstalledDir(cfg: AppConfig, m: Manifest): boolean {
  return fs.existsSync(portDir(cfg, m.id)) && fs.existsSync(path.join(cfg.stateDir, `${m.id}.json`));
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
