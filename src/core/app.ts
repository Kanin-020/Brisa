import * as fs from 'node:fs';
import { loadConfig, ensureDirs, type AppConfig } from './config';
import { installPort, launchExecutable, uninstallPort, portDir } from './installer';
import { listManifests, loadManifest, importManifests, type Manifest } from './manifest';
import {
  linkAllMods,
  listCentralMods,
  centralModsRoot,
  linkMod,
  unlinkMod,
  unlinkAllMods,
  syncModsFolders,
} from './mods';
import { scanRoms, type ScanResult, type RomFile } from './scanner';
import { listStates } from './state';
import { checkUpdate, applyUpdate, refreshRemoteManifests, type UpdateInfo } from './updater';
import { TaskManager, throwIfAborted } from './tasks';
import { checkSelfUpdate, applySelfUpdate, type SelfUpdateInfo } from './selfupdate';
import { detectPlatform } from './platform';
import { ensureSelfImageCopy, syncLaunchers, writeImagenHelper } from './launchers';
import { deleteRom, saveRomFile } from './roms';
import { openPathInFileManager } from './folders';
import {
  buildPortStatuses,
  normalizeSelfUpdateInfo,
  type PortStatus,
  type RomSlotStatus,
  type StatusResult,
} from './status';

// Re-export para compatibilidad con consumidores que importan los tipos desde app.
export type { PortStatus, RomSlotStatus, StatusResult };

/**
 * Fachada de la aplicación: expone una única API de alto nivel a la CLI, al
 * servidor web y a la app de escritorio. La lógica de bajo nivel vive en los
 * módulos de core (installer, launchers, mods, scanner, roms, …); aquí solo
 * se orquesta (patrón Facade sobre una arquitectura por capas).
 */
export class App {
  readonly config: AppConfig;
  /** Tareas de larga duración con progreso y cancelación (usadas por el servidor web). */
  readonly tasks = new TaskManager();

  /** Scan cache: evita re-escanear ROMs en requests sucesivos (~5s TTL). */
  private scanCache: { result: ScanResult; at: number } | null = null;
  private static SCAN_CACHE_TTL_MS = 5_000;

  /** Full status cache: evita re-ejecutar status() completo en requests rápidos (~3s TTL). */
  private statusCache: { result: StatusResult; at: number } | null = null;
  private static STATUS_CACHE_TTL_MS = 3_000;

  constructor() {
    this.config = loadConfig();
    ensureDirs(this.config);
  }

  /**
   * Inicialización explícita (una sola vez, desde los entry points: cli.ts y
   * desktop/main.ts). Mantiene sincronizados los artefactos derivados:
   * copia de la propia AppImage, ayudante image/imagen y launchers.
   */
  initialize(): void {
    // Primera ejecución: copiar el AppImage de la propia Brisa a image/ (en
    // Windows se crea el ayudante `image/imagen.cmd` para acceder al CLI).
    ensureSelfImageCopy(this.config);
    writeImagenHelper(this.config);
    // Recrear los launchers que falten para ports ya instalados.
    syncLaunchers(this.config);
  }

  get platform() {
    return detectPlatform();
  }

  manifests(): Manifest[] {
    return listManifests(this.config);
  }

  manifest(id: string): Manifest | null {
    return loadManifest(this.config, id);
  }

  async scan(): Promise<ScanResult> {
    if (this.scanCache && Date.now() - this.scanCache.at < App.SCAN_CACHE_TTL_MS) {
      return this.scanCache.result;
    }
    const result = await scanRoms(this.config);
    this.scanCache = { result, at: Date.now() };
    return result;
  }

  /** Invalida el caché de escaneo y status (llamar tras install/uninstall/upload). */
  invalidateScanCache(): void {
    this.scanCache = null;
    this.statusCache = null;
  }

