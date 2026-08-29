import * as fs from 'node:fs';
import * as path from 'node:path';
import { JsonCache } from './cache';
import { USER_AGENT } from './constants';
import type { AppConfig } from './config';
import { getLatestRelease } from './github';
import { installPort } from './installer';
import type { Manifest } from './manifest';
import { readState } from './state';

export interface UpdateInfo {
  id: string;
  name: string;
  installed: string;
  latest: string;
  available: boolean;
  /** Notas de la release nueva (changelog, markdown). Vacío si no hay. */
  notes: string;
  checkedAt: number;
}

/** Caché de comprobaciones por port (JsonCache con el intervalo global de 30 min). */
const updateCache = (config: AppConfig) =>
  new JsonCache<UpdateInfo>(path.join(config.cacheDir, 'update-check'));

/**
 * Cached update check: only hits the GitHub API at most once per 30 min.
 * `force` bypasses the cache (used by the explicit `update` command).
 */
export async function checkUpdate(
  config: AppConfig,
  manifest: Manifest,
  force = false,
): Promise<UpdateInfo | null> {
  const state = readState(config, manifest.id);
  if (!state) return null;
  const cache = updateCache(config);
  const cached = cache.read(manifest.id);
  if (!force && cached) {
    // Caches escritos por versiones anteriores no tienen `notes`.
    return { ...cached, notes: cached.notes ?? '' };
  }
  try {
    const release = await getLatestRelease(config, manifest.repo);
    const info: UpdateInfo = {
      id: manifest.id,
      name: manifest.name,
      installed: state.version,
      latest: release.tag,
      available: release.tag !== state.version,
      notes: release.body,
      checkedAt: Date.now(),
    };
    cache.write(manifest.id, info);
    return info;
  } catch {
    // Network failure: fall back to cache or report unavailable.
    const stale = cache.readStale(manifest.id);
    return stale
      ? { ...stale, notes: stale.notes ?? '' }
      : {
          id: manifest.id,
          name: manifest.name,
          installed: state.version,
          latest: '?',
          available: false,
          notes: '',
          checkedAt: Date.now(),
        };
  }
}

export interface ApplyUpdateOptions {
  signal?: AbortSignal;
  onProgress?: (stage: string, done: number, total: number) => void;
}

export async function applyUpdate(
  config: AppConfig,
  manifest: Manifest,
  opts: ApplyUpdateOptions = {},
): Promise<UpdateInfo> {
  // Reinstall over the existing install dir (installer handles backup + rom relink).
  const state = readState(config, manifest.id);
  // Multirom: re-link every previously linked ROM. Old single-rom states only
  // store romLinked, which maps to the first requirement (the required base).
  const linked: Record<string, string> = { ...(state?.romsLinked ?? {}) };
  if (Object.keys(linked).length === 0 && state?.romLinked) {
    const firstRequirementId = manifest.roms[0]?.id;
    if (firstRequirementId) linked[firstRequirementId] = state.romLinked;
  }
  const roms: Record<
    string,
    { path: string; name: string; size: number; sha1: string; gameId: null }
  > = {};
  for (const [requirementId, romPath] of Object.entries(linked)) {
    if (fs.existsSync(romPath)) {
      roms[requirementId] = {
        path: romPath,
        name: path.basename(romPath),
        size: 0,
        sha1: '',
        gameId: null,
      };
    }
  }
  const newState = await installPort(config, manifest, {
    roms,
    signal: opts.signal,
    onProgress: opts.onProgress,
  });
  const info: UpdateInfo = {
    id: manifest.id,
    name: manifest.name,
    installed: newState.version,
    latest: newState.version,
    available: false,
    notes: '',
    checkedAt: Date.now(),
  };
  updateCache(config).write(manifest.id, info);
  return info;
}

/**
 * Remote manifest registry: fetch an index (JSON array of {id,url}) from
 * config.registryUrl and store each manifest under manifests/remote/<id>.json.
 */
export async function refreshRemoteManifests(config: AppConfig): Promise<number> {
  if (!config.registryUrl) return 0;
  const res = await fetch(config.registryUrl, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Registry fetch failed: HTTP ${res.status}`);
  const data = (await res.json()) as Array<{ id: string; url: string }>;
  const dir = path.join(config.manifestsDir, 'remote');
  fs.mkdirSync(dir, { recursive: true });
  let count = 0;
  for (const entry of data) {
    const r = await fetch(entry.url, { headers: { 'User-Agent': USER_AGENT } });
    if (!r.ok) continue;
    const text = await r.text();
    fs.writeFileSync(path.join(dir, `${entry.id}.json`), text);
    count++;
  }
  return count;
}
