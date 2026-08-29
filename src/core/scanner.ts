import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AppConfig } from './config';
import { anyMatch, matchGlob } from './glob';
import { sha1File, fileFingerprint, hashCacheFile } from './hash';
import type { Manifest, RomRequirement } from './manifest';
import { listManifests } from './manifest';
import { readDiscGameId } from './discid';

async function parallelMap<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R | null>,
): Promise<R[]> {
  const results: R[] = [];
  let i = 0;

  async function worker(): Promise<void> {
    while (i < items.length) {
      const idx = i++;
      const result = await fn(items[idx]);
      if (result !== null) results.push(result);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

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
  matchedBy: 'hash' | 'gameid' | 'name';
}

export interface ScanResult {
  roms: RomFile[];
  matches: RomMatch[];
  /** Manifests for which no ROM was found. */
  missing: Manifest[];
}

/**
 * Recorre recursivamente todos los directorios de ROMs y retorna las rutas
 * absolutas de todos los archivos encontrados.
 */
export function collectRomFiles(config: AppConfig): string[] {
  const filePaths: string[] = [];

  const walkDirectory = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walkDirectory(fullPath);
      } else if (entry.isFile()) {
        filePaths.push(fullPath);
      }
    }
  };

  for (const romsDir of config.romsDirs) {
    if (!fs.existsSync(romsDir)) continue;
    walkDirectory(romsDir);
  }

  return filePaths;
}

/**
 * Calcula el SHA1 de un archivo ROM con caché basado en tamaño + mtime.
 * Esto permite que el escaneo repetido sea rápido sin recalcular hashes.
 */
async function sha1WithCache(config: AppConfig, filePath: string): Promise<string> {
  const cacheFilePath = hashCacheFile(config, filePath);
  const fileStats = fileFingerprint(filePath);

  // Intentar leer del caché
  try {
    const cachedData = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8')) as {
      size: number;
      mtimeMs: number;
      sha1: string;
    };

    // Verificar si el caché es válido (mismo tamaño y mtime cercano)
    const isCacheValid =
      cachedData.size === fileStats.size && Math.abs(cachedData.mtimeMs - fileStats.mtimeMs) < 1000;

    if (isCacheValid) {
      return cachedData.sha1;
    }
  } catch {
    // No hay caché válido, calcular SHA1
  }

  // Calcular SHA1 y guardar en caché
  const sha1Hash = await sha1File(filePath);
  fs.mkdirSync(path.dirname(cacheFilePath), { recursive: true });
  fs.writeFileSync(cacheFilePath, JSON.stringify({ ...fileStats, sha1: sha1Hash }));

  return sha1Hash;
}

/**
 * Escanea todos los directorios de ROMs, calcula hashes y matching contra
 * los manifiestos instalados.
 *
 * Retorna:
 * - roms: lista de todas las ROMs encontradas
 * - matches: ROMs que coinciden con algún manifiesto
 * - missing: manifiestos que no tienen ROM disponible
 */
export async function scanRoms(config: AppConfig): Promise<ScanResult> {
  const discoveredRoms: RomFile[] = [];

  // Descubrir archivos ROM y calcular hashes en paralelo (con límite de
  // concurrencia para no agotar file handles en directorios con miles de ROMs).
  const filePaths = collectRomFiles(config);
  const PARALLEL_HASH_LIMIT = 8;
  const romResults = await parallelMap(filePaths, PARALLEL_HASH_LIMIT, async (filePath) => {
    const fileStats = fs.statSync(filePath);
    if (fileStats.size === 0) return null;

    const sha1Hash = await sha1WithCache(config, filePath);
    return {
      path: filePath,
      name: path.basename(filePath),
      size: fileStats.size,
      sha1: sha1Hash,
      gameId: readDiscGameId(filePath),
    };
  });

  for (const result of romResults) {
    if (result) discoveredRoms.push(result);
  }

  // Realizar matching contra manifiestos
  const manifests = listManifests(config);
  const matchedRoms: RomMatch[] = [];
  const missingManifests: Manifest[] = [];

  for (const manifest of manifests) {
    const usedRoms = new Set<string>();
    let hasAnyMatch = false;

    for (const requirement of manifest.roms) {
      const matchResult = findMatchingRom(discoveredRoms, requirement, usedRoms);

      if (matchResult) {
        usedRoms.add(matchResult.rom.path);
        matchedRoms.push({
          manifest,
          requirement,
          rom: matchResult.rom,
          matchedBy: matchResult.matchMethod,
        });
        hasAnyMatch = true;
      }
    }

    if (!hasAnyMatch) {
      missingManifests.push(manifest);
    }
  }

  return { roms: discoveredRoms, matches: matchedRoms, missing: missingManifests };
}

