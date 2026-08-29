import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AppConfig } from './config';
import { normalizeVersion } from './version';

export interface PortState {
  id: string;
  name: string;
  repo: string;
  version: string;
  assetName: string;
  installedAt: string;
  platform: string;
  /** Executable relative to the port dir. */
  executable: string;
  /** Absolute path of the ROM that was symlinked, if any. */
  romLinked: string | null;
  /** Requirement id -> absolute ROM path linked into the port dir (multirom). */
  romsLinked?: Record<string, string>;
}

/** Versión canónica para mostrar/comparar (quita el prefijo "v" de tags antiguos). */
function normalizeState(state: PortState): PortState {
  return { ...state, version: normalizeVersion(state.version) ?? state.version };
}

export function readState(config: AppConfig, id: string): PortState | null {
  const file = path.join(config.stateDir, `${id}.json`);
  try {
    return normalizeState(JSON.parse(fs.readFileSync(file, 'utf8')) as PortState);
  } catch {
    return null;
  }
}

export function writeState(config: AppConfig, state: PortState): void {
  fs.mkdirSync(config.stateDir, { recursive: true });
  fs.writeFileSync(path.join(config.stateDir, `${state.id}.json`), JSON.stringify(state, null, 2));
}

export function listStates(config: AppConfig): PortState[] {
  if (!fs.existsSync(config.stateDir)) return [];
  return fs
    .readdirSync(config.stateDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return normalizeState(
          JSON.parse(fs.readFileSync(path.join(config.stateDir, f), 'utf8')) as PortState,
        );
      } catch {
        return null;
      }
    })
    .filter((s): s is PortState => s !== null);
}
