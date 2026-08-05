import * as fs from "node:fs";
import * as path from "node:path";
import { loadConfig, ensureDirs, type AppConfig } from "./config";
import { isInstalled, installPort, launchExecutable, uninstallPort, resolveAssetForPlatform, portDir } from "./installer";
import { listManifests, loadManifest, type Manifest } from "./manifest";
import { linkAllMods, listCentralMods, centralModsRoot, linkMod, unlinkMod, unlinkAllMods, isModLinked, syncModsFolders } from "./mods";
import { scanRoms, matchRomPath, type RomMatch, type ScanResult, type RomFile } from "./scanner";
import { readState, listStates, writeState } from "./state";
import { checkUpdate, applyUpdate, refreshRemoteManifests, type UpdateInfo } from "./updater";
import { checkSelfUpdate, applySelfUpdate, type SelfUpdateInfo } from "./selfupdate";
import { detectPlatform } from "./platform";

export interface RomSlotStatus {
  /** Requirement id (e.g. "oot", "oot-mq"). */
  id: string;
  /** Human readable requirement name. */
  name: string;
  required: boolean;
  matched: boolean;
  romName: string | null;
  matchedBy: "hash" | "gameid" | "name" | null;
}

export interface PortStatus {
  manifest: Manifest;
  installed: boolean;
  version: string | null;
  /** Per-ROM-requirement status (multirom manifests show one slot each). */
  roms: RomSlotStatus[];
  /** True when every *required* ROM requirement is matched (installable). */
  hasRom: boolean;
  updateAvailable: boolean;
  updateInfo: UpdateInfo | null;
  mods: string[];
  linkedMods: string[];
  modsRoot: string;
  platformSupported: boolean;
}

export class App {
  readonly cfg: AppConfig;

  constructor() {
    this.cfg = loadConfig();
    ensureDirs(this.cfg);
  }

  get platform() {
    return detectPlatform();
  }

  manifests(): Manifest[] {
    return listManifests(this.cfg);
  }

  manifest(id: string): Manifest | null {
    return loadManifest(this.cfg, id);
  }

  async scan(): Promise<ScanResult> {
    return scanRoms(this.cfg);
  }

  /**
   * Resolve an arbitrary ROM file (e.g. the path Steam ROM Manager passes
   * to `launch`) to the port(s) that can play it, sorted by reliability.
   */
  async resolveRom(file: string): Promise<RomMatch[]> {
    return matchRomPath(this.cfg, file);
  }

  async status(): Promise<{ scan: ScanResult; ports: PortStatus[]; self: SelfUpdateInfo | null }> {
    const manifests = this.manifests();
    syncModsFolders(this.cfg, manifests);
    const scan = await this.scan();
    const reqMatches = new Map<string, Map<string, RomMatch>>();
    for (const mm of scan.matches) {
      let byReq = reqMatches.get(mm.manifest.id);
      if (!byReq) {
        byReq = new Map();
        reqMatches.set(mm.manifest.id, byReq);
      }
      byReq.set(mm.requirement.id, mm);
    }
    const ports: PortStatus[] = [];
    for (const m of manifests) {
      const state = readState(this.cfg, m.id);
      const byReq = reqMatches.get(m.id) ?? new Map<string, RomMatch>();
      const roms: RomSlotStatus[] = m.roms.map((req) => {
        const mm = byReq.get(req.id);
        return {
          id: req.id,
          name: req.name,
          required: req.required !== false,
          matched: !!mm,
          romName: mm?.rom.name ?? null,
          matchedBy: mm?.matchedBy ?? null,
        };
      });
      const mods = listCentralMods(this.cfg, m);
      const updateInfo = state ? await checkUpdate(this.cfg, m) : null;
      ports.push({
        manifest: m,
        installed: isInstalled(this.cfg, m.id),
        version: state?.version ?? null,
        roms,
        hasRom: roms.filter((s) => s.required).every((s) => s.matched),
        updateAvailable: !!updateInfo?.available,
        updateInfo,
        mods,
        linkedMods: mods.filter((mod) => isModLinked(this.cfg, m, mod)),
        modsRoot: centralModsRoot(this.cfg, m),
        platformSupported: !!resolveAssetForPlatform(m),
      });
    }
    const self = await checkSelfUpdate(this.cfg);
    return { scan, ports, self };
  }

  async install(
    id: string,
    opts: { roms?: Record<string, RomFile> } = {},
    onProgress?: (stage: string, done: number, total: number) => void,
  ) {
    const m = this.manifest(id);
    if (!m) throw new Error(`Port not found: ${id}`);
    const state = await installPort(this.cfg, m, { ...opts, onProgress });
    syncModsFolders(this.cfg, this.manifests());
    return state;
  }

  uninstall(id: string) {
    const m = this.manifest(id);
    if (m) unlinkAllMods(this.cfg, m);
    uninstallPort(this.cfg, id);
    syncModsFolders(this.cfg, this.manifests());
  }

  launch(id: string): string | null {
    return launchExecutable(this.cfg, id);
  }

  async update(id: string): Promise<UpdateInfo> {
    const m = this.manifest(id);
    if (!m) throw new Error(`Port not found: ${id}`);
    return applyUpdate(this.cfg, m);
  }

