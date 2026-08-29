import * as fs from 'node:fs';
import * as path from 'node:path';
import { UPDATE_CHECK_INTERVAL_MS } from './constants';

/**
 * Caché JSON en disco con caducidad por tiempo, compartida por la comprobación
 * de actualizaciones de los ports (updater.ts) y de la propia app
 * (selfupdate.ts). Cada entrada es un archivo JSON bajo un directorio común.
 *
 * Un mismo archivo no se escribe más de una vez por `ttlMs` (por defecto el
 * intervalo global de check de 30 min) para no agotar el rate limit de GitHub.
 */
export class JsonCache<T> {
  constructor(
    private readonly dir: string,
    private readonly ttlMs: number = UPDATE_CHECK_INTERVAL_MS,
  ) {}

  /** Ruta del archivo que guarda la entrada `id`. */
  pathFor(id: string): string {
    return path.join(this.dir, `${id}.json`);
  }

  /** Devuelve la entrada si existe y aún no ha caducado; si no, null. */
  read(id: string): T | null {
    const entry = this.readRaw(id);
    if (!entry || !this.isFresh(entry)) return null;
    return stripSavedAt(entry);
  }

  /** Lee la entrada ignorando la caducidad (para servir datos aunque la red falle). */
  readStale(id: string): T | null {
    const entry = this.readRaw(id);
    return entry ? stripSavedAt(entry) : null;
  }

  /** Lee la entrada tal cual está en disco (con savedAt), o null. */
  private readRaw(id: string): (T & { savedAt?: number }) | null {
    try {
      return JSON.parse(fs.readFileSync(this.pathFor(id), 'utf8')) as T & { savedAt?: number };
    } catch {
      return null;
    }
  }

  /** Escribe la entrada marcándola con la hora actual. */
  write(id: string, data: T): void {
    fs.mkdirSync(this.dir, { recursive: true });
    const entry = { ...data, savedAt: Date.now() };
    fs.writeFileSync(this.pathFor(id), JSON.stringify(entry));
  }

  /** True cuando la entrada se guardó hace menos de `ttlMs`. */
  isFresh(entry: { savedAt?: number }): boolean {
    return typeof entry.savedAt === 'number' && Date.now() - entry.savedAt < this.ttlMs;
  }
}

/** Quita el campo interno savedAt de la entrada devuelta al llamador. */
function stripSavedAt<T>(entry: T & { savedAt?: number }): T {
  const { savedAt: _savedAt, ...data } = entry;
  return data as T;
}