/**
 * Busca una ROM que coincida con un requisito dado.
 * Intenta matching por: 1) SHA1, 2) Game ID, 3) Patrón de nombre.
 * Retorna la ROM encontrada y el método de matching, o null si no hay coincidencia.
 */
function findMatchingRom(
  availableRoms: RomFile[],
  requirement: RomRequirement,
  usedRoms: Set<string>,
): { rom: RomFile; matchMethod: 'hash' | 'gameid' | 'name' } | null {
  // 1) Matching por SHA1: autoritativo cuando el manifiesto proporciona hashes
  if (requirement.sha1.length > 0) {
    const matchedByHash = availableRoms.find(
      (rom) => !usedRoms.has(rom.path) && requirement.sha1.includes(rom.sha1),
    );
    if (matchedByHash) {
      return { rom: matchedByHash, matchMethod: 'hash' };
    }
  }

  // 2) Matching por Game ID: autoritativo cuando el manifiesto lista game IDs.
  //    El ID se lee del header del disco, así que funciona across .iso/.rvz/.gcz
  if ((requirement.gameIds?.length ?? 0) > 0) {
    const matchedByGameId = availableRoms.find(
      (rom) =>
        !usedRoms.has(rom.path) && rom.gameId !== null && requirement.gameIds?.includes(rom.gameId),
    );
    if (matchedByGameId) {
      return { rom: matchedByGameId, matchMethod: 'gameid' };
    }
  }

  // 3) Matching por patrón de nombre: fallback cuando no hay hashes ni game IDs.
  //    Se rankea por especificidad del patrón (ej: "tp.iso" gana a "*.iso").
  if (requirement.sha1.length === 0) {
    const matchedByName = availableRoms.filter(
      (rom) => !usedRoms.has(rom.path) && anyMatch(requirement.patterns, rom.name),
    );

    // Filtrar por game ID si el manifiesto lo requiere
    const candidates =
      (requirement.gameIds?.length ?? 0) > 0
        ? matchedByName.filter((rom) => rom.gameId === null)
        : matchedByName;

    if (candidates.length > 0) {
      const bestMatch = pickBestNameMatch(candidates, requirement.patterns);
      return { rom: bestMatch, matchMethod: 'name' };
    }
  }

  return null;
}

/** Caracteres especiales de glob que hacen un patrón no-literal. */
const WILDCARD_REGEX = /[*?{}\\[\\]]/;

/**
 * Evalúa qué tan específico es un match de patrón para un nombre de archivo.
 * Patrones literales (sin wildcards) rankean más alto; entre patrones con
 * wildcards, un prefijo literal más largo gana (ej: "mm.z64" gana a "*.z64").
 */
export function patternSpecificity(patterns: string[], fileName: string): number {
  let bestScore = -1;

  for (const pattern of patterns) {
    if (!matchGlob(pattern, fileName)) continue;

    const literalPrefixLength = pattern.split(WILDCARD_REGEX)[0].length;
    const isLiteral = !WILDCARD_REGEX.test(pattern);
    const score = isLiteral ? 1000 + literalPrefixLength : literalPrefixLength;
    bestScore = Math.max(bestScore, score);
  }

  return bestScore;
}

/** Selecciona el candidato con el patrón más específico (empates mantienen el primero). */
function pickBestNameMatch(candidates: RomFile[], patterns: string[]): RomFile {
  let bestCandidate = candidates[0];
  let bestScore = -1;

  for (const rom of candidates) {
    const score = patternSpecificity(patterns, rom.name);
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = rom;
    }
  }

  return bestCandidate;
}