  /** Estado de actualización de la propia app (Brisa), cacheado 30 min. */
  async selfUpdateInfo(force = false): Promise<SelfUpdateInfo | null> {
    return checkSelfUpdate(this.cfg, force);
  }

  /** Descarga y aplica la nueva AppImage de Brisa (solo Linux AppImage). */
  async selfUpdate(
    onProgress?: (stage: string, done: number, total: number) => void,
  ): Promise<SelfUpdateInfo> {
    return applySelfUpdate(this.cfg, (done, total) => onProgress?.("download", done, total));
  }

  async checkUpdate(id: string, force = false): Promise<UpdateInfo | null> {
    const m: Manifest | null = this.manifest(id);
    if (!m) throw new Error(`Port not found: ${id}`);
    return checkUpdate(this.cfg, m, force);
  }

  async updatesAll(): Promise<UpdateInfo[]> {
    const out: UpdateInfo[] = [];
    for (const m of this.manifests()) {
      const info = await checkUpdate(this.cfg, m);
      if (info) out.push(info);
    }
    return out;
  }

  async refreshRegistry(): Promise<number> {
    return refreshRemoteManifests(this.cfg);
  }

  modsFor(id: string) {
    const m = this.manifest(id);
    if (!m) throw new Error(`Port not found: ${id}`);
    return { manifest: m, root: centralModsRoot(this.cfg, m), mods: listCentralMods(this.cfg, m) };
  }

  linkMod(id: string, modName: string) {
    const m = this.manifest(id);
    if (!m) throw new Error(`Port not found: ${id}`);
    linkMod(this.cfg, m, modName);
  }

  unlinkMod(id: string, modName: string) {
    const m = this.manifest(id);
    if (!m) throw new Error(`Port not found: ${id}`);
    unlinkMod(this.cfg, m, modName);
  }

  relinkMods(id: string): string[] {
    const m = this.manifest(id);
    if (!m) throw new Error(`Port not found: ${id}`);
    return linkAllMods(this.cfg, m);
  }

  installed(): ReturnType<typeof listStates> {
    return listStates(this.cfg);
  }

  /** True when `target` is `dir` itself or lives inside it. */
  private isInside(dir: string, target: string): boolean {
    const root = path.resolve(dir);
    const abs = path.resolve(target);
    return abs === root || abs.startsWith(root + path.sep);
  }

  /**
   * Stream an uploaded ROM file into the roms dir (avoiding loading whole
   * multi-GB dumps into memory). Existing files are NOT overwritten — a
   * dropped file that already exists is reported as skipped.
   */
  saveRomFile(
    name: string,
    source: NodeJS.ReadableStream,
  ): Promise<{ saved: boolean; skipped: boolean; name: string }> {
    return new Promise((resolve, reject) => {
      const safe = path.basename(name);
      const romsRoot = path.resolve(this.cfg.romsDir);
      const dest = path.join(romsRoot, safe);
      if (!this.isInside(romsRoot, dest)) {
        reject(new Error(`Nombre de archivo no válido: ${name}`));
        return;
      }
      fs.mkdirSync(romsRoot, { recursive: true });
      if (fs.existsSync(dest)) {
        source.resume(); // consumir el cuerpo para reutilizar la conexión
        resolve({ saved: false, skipped: true, name: safe });
        return;
      }
      const part = `${dest}.part`;
      const cleanup = () => {
        try {
          fs.rmSync(part, { force: true });
        } catch {
          /* ignore */
        }
      };
      const out = fs.createWriteStream(part);
      const fail = (err: Error) => {
        cleanup();
        reject(err);
      };
      out.on("error", fail);
      source.on("error", fail);
      out.on("finish", () => {
        try {
          if (out.bytesWritten === 0) {
            cleanup();
            reject(new Error("Archivo vacío"));
            return;
          }
          fs.renameSync(part, dest);
          resolve({ saved: true, skipped: false, name: safe });
        } catch (e) {
          cleanup();
          reject(e as Error);
        }
      });
      source.pipe(out);
    });
  }

