import { loadConfig, ensureDirs, type AppConfig } from "./config";
import { isInstalled, installPort, launchExecutable, uninstallPort, resolveAssetForPlatform } from "./installer";
import { listManifests, loadManifest, type Manifest } from "./manifest";
import { linkAllMods, listCentralMods, centralModsRoot, linkMod, unlinkMod, unlinkAllMods, isModLinked, syncModsFolders } from "./mods";
import { scanRoms, matchRomPath, type RomMatch, type ScanResult, type RomFile } from "./scanner";
import { readState, listStates } from "./state";
import { checkUpdate, applyUpdate, refreshRemoteManifests, type UpdateInfo } from "./updater";
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

  async status(): Promise<{ scan: ScanResult; ports: PortStatus[] }> {
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
    return { scan, ports };
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
}
