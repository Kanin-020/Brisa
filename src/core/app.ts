import * as fs from "node:fs";
import * as path from "node:path";
import { loadConfig, ensureDirs, type AppConfig } from "./config";
import { isInstalled, installPort, launchExecutable, uninstallPort, resolveAssetForPlatform, portDir } from "./installer";
import { listManifests, loadManifest, type Manifest } from "./manifest";
import { linkAllMods, listCentralMods, centralModsRoot, linkMod, unlinkMod, unlinkAllMods, isModLinked, syncModsFolders } from "./mods";
import { scanRoms, type RomMatch, type ScanResult, type RomFile } from "./scanner";
import { readState, listStates } from "./state";
import { checkUpdate, applyUpdate, refreshRemoteManifests, type UpdateInfo } from "./updater";
import { TaskManager, throwIfAborted } from "./tasks";
import { checkSelfUpdate, applySelfUpdate, type SelfUpdateInfo } from "./selfupdate";
import { detectPlatform } from "./platform";
import { ensureSelfImageCopy, syncLaunchers, writeImagenHelper } from "./launchers";
import { deleteRom, saveRomFile } from "./roms";
import { openPathInFileManager } from "./folders";
import { normalizeVersion } from "./version";

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

/**
 * Fachada de la aplicación: expone una única API de alto nivel a la CLI, al
 * servidor web y a la app de escritorio. La lógica de bajo nivel vive en los
 * módulos de core (installer, launchers, mods, scanner, roms, …); aquí solo
 * se orquesta.
 */
export class App {
  readonly cfg: AppConfig;
  /** Tareas de larga duración con progreso y cancelación (usadas por el servidor web). */
  readonly tasks = new TaskManager();

  constructor() {
    this.cfg = loadConfig();
    ensureDirs(this.cfg);
  }