  /**
   * Obtiene las ROMs disponibles para un port específico.
   * Retorna un mapa de requirementId -> RomFile con las ROMs que coinciden.
   */
  async getRomsForPort(portId: string): Promise<Record<string, RomFile>> {
    const { matches } = await this.scan();
    const romsByRequirement: Record<string, RomFile> = {};
    for (const match of matches) {
      if (match.manifest.id === portId) {
        romsByRequirement[match.requirement.id] = match.rom;
      }
    }
    return romsByRequirement;
  }

  async status(): Promise<StatusResult> {
    if (this.statusCache && Date.now() - this.statusCache.at < App.STATUS_CACHE_TTL_MS) {
      return this.statusCache.result;
    }
    const manifests = this.manifests();
    syncModsFolders(this.config, manifests);
    const scan = await this.scan();
    const ports = await buildPortStatuses(this.config, manifests, scan);
    const self = await checkSelfUpdate(this.config);
    const result: StatusResult = {
      scan,
      ports,
      self: self ? normalizeSelfUpdateInfo(self) : null,
    };
    this.statusCache = { result, at: Date.now() };
    return result;
  }

  async install(
    id: string,
    opts: { roms?: Record<string, RomFile>; signal?: AbortSignal } = {},
    onProgress?: (stage: string, done: number, total: number) => void,
  ) {
    const manifest = this.manifest(id);
    if (!manifest) throw new Error(`Port not found: ${id}`);
    const state = await installPort(this.config, manifest, { ...opts, onProgress });
    syncModsFolders(this.config, this.manifests());
    this.invalidateScanCache();
    return state;
  }

  uninstall(id: string) {
    const manifest = this.manifest(id);
    if (manifest) unlinkAllMods(this.config, manifest);
    uninstallPort(this.config, id);
    syncModsFolders(this.config, this.manifests());
    this.invalidateScanCache();
  }

  launch(id: string): string | null {
    return launchExecutable(this.config, id);
  }

  async update(
    id: string,
    opts: {
      signal?: AbortSignal;
      onProgress?: (stage: string, done: number, total: number) => void;
    } = {},
  ): Promise<UpdateInfo> {
    const manifest = this.manifest(id);
    if (!manifest) throw new Error(`Port not found: ${id}`);
    return applyUpdate(this.config, manifest, opts);
  }

  /**
   * Actualiza todos los ports instalados que tengan una versión más reciente
   * (secuencialmente, respetando cancelación y reportando por port).
   */
  async updateAll(
    opts: {
      signal?: AbortSignal;
      onPortStart?: (name: string) => void;
      onProgress?: (stage: string, done: number, total: number) => void;
    } = {},
  ): Promise<{ updated: number; results: UpdateInfo[] }> {
    const { signal, onPortStart, onProgress } = opts;
    const results: UpdateInfo[] = [];
    let updated = 0;
    for (const state of listStates(this.config)) {
      throwIfAborted(signal);
      const manifest = this.manifest(state.id);
      if (!manifest) continue;
      // Check con caché (no fuerza GitHub): respeta el límite de 60 req/h sin token.
      const info = await checkUpdate(this.config, manifest);
      if (!info || !info.available) continue;
      onPortStart?.(manifest.name);
      results.push(await applyUpdate(this.config, manifest, { signal, onProgress }));
      updated++;
    }
    return { updated, results };
  }

  /** Estado de actualización de la propia app (Brisa), cacheado 30 min. */
  async selfUpdateInfo(force = false): Promise<SelfUpdateInfo | null> {
    return checkSelfUpdate(this.config, force);
  }

  /** Descarga y aplica la nueva versión de Brisa (AppImage de Linux o instalador de Windows). */
  async selfUpdate(
    onProgress?: (stage: string, done: number, total: number) => void,
  ): Promise<SelfUpdateInfo> {
    return applySelfUpdate(this.config, (done, total) => onProgress?.('download', done, total));
  }

