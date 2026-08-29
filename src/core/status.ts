import type { AppConfig } from './config';
import { isInstalled, resolveAssetForPlatform } from './installer';
import type { Manifest } from './manifest';
import { centralModsRoot, isModLinked, listCentralMods } from './mods';
import type { RomMatch, ScanResult } from './scanner';
import type { SelfUpdateInfo } from './selfupdate';
import { readState } from './state';
import { checkUpdate, type UpdateInfo } from './updater';
import { normalizeVersion } from './version';

export interface RomSlotStatus {
  /** Requirement id (e.g. "oot", "oot-mq"). */
  id: string;
  /** Human readable requirement name. */
  name: string;
  required: boolean;
  matched: boolean;
  romName: string | null;
  matchedBy: 'hash' | 'gameid' | 'name' | null;
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

export interface StatusResult {
  scan: ScanResult;
  ports: PortStatus[];
  self: SelfUpdateInfo | null;
}

/**
 * Normaliza los campos de una UpdateInfo para mostrarla: versiones sin el
 * prefijo "v" y notas no nulas (caches viejos no traen el campo).
 */
export function normalizeUpdateInfo(info: UpdateInfo): UpdateInfo {
  return {
    ...info,
    installed: normalizeVersion(info.installed) ?? info.installed,
    latest: normalizeVersion(info.latest) ?? info.latest,
    notes: info.notes ?? '',
  };
}

/** Normaliza los campos de una SelfUpdateInfo (versiones y notas). */
export function normalizeSelfUpdateInfo(info: SelfUpdateInfo): SelfUpdateInfo {
  return {
    ...info,
    current: normalizeVersion(info.current) ?? info.current,
    latest: normalizeVersion(info.latest) ?? info.latest,
    notes: info.notes ?? '',
  };
}

/** Agrupa los matches del scan por id de manifiesto y de requisito. */
function matchesByRequirement(scan: ScanResult): Map<string, Map<string, RomMatch>> {
  const grouped = new Map<string, Map<string, RomMatch>>();
  for (const match of scan.matches) {
    let byRequirement = grouped.get(match.manifest.id);
    if (!byRequirement) {
      byRequirement = new Map();
      grouped.set(match.manifest.id, byRequirement);
    }
    byRequirement.set(match.requirement.id, match);
  }
  return grouped;
}

/** Estado de los requisitos ROM de un manifiesto dado el scan. */
function romSlots(
  manifest: Manifest,
  matchesByRequirement: Map<string, RomMatch>,
): RomSlotStatus[] {
  return manifest.roms.map((requirement) => {
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
}

/** Compone el estado completo de un port (instalado, ROMs, mods, update). */
async function buildPortStatus(
  cfg: AppConfig,
  manifest: Manifest,
  matches: Map<string, RomMatch>,
): Promise<PortStatus> {
  const state = readState(cfg, manifest.id);
  const roms = romSlots(manifest, matches);
  const mods = listCentralMods(cfg, manifest);
  const updateInfo = state ? await checkUpdate(cfg, manifest) : null;
  return {
    manifest,
    installed: isInstalled(cfg, manifest.id),
    version: state?.version ?? null,
    roms,
    hasRom: roms.filter((slot) => slot.required).every((slot) => slot.matched),
    updateAvailable: !!updateInfo?.available,
    updateInfo: updateInfo ? normalizeUpdateInfo(updateInfo) : null,
    mods,
    linkedMods: mods.filter((mod) => isModLinked(cfg, manifest, mod)),
    modsRoot: centralModsRoot(cfg, manifest),
    platformSupported: !!resolveAssetForPlatform(manifest),
  };
}

/** Estado de todos los ports dado el scan (cada manifest -> PortStatus). */
export async function buildPortStatuses(
  cfg: AppConfig,
  manifests: Manifest[],
  scan: ScanResult,
): Promise<PortStatus[]> {
  const matches = matchesByRequirement(scan);
  return Promise.all(
    manifests.map((manifest) =>
      buildPortStatus(cfg, manifest, matches.get(manifest.id) ?? new Map()),
    ),
  );
}
