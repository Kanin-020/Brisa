import * as fs from "node:fs";
import * as path from "node:path";
import type { AppConfig } from "./config";
import { getLatestRelease } from "./github";
import { installPort } from "./installer";
import type { Manifest } from "./manifest";
import { readState, writeState } from "./state";

export interface UpdateInfo {
  id: string;
  name: string;
  installed: string;
  latest: string;
  available: boolean;
  checkedAt: number;
}

/** How often we hit the GitHub API per port. 60 req/hr unauthenticated. */
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 min

const cacheDir = (cfg: AppConfig) => path.join(cfg.cacheDir, "update-check");

function readCache(cfg: AppConfig, id: string): UpdateInfo | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(cacheDir(cfg), `${id}.json`), "utf8")) as UpdateInfo;
  } catch {
    return null;
  }
}

function writeCache(cfg: AppConfig, info: UpdateInfo): void {
  fs.mkdirSync(cacheDir(cfg), { recursive: true });
  fs.writeFileSync(path.join(cacheDir(cfg), `${info.id}.json`), JSON.stringify(info));
}

/**
 * Cached update check: only hits the GitHub API at most once per CHECK_INTERVAL_MS.
 * `force` bypasses the cache (used by the explicit `update` command).
 */
export async function checkUpdate(
  cfg: AppConfig,
  manifest: Manifest,
  force = false,
): Promise<UpdateInfo | null> {
  const state = readState(cfg, manifest.id);
  if (!state) return null;
  const cached = readCache(cfg, manifest.id);
  if (!force && cached && Date.now() - cached.checkedAt < CHECK_INTERVAL_MS) {
    return cached;
  }
  try {
    const release = await getLatestRelease(cfg, manifest.repo);
    const info: UpdateInfo = {
      id: manifest.id,
      name: manifest.name,
      installed: state.version,
      latest: release.tag,
      available: release.tag !== state.version,
      checkedAt: Date.now(),
    };
    writeCache(cfg, info);
    return info;
  } catch {
    // Network failure: fall back to cache or report unavailable.
    return (
      cached ?? {
        id: manifest.id,
        name: manifest.name,
        installed: state.version,
        latest: "?",
        available: false,
        checkedAt: Date.now(),
      }
    );
  }
}

export async function applyUpdate(cfg: AppConfig, manifest: Manifest): Promise<UpdateInfo> {
  // Reinstall over the existing install dir (installer handles backup + rom relink).
  const state = readState(cfg, manifest.id);
  // Multirom: re-link every previously linked ROM. Old single-rom states only
  // store romLinked, which maps to the first requirement (the required base).
  const linked: Record<string, string> = { ...(state?.romsLinked ?? {}) };
  if (Object.keys(linked).length === 0 && state?.romLinked) {
    const firstRequirementId = manifest.roms[0]?.id;
    if (firstRequirementId) linked[firstRequirementId] = state.romLinked;
  }
  const roms: Record<string, { path: string; name: string; size: number; sha1: string; gameId: null }> = {};
  for (const [requirementId, romPath] of Object.entries(linked)) {
    if (fs.existsSync(romPath)) {
      roms[requirementId] = { path: romPath, name: path.basename(romPath), size: 0, sha1: "", gameId: null };
    }
  }
  const newState = await installPort(cfg, manifest, { roms });
  const info: UpdateInfo = {
    id: manifest.id,
    name: manifest.name,
    installed: newState.version,
    latest: newState.version,
    available: false,
    checkedAt: Date.now(),
  };
  writeCache(cfg, info);
  return info;
}

/**
 * Remote manifest registry: fetch an index (JSON array of {id,url}) from
 * cfg.registryUrl and store each manifest under manifests/remote/<id>.json.
 */
export async function refreshRemoteManifests(cfg: AppConfig): Promise<number> {
  if (!cfg.registryUrl) return 0;
  const res = await fetch(cfg.registryUrl, { headers: { "User-Agent": "brisa" } });
  if (!res.ok) throw new Error(`Registry fetch failed: HTTP ${res.status}`);
  const data = (await res.json()) as Array<{ id: string; url: string }>;
  const dir = path.join(cfg.manifestsDir, "remote");
  fs.mkdirSync(dir, { recursive: true });
  let count = 0;
  for (const entry of data) {
    const r = await fetch(entry.url, { headers: { "User-Agent": "brisa" } });
    if (!r.ok) continue;
    const text = await r.text();
    fs.writeFileSync(path.join(dir, `${entry.id}.json`), text);
    count++;
  }
  return count;
}
