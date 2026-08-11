import * as fs from "node:fs";
import * as path from "node:path";
import type { AppConfig } from "./config";
import { anyMatch, matchGlob } from "./glob";
import { sha1File, fileFingerprint, hashCacheFile } from "./hash";
import type { Manifest, RomRequirement } from "./manifest";
import { listManifests } from "./manifest";
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

/** SHA1 of a ROM file, cached by size + mtime so rescanning stays fast. */
async function sha1WithCache(cfg: AppConfig, file: string): Promise<string> {
  const cacheFile = hashCacheFile(cfg, file);
  const fingerprint = fileFingerprint(file);
  try {
    const cached = JSON.parse(fs.readFileSync(cacheFile, "utf8")) as {
      size: number;
      mtimeMs: number;
      sha1: string;
    };
    if (cached.size === fingerprint.size && Math.abs(cached.mtimeMs - fingerprint.mtimeMs) < 1000) {
      return cached.sha1;
    }
  } catch {
    // no cache
  }
  const sha1 = await sha1File(file);
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify({ ...fingerprint, sha1 }));
  return sha1;
}

export async function scanRoms(cfg: AppConfig): Promise<ScanResult> {
  const roms: RomFile[] = [];
  for (const file of collectRomFiles(cfg)) {
    const stat = fs.statSync(file);
    if (stat.size === 0) continue;
    const sha1 = await sha1WithCache(cfg, file);
    roms.push({ path: file, name: path.basename(file), size: stat.size, sha1, gameId: readDiscGameId(file) });
  }

  const manifests = listManifests(cfg);
  const matches: RomMatch[] = [];
  const missing: Manifest[] = [];

  for (const manifest of manifests) {
    // A ROM already claimed by an earlier requirement of this same manifest
    // can't satisfy a later one (multirom manifests like SoH base + MQ).
    const used = new Set<string>();
    let anyMatched = false;
    for (const requirement of manifest.roms) {
      // 1) Hash match: authoritative when the manifest provides hashes, so a
      // generic name pattern can never claim the wrong ROM.
      let chosen: RomFile | null = null;
      let matchedBy: "hash" | "gameid" | "name" | null = null;
      if (requirement.sha1.length > 0) {
        const byHash = roms.find((rom) => !used.has(rom.path) && requirement.sha1.includes(rom.sha1));
        if (byHash) {
          chosen = byHash;
          matchedBy = "hash";
        }
      }
      // 2) Game ID match: authoritative when the manifest lists game IDs. The
      // ID is read from the disc header, so it works across .iso/.rvz/.gcz
      // even though their SHA1 differs due to compression.
      if (!chosen && (requirement.gameIds?.length ?? 0) > 0) {
        const byGameId = roms.find(
          (rom) => !used.has(rom.path) && rom.gameId !== null && requirement.gameIds!.includes(rom.gameId),
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
      if (!chosen && requirement.sha1.length === 0) {
        const byName = roms.filter((rom) => !used.has(rom.path) && anyMatch(requirement.patterns, rom.name));
        const candidates =
          (requirement.gameIds?.length ?? 0) > 0 ? byName.filter((rom) => rom.gameId === null) : byName;
        if (candidates.length > 0) {
          chosen = pickBestNameMatch(candidates, requirement.patterns);
          matchedBy = "name";
        }
      }
      if (chosen) {
        used.add(chosen.path);
        matches.push({
          manifest,
          requirement,
          rom: chosen,
          matchedBy: matchedBy!,
        });
        anyMatched = true;
      }
    }
    if (!anyMatched) missing.push(manifest);
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
export function patternSpecificity(patterns: string[], name: string): number {
  let best = -1;
  for (const pattern of patterns) {
    if (!matchGlob(pattern, name)) continue;
    const literalLen = pattern.split(WILDCARD_RE)[0].length;
    const isLiteral = !WILDCARD_RE.test(pattern);
    best = Math.max(best, isLiteral ? 1000 + literalLen : literalLen);
  }
  return best;
}

/** Pick the candidate with the most specific pattern match (ties keep first). */
function pickBestNameMatch(candidates: RomFile[], patterns: string[]): RomFile {
  let best = candidates[0];
  let bestScore = -1;
  for (const rom of candidates) {
    const score = patternSpecificity(patterns, rom.name);
    if (score > bestScore) {
      bestScore = score;
      best = rom;
    }
  }
  return best;
}