  /**
   * Delete a ROM file. Only files inside the roms dir are accepted (path
   * traversal guard). Also invalidates the cached SHA1 so the next scan
   * starts clean.
   */
  deleteRom(file: string): void {
    const abs = path.resolve(file);
    if (!this.isInside(this.cfg.romsDir, abs)) {
      throw new Error(`Ruta fuera de la carpeta de ROMs: ${file}`);
    }
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      throw new Error(`No es un archivo: ${file}`);
    }
    fs.rmSync(abs, { force: true });
    const key = abs.replace(/[^a-zA-Z0-9]/g, "_");
    const cacheFile = path.join(this.cfg.cacheDir, "hashes", `${key}.json`);
    if (fs.existsSync(cacheFile)) fs.rmSync(cacheFile, { force: true });
    // Quitar symlinks colgantes de ports instalados que apuntaban a este ROM.
    this.unlinkDeletedRom(abs);
  }

  /**
   * Cuando se borra un ROM, elimina los symlinks que los ports instalados
   * tenían hacia él (y limpia el estado romsLinked) para no dejar enlaces
   * rotos en las carpetas de los ports. No depende del manifiesto: recorre
   * el árbol del port y borra cualquier symlink cuyo destino real sea el
   * archivo borrado.
   */
  private unlinkDeletedRom(deleted: string): void {
    for (const st of listStates(this.cfg)) {
      const portRoot = portDir(this.cfg, st.id);
      if (!fs.existsSync(portRoot)) continue;
      let changed = false;

      const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(full);
            continue;
          }
          // readlink funciona incluso con symlinks rotos (el destino ya
          // no existe), a diferencia de realpathSync que lanza ENOENT.
          if (entry.isSymbolicLink()) {
            try {
              const target = fs.readlinkSync(full);
              if (path.resolve(path.dirname(full), target) === deleted) {
                fs.rmSync(full, { force: true });
                changed = true;
              }
            } catch {
              // enlace inaccesible: ignorar
            }
          }
        }
      };
      walk(portRoot);

      // Limpiar las referencias al ROM en el estado del port.
      const links = { ...(st.romsLinked ?? {}) };
      for (const [reqId, romPath] of Object.entries(links)) {
        if (path.resolve(romPath) === deleted) delete links[reqId];
      }
      const stateRefChanged =
        (st.romLinked !== null && path.resolve(st.romLinked) === deleted) ||
        Object.keys(links).length !== Object.keys(st.romsLinked ?? {}).length;
      if (changed || stateRefChanged) {
        const state = readState(this.cfg, st.id);
        if (state) {
          state.romsLinked = Object.keys(links).length > 0 ? links : undefined;
          state.romLinked = null;
          writeState(this.cfg, state);
        }
      }
    }
  }

  /**
   * Import manifests (array or single object) into the manifests dir.
   * Entries with a missing/invalid id are skipped and reported.
   */
  importManifests(items: unknown[]): { imported: number; errors: string[]; warnings: string[] } {
    const ID_RE = /^[A-Za-z0-9._-]+$/;
    const errors: string[] = [];
    const warnings: string[] = [];
    let imported = 0;
    fs.mkdirSync(this.cfg.manifestsDir, { recursive: true });
    for (const item of items) {
      const m = item as Record<string, unknown> | null;
      if (!m || typeof m !== "object" || typeof m.id !== "string" || !ID_RE.test(m.id)) {
        errors.push("manifiesto con id inválido (omitido)");
        continue;
      }
      try {
        fs.writeFileSync(
          path.join(this.cfg.manifestsDir, `${m.id}.json`),
          JSON.stringify(m, null, 2) + "\n",
        );
        imported++;
        if (fs.existsSync(path.join(this.cfg.manifestsDir, "remote", `${m.id}.json`))) {
          warnings.push(`${m.id}: existe una versión remota que tiene prioridad`);
        }
      } catch (e) {
        errors.push(`${m.id}: ${(e as Error).message}`);
      }
    }
    return { imported, errors, warnings };
  }

  /** All manifests as plain data (for export). */
  exportManifests(): Manifest[] {
    return this.manifests();
  }

  /**
   * Open a Brisa folder in the OS file manager. Uses Electron's shell when
   * running inside the desktop app, and falls back to the platform opener
   * (xdg-open / open / explorer) otherwise.
   */
  async openFolder(dir?: "root" | "roms" | "mods" | "manifests" | "ports"): Promise<boolean> {
    let target = this.cfg.root;
    if (dir === "roms") target = this.cfg.romsDir;
    else if (dir === "mods") target = this.cfg.modsDir;
    else if (dir === "manifests") target = this.cfg.manifestsDir;
    else if (dir === "ports") target = this.cfg.portsDir;
    return this.openPath(target);
  }

  /**
   * Open the central mods folder of a port (MODS/<gameDir>), creating it
   * if it does not exist yet.
   */
  async openPortModsFolder(id: string): Promise<boolean> {
    const m = this.manifest(id);
    if (!m) throw new Error(`Port not found: ${id}`);
    return this.openPath(centralModsRoot(this.cfg, m));
  }

  /** Opens an arbitrary path in the OS file manager (Electron or platform opener). */
  private async openPath(target: string): Promise<boolean> {
    fs.mkdirSync(target, { recursive: true });

    // Desktop (proceso principal de Electron): usar shell.openPath.
    try {
      const electron = require("electron") as { shell?: { openPath(p: string): Promise<string> } };
      if (electron && typeof electron === "object" && electron.shell) {
        const err = await electron.shell.openPath(target);
        return err === "" || err === undefined;
      }
    } catch {
      // Fuera de Electron (modo CLI/navegador).
    }

    const { spawn } = require("node:child_process") as typeof import("node:child_process");
    const opener =
      process.platform === "win32"
        ? "explorer"
        : process.platform === "darwin"
          ? "open"
          : "xdg-open";
    return new Promise((resolve) => {
      try {
        const child = spawn(opener, [target], { detached: true, stdio: "ignore" });
        child.on("error", () => resolve(false));
        child.on("exit", () => resolve(true));
        child.unref();
      } catch {
        resolve(false);
      }
    });
  }
}