  /**
   * Inicialización explícita (una sola vez, desde los entry points: cli.ts y
   * desktop/main.ts). Mantiene sincronizados los artefactos derivados:
   * copia de la propia AppImage, ayudante image/imagen y launchers.
   */
  initialize(): void {
    // Primera ejecución: copiar el AppImage de la propia Brisa a image/ (en
    // Windows se crea el ayudante `image/imagen.cmd` para acceder al CLI).
    ensureSelfImageCopy(this.cfg);
    writeImagenHelper(this.cfg);
    // Recrear los launchers que falten para ports ya instalados.
    syncLaunchers(this.cfg);
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

  async status(): Promise<{ scan: ScanResult; ports: PortStatus[]; self: SelfUpdateInfo | null }> {
    const manifests = this.manifests();
    syncModsFolders(this.cfg, manifests);
    const scan = await this.scan();
    const requirementMatches = new Map<string, Map<string, RomMatch>>();
    for (const match of scan.matches) {
      let matchesByRequirement = requirementMatches.get(match.manifest.id);
      if (!matchesByRequirement) {
        matchesByRequirement = new Map();
        requirementMatches.set(match.manifest.id, matchesByRequirement);
      }
      matchesByRequirement.set(match.requirement.id, match);
    }
    const ports: PortStatus[] = [];
    for (const manifest of manifests) {
      const state = readState(this.cfg, manifest.id);
      const matchesByRequirement = requirementMatches.get(manifest.id) ?? new Map<string, RomMatch>();
      const roms: RomSlotStatus[] = manifest.roms.map((requirement) => {
        const match = matchesByRequirement.get(requirement.id);
        return {
          id: requirement.id,
          name: requirement.name,
          required: requirement.required !== false,
          matched: !!match,
          romName: match?.rom.name ?? null,
          matchedBy: match?.matchedBy ?? null,
        };
      });
      const mods = listCentralMods(this.cfg, manifest);
      const updateInfo = state ? await checkUpdate(this.cfg, manifest) : null;
      ports.push({
        manifest,
        installed: isInstalled(this.cfg, manifest.id),
        version: state?.version ?? null,
        roms,
        hasRom: roms.filter((slot) => slot.required).every((slot) => slot.matched),
        updateAvailable: !!updateInfo?.available,
        // Normaliza también lo cacheados (escritos por versiones anteriores),
        // para que el frontend siempre reciba versiones "x.x.x" y notas
        // (caches viejos sin el campo).
        updateInfo: updateInfo
          ? {
              ...updateInfo,
              installed: normalizeVersion(updateInfo.installed) ?? updateInfo.installed,
              latest: normalizeVersion(updateInfo.latest) ?? updateInfo.latest,
              notes: updateInfo.notes ?? "",
            }
          : null,
        mods,
        linkedMods: mods.filter((mod) => isModLinked(this.cfg, manifest, mod)),
        modsRoot: centralModsRoot(this.cfg, manifest),
        platformSupported: !!resolveAssetForPlatform(manifest),
      });
    }
    const self = await checkSelfUpdate(this.cfg);
    return {
      scan,
      ports,
      self: self
        ? {
            ...self,
            current: normalizeVersion(self.current) ?? self.current,
            latest: normalizeVersion(self.latest) ?? self.latest,
            notes: self.notes ?? "",
          }
        : null,
    };
  }

  async install(
    id: string,
    opts: { roms?: Record<string, RomFile>; signal?: AbortSignal } = {},
    onProgress?: (stage: string, done: number, total: number) => void,
  ) {
    const manifest = this.manifest(id);
    if (!manifest) throw new Error(`Port not found: ${id}`);
    const state = await installPort(this.cfg, manifest, { ...opts, onProgress });
    syncModsFolders(this.cfg, this.manifests());
    return state;
  }

  uninstall(id: string) {
    const manifest = this.manifest(id);
    if (manifest) unlinkAllMods(this.cfg, manifest);
    uninstallPort(this.cfg, id);
    syncModsFolders(this.cfg, this.manifests());
  }

  launch(id: string): string | null {
    return launchExecutable(this.cfg, id);
  }

  async update(
    id: string,
    opts: { signal?: AbortSignal; onProgress?: (stage: string, done: number, total: number) => void } = {},
  ): Promise<UpdateInfo> {
    const manifest = this.manifest(id);
    if (!manifest) throw new Error(`Port not found: ${id}`);
    return applyUpdate(this.cfg, manifest, opts);
  }

  /**
   * Actualiza todos los ports instalados que tengan una versión más reciente
   * (secuencialmente, respetando cancelación y reportando por port).
   */
  async updateAll(opts: {
    signal?: AbortSignal;
    onPortStart?: (name: string) => void;
    onProgress?: (stage: string, done: number, total: number) => void;
  } = {}): Promise<{ updated: number; results: UpdateInfo[] }> {
    const { signal, onPortStart, onProgress } = opts;
    const results: UpdateInfo[] = [];
    let updated = 0;
    for (const state of listStates(this.cfg)) {
      throwIfAborted(signal);
      const manifest = this.manifest(state.id);
      if (!manifest) continue;
      // Check con caché (no fuerza GitHub): respeta el límite de 60 req/h sin token.
      const info = await checkUpdate(this.cfg, manifest);
      if (!info || !info.available) continue;
      onPortStart?.(manifest.name);
      results.push(await applyUpdate(this.cfg, manifest, { signal, onProgress }));
      updated++;
    }
    return { updated, results };
  }

  /** Estado de actualización de la propia app (Brisa), cacheado 30 min. */
  async selfUpdateInfo(force = false): Promise<SelfUpdateInfo | null> {
    return checkSelfUpdate(this.cfg, force);
  }

  /** Descarga y aplica la nueva versión de Brisa (AppImage de Linux o instalador de Windows). */
  async selfUpdate(
    onProgress?: (stage: string, done: number, total: number) => void,
  ): Promise<SelfUpdateInfo> {
    return applySelfUpdate(this.cfg, (done, total) => onProgress?.("download", done, total));
  }

  async checkUpdate(id: string, force = false): Promise<UpdateInfo | null> {
    const manifest = this.manifest(id);
    if (!manifest) throw new Error(`Port not found: ${id}`);
    return checkUpdate(this.cfg, manifest, force);
  }

  async updatesAll(): Promise<UpdateInfo[]> {
    const out: UpdateInfo[] = [];
    for (const manifest of this.manifests()) {
      const info = await checkUpdate(this.cfg, manifest);
      if (info) out.push(info);
    }
    return out;
  }

  async refreshRegistry(): Promise<number> {
    return refreshRemoteManifests(this.cfg);
  }

  modsFor(id: string) {
    const manifest = this.manifest(id);
    if (!manifest) throw new Error(`Port not found: ${id}`);
    return {
      manifest,
      root: centralModsRoot(this.cfg, manifest),
      mods: listCentralMods(this.cfg, manifest),
    };
  }

  linkMod(id: string, modName: string) {
    const manifest = this.manifest(id);
    if (!manifest) throw new Error(`Port not found: ${id}`);
    linkMod(this.cfg, manifest, modName);
  }

  unlinkMod(id: string, modName: string) {
    const manifest = this.manifest(id);
    if (!manifest) throw new Error(`Port not found: ${id}`);
    unlinkMod(this.cfg, manifest, modName);
  }

  /** Desenlaza todos los mods centrales de un port (sin borrar los archivos). */
  unlinkAllMods(id: string) {
    const manifest = this.manifest(id);
    if (!manifest) throw new Error(`Port not found: ${id}`);
    unlinkAllMods(this.cfg, manifest);
  }

  relinkMods(id: string): string[] {
    const manifest = this.manifest(id);
    if (!manifest) throw new Error(`Port not found: ${id}`);
    return linkAllMods(this.cfg, manifest);
  }

  installed(): ReturnType<typeof listStates> {
    return listStates(this.cfg);
  }

  /** Stream an uploaded ROM file into the roms dir (see roms.saveRomFile). */
  saveRomFile(
    name: string,
    source: NodeJS.ReadableStream,
  ): Promise<{ saved: boolean; skipped: boolean; name: string }> {
    return saveRomFile(this.cfg, name, source);
  }

  /** Delete a ROM file (path-traversal guard + cached hash invalidation). */
  deleteRom(file: string): void {
    deleteRom(this.cfg, file);
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
      const raw = item as Record<string, unknown> | null;
      if (!raw || typeof raw !== "object" || typeof raw.id !== "string" || !ID_RE.test(raw.id)) {
        errors.push("manifiesto con id inválido (omitido)");
        continue;
      }
      try {
        fs.writeFileSync(
          path.join(this.cfg.manifestsDir, `${raw.id}.json`),
          JSON.stringify(raw, null, 2) + "\n",
        );
        imported++;
        if (fs.existsSync(path.join(this.cfg.manifestsDir, "remote", `${raw.id}.json`))) {
          warnings.push(`${raw.id}: existe una versión remota que tiene prioridad`);
        }
      } catch (e) {
        errors.push(`${raw.id}: ${(e as Error).message}`);
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
    const manifest = this.manifest(id);
    if (!manifest) throw new Error(`Port not found: ${id}`);
    return this.openPath(centralModsRoot(this.cfg, manifest));
  }

  /**
   * Open the port's install folder in the OS file manager. Only meaningful
   * for installed ports (the folder must exist).
   */
  async openPortFolder(id: string): Promise<boolean> {
    const manifest = this.manifest(id);
    if (!manifest) throw new Error(`Port not found: ${id}`);
    const dir = portDir(this.cfg, id);
    if (!fs.existsSync(dir)) {
      throw new Error(`El port ${manifest.name} no está instalado.`);
    }
    return this.openPath(dir);
  }

  /** Opens an arbitrary path in the OS file manager (Electron or platform opener). */
  private async openPath(target: string): Promise<boolean> {
    return openPathInFileManager(target);
  }
}
