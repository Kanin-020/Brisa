import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AppConfig } from './config';

/** Ids de manifiesto válidos (se usan como nombre de archivo, así que se restringen). */
export const MANIFEST_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

/** True cuando `id` es un id de manifiesto válido (seguro como nombre de archivo). */
export function isValidManifestId(id: unknown): id is string {
  return typeof id === 'string' && MANIFEST_ID_PATTERN.test(id);
}

/** Ruta del manifiesto remoto (tiene prioridad sobre el local). */
function remoteManifestPath(config: AppConfig, id: string): string {
  return path.join(config.manifestsDir, 'remote', `${id}.json`);
}

/**
 * Importa manifiestos (array o un solo objeto) al dir de manifiestos.
 * Las entradas con id inválido o faltante se omiten y se reportan.
 */
export function importManifests(
  config: AppConfig,
  items: unknown[],
): { imported: number; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  let imported = 0;
  fs.mkdirSync(config.manifestsDir, { recursive: true });
  for (const item of items) {
    const raw = item as Record<string, unknown> | null;
    if (!raw || typeof raw !== 'object' || !isValidManifestId(raw.id)) {
      errors.push('manifiesto con id inválido (omitido)');
      continue;
    }
    try {
      fs.writeFileSync(
        path.join(config.manifestsDir, `${raw.id}.json`),
        JSON.stringify(raw, null, 2) + '\n',
      );
      imported++;
      if (fs.existsSync(remoteManifestPath(config, raw.id))) {
        warnings.push(`${raw.id}: existe una versión remota que tiene prioridad`);
      }
    } catch (e) {
      errors.push(`${raw.id}: ${(e as Error).message}`);
    }
  }
  return { imported, errors, warnings };
}

export interface RomRequirement {
  /** Unique id for this ROM variant (e.g. "oot"). */
  id: string;
  /** Human readable name of the required ROM. */
  name: string;
  /** Filename patterns matched against files in the roms dir. */
  patterns: string[];
  /** Optional list of acceptable SHA1 hashes of the ROM. */
  sha1: string[];
  /**
   * Optional list of acceptable 6-char disc game IDs (e.g. "GZ2E01")
   * read from the disc image header. Works across .iso/.rvz/.gcz even
   * though their SHA1 differs due to compression.
   */
  gameIds?: string[];
  /** Relative path inside the port dir where the ROM must be (symlink target). */
  dest: string;
  /**
   * Whether this ROM is mandatory for install. Defaults to true. Set false
   * for optional second ROMs (e.g. SoH's Master Quest): install still works
   * without it, and it gets symlinked automatically when present.
   */
  required?: boolean;
}

export interface AssetDef {
  /** Glob pattern to pick the release asset for this platform. */
  pattern: string;
  /** Archive/file kind. */
  type: 'zip' | 'tar.gz' | 'appimage' | 'apk';
  /** Relative path of the executable inside the extracted archive (null = the asset file itself, e.g. AppImage/APK). */
  executable: string | null;
  /**
   * When true, the archive contains another archive that must be extracted
   * in a second pass. E.g. a .zip containing a .tar.gz (common in recomp
   * projects like BM64). The inner archive is detected by extension.
   */
  nested?: boolean;
}

export interface ModsConfig {
  /** Directory inside the port dir where mods live (e.g. "mods"). */
  dir: string;
  /** Directory name under the central MODS/ dir (e.g. "soh"). */
  gameDir: string;
  /**
   * Optional destination where mods are symlinked, instead of <portDir>/<dir>.
   * Needed for ports that read user data from the OS data dir (e.g. Dusklight:
   * ~/.local/share/TwilitRealm/Dusklight/texture_replacements).
   * A plain string applies to all platforms; an object maps OS family
   * (linux|windows|macos|android) to a path. Supports "~" (home dir) and
   * %ENV_VAR% expansion (e.g. %APPDATA%).
   */
  linkRoot?: string | Record<string, string>;
}

export interface Manifest {
  id: string;
  name: string;
  game: string;
  /**
   * Título opcional para el launcher .sh que genera `srm-config` (por defecto
   * se usa `game`). Útil cuando dos ports comparten juego (p. ej. los dos de
   * Super Mario 64) y quieres un nombre de archivo propio.
   */
  launcher?: string;
  description: string;
  /** GitHub "owner/repo". */
  repo: string;
  /** Platform asset key -> asset definition. Keys like "linux-x64". */
  assets: Record<string, AssetDef>;
  roms: RomRequirement[];
  mods: ModsConfig;
  /**
   * Glob patterns (rutas relativas, p. ej. "saves/**", "settings.json") de
   * datos de usuario (saves, configuraciones) dentro del dir del port que
   * deben sobrevivir a reinstalaciones y actualizaciones. Además de esto, el
   * instalador restaura por defecto todo archivo del port anterior que no
   * exista en la nueva release; `preserve` sirve para los archivos que SÍ
   * vienen en la release (configs por defecto) y deben ganar los del usuario.
   * Al desinstalar el port también se respetan: se borra todo menos los
   * archivos que coincidan con estos patrones, y al reinstalar se restauran.
   */
  preserve?: string[];
}

export function loadManifest(config: AppConfig, id: string): Manifest | null {
  // Remote manifests override local ones (fresh registry wins).
  const dirs = [
    path.join(config.manifestsDir, 'remote', `${id}.json`),
    path.join(config.manifestsDir, `${id}.json`),
  ];
  for (const file of dirs) {
    if (!fs.existsSync(file)) continue;
    try {
      const m = JSON.parse(fs.readFileSync(file, 'utf8')) as Manifest;
      return normalize(m);
    } catch (e) {
      console.error('[manifest] error loading ' + file + ': ' + e);
    }
  }
  return null;
}

export function listManifests(config: AppConfig): Manifest[] {
  const out: Manifest[] = [];
  const seen = new Set<string>();
  // Remote manifests take priority, so scan them first.
  const scan = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Manifest;
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        out.push(normalize(m));
      } catch {
        // skip broken manifest
      }
    }
  };
  if (config.registryUrl) scan(path.join(config.manifestsDir, 'remote'));
  scan(config.manifestsDir);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function normalize(m: Manifest): Manifest {
  m.roms = m.roms ?? [];
  m.assets = m.assets ?? {};
  m.mods = m.mods ?? { dir: 'mods', gameDir: m.id };
  m.mods.gameDir = m.mods.gameDir || m.id;
  m.preserve = m.preserve ?? [];
  return m;
}
