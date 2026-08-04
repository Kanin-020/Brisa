import * as fs from "node:fs";
import * as path from "node:path";
import type { AppConfig } from "./config";
import { anyMatch, matchGlob } from "./glob";
import { sha1File, fileFingerprint } from "./hash";
import type { Manifest, RomRequirement } from "./manifest";
import { readDiscGameId } from "./discid";

export interface RomFile {
  /** Absolute path of the ROM file in the roms dir. */
  path: string;
  /** File name (basename). */
  name: string;
  size: number;
  sha1: string;
  /** 6-char GC/Wii disc game ID (e.g. "GZ2E01"), or null if not readable. */
  gameId: string | null;
}

export interface RomMatch {
  manifest: Manifest;
  requirement: RomRequirement;
  rom: RomFile;
  matchedBy: "hash" | "gameid" | "name";
}

export interface ScanResult {
  roms: RomFile[];
  matches: RomMatch[];
  /** Manifests for which no ROM was found. */
  missing: Manifest[];
}

/** Walk the roms dir recursively. */
export function collectRomFiles(cfg: AppConfig): string[] {
  if (!fs.existsSync(cfg.romsDir)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(full);
    }
  };
  walk(cfg.romsDir);
  return out;
}

async function hashWithCache(cfg: AppConfig, file: string): Promise<string> {
  const key = file.replace(/[^a-zA-Z0-9]/g, "_");
  const cacheFile = path.join(cfg.cacheDir, "hashes", `${key}.json`);
  const fp = fileFingerprint(file);
  try {
    const cached = JSON.parse(fs.readFileSync(cacheFile, "utf8")) as {
      size: number;
      mtimeMs: number;
      sha1: string;
    };
    if (cached.size === fp.size && Math.abs(cached.mtimeMs - fp.mtimeMs) < 1000) {
      return cached.sha1;
    }
  } catch {
    // no cache
  }
  const sha1 = await sha1File(file);
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify({ ...fp, sha1 }));
  return sha1;
}

export async function scanRoms(cfg: AppConfig): Promise<ScanResult> {
  const roms: RomFile[] = [];
  for (const f of collectRomFiles(cfg)) {
    const st = fs.statSync(f);
    if (st.size === 0) continue;
    const sha1 = await hashWithCache(cfg, f);
    roms.push({ path: f, name: path.basename(f), size: st.size, sha1, gameId: readDiscGameId(f) });
  }

  const manifests = listManifestsLocal(cfg);
  const matches: RomMatch[] = [];
  const missing: Manifest[] = [];

  for (const m of manifests) {
    // A ROM already claimed by an earlier requirement of this same manifest
    // can't satisfy a later one (multirom manifests like SoH base + MQ).
    const used = new Set<string>();
    let anyMatched = false;
    for (const req of m.roms) {
      // 1) Hash match: authoritative when the manifest provides hashes, so a
      // generic name pattern can never claim the wrong ROM.
      let chosen: RomFile | null = null;
      let matchedBy: "hash" | "gameid" | "name" | null = null;
      if (req.sha1.length > 0) {
        const byHash = roms.find((r) => !used.has(r.path) && req.sha1.includes(r.sha1));
        if (byHash) {
          chosen = byHash;
          matchedBy = "hash";
        }
      }
      // 2) Game ID match: authoritative when the manifest lists game IDs. The
      // ID is read from the disc header, so it works across .iso/.rvz/.gcz
      // even though their SHA1 differs due to compression.
      if (!chosen && (req.gameIds?.length ?? 0) > 0) {
        const byGameId = roms.find(
          (r) => !used.has(r.path) && r.gameId !== null && req.gameIds!.includes(r.gameId),
        );
        if (byGameId) {
          chosen = byGameId;
          matchedBy = "gameid";
        }
      }
      // 3) Name pattern match: fallback only when there is nothing to verify
      // against, or when the matching files could not be verified (unknown
      // disc format). Ranked by pattern specificity (e.g. "tp.iso" beats
      // "*.iso") so the most likely file is picked instead of the first one.
      // The game ID filter only applies when the manifest opted into game ID
      // verification; name-only manifests keep their previous behavior.
      if (!chosen && req.sha1.length === 0) {
        const byName = roms.filter((r) => !used.has(r.path) && anyMatch(req.patterns, r.name));
        const candidates =
          (req.gameIds?.length ?? 0) > 0 ? byName.filter((r) => r.gameId === null) : byName;
        if (candidates.length > 0) {
          chosen = pickBestNameMatch(candidates, req.patterns);
          matchedBy = "name";
        }
      }
      if (chosen) {
        used.add(chosen.path);
        matches.push({
          manifest: m,
          requirement: req,
          rom: chosen,
          matchedBy: matchedBy!,
        });
        anyMatched = true;
      }
    }
    if (!anyMatched) missing.push(m);
  }

  return { roms, matches, missing };
}

/** Glob metacharacters that make a pattern non-literal. */
const WILDCARD_RE = /[*?{}\[\]]/;

/**
 * Score how specific a filename match is for the given patterns.
 * Literal patterns (no wildcards) rank highest; among wildcard patterns,
 * a longer literal prefix wins (e.g. "mm.z64" beats "*.z64").
 */
function patternSpecificity(patterns: string[], name: string): number {
  let best = -1;
  for (const p of patterns) {
    if (!matchGlob(p, name)) continue;
    const literalLen = p.split(WILDCARD_RE)[0].length;
    const isLiteral = !WILDCARD_RE.test(p);
    best = Math.max(best, isLiteral ? 1000 + literalLen : literalLen);
  }
  return best;
}

/** Pick the candidate with the most specific pattern match (ties keep first). */
function pickBestNameMatch(candidates: RomFile[], patterns: string[]): RomFile {
  let best = candidates[0];
  let bestScore = -1;
  for (const r of candidates) {
    const score = patternSpecificity(patterns, r.name);
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

import { listManifests } from "./manifest";
function listManifestsLocal(cfg: AppConfig): Manifest[] {
  return listManifests(cfg);
}