  async checkUpdate(id: string, force = false): Promise<UpdateInfo | null> {
    const manifest = this.manifest(id);
    if (!manifest) throw new Error(`Port not found: ${id}`);
    return checkUpdate(this.config, manifest, force);
  }

  async updatesAll(): Promise<UpdateInfo[]> {
    const out: UpdateInfo[] = [];
    for (const manifest of this.manifests()) {
      const info = await checkUpdate(this.config, manifest);
      if (info) out.push(info);
    }
    return out;
  }

  async refreshRegistry(): Promise<number> {
    return refreshRemoteManifests(this.config);
  }

  modsFor(id: string) {
    const manifest = this.manifest(id);
    if (!manifest) throw new Error(`Port not found: ${id}`);
    return {
      manifest,
      root: centralModsRoot(this.config, manifest),
      mods: listCentralMods(this.config, manifest),
    };
  }

  linkMod(id: string, modName: string) {
    const manifest = this.manifest(id);
    if (!manifest) throw new Error(`Port not found: ${id}`);
    linkMod(this.config, manifest, modName);
  }

  unlinkMod(id: string, modName: string) {
    const manifest = this.manifest(id);
    if (!manifest) throw new Error(`Port not found: ${id}`);
    unlinkMod(this.config, manifest, modName);
  }

  /** Desenlaza todos los mods centrales de un port (sin borrar los archivos). */
  unlinkAllMods(id: string) {
    const manifest = this.manifest(id);
    if (!manifest) throw new Error(`Port not found: ${id}`);
    unlinkAllMods(this.config, manifest);
  }

  relinkMods(id: string): string[] {
    const manifest = this.manifest(id);
    if (!manifest) throw new Error(`Port not found: ${id}`);
    return linkAllMods(this.config, manifest);
  }

  installed(): ReturnType<typeof listStates> {
    return listStates(this.config);
  }

  /** Stream an uploaded ROM file into the roms dir (see roms.saveRomFile). */
  async saveRomFile(
    name: string,
    source: NodeJS.ReadableStream,
  ): Promise<{ saved: boolean; skipped: boolean; name: string }> {
    const result = await saveRomFile(this.config, name, source);
    if (result.saved) this.invalidateScanCache();
    return result;
  }

  /** Delete a ROM file (path-traversal guard + cached hash invalidation). */
  deleteRom(file: string): void {
    deleteRom(this.config, file);
    this.invalidateScanCache();
  }

  /**
   * Import manifests (array or single object) into the manifests dir.
   * Entries with a missing/invalid id are skipped and reported.
   */
  importManifests(items: unknown[]): { imported: number; errors: string[]; warnings: string[] } {
    return importManifests(this.config, items);
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
  async openFolder(dir?: 'root' | 'roms' | 'mods' | 'manifests' | 'ports'): Promise<boolean> {
    let target = this.config.root;
    if (dir === 'roms') target = this.config.romsDir;
    else if (dir === 'mods') target = this.config.modsDir;
    else if (dir === 'manifests') target = this.config.manifestsDir;
    else if (dir === 'ports') target = this.config.portsDir;
    return openPathInFileManager(target);
  }

  /**
   * Open the central mods folder of a port (MODS/<gameDir>), creating it
   * if it does not exist yet.
   */
  async openPortModsFolder(id: string): Promise<boolean> {
    const manifest = this.manifest(id);
    if (!manifest) throw new Error(`Port not found: ${id}`);
    return openPathInFileManager(centralModsRoot(this.config, manifest));
  }

  /**
   * Open the port's install folder in the OS file manager. Only meaningful
   * for installed ports (the folder must exist).
   */
  async openPortFolder(id: string): Promise<boolean> {
    const manifest = this.manifest(id);
    if (!manifest) throw new Error(`Port not found: ${id}`);
    const dir = portDir(this.config, id);
    if (!fs.existsSync(dir)) {
      throw new Error(`El port ${manifest.name} no está instalado.`);
    }
    return openPathInFileManager(dir);
  }
}
