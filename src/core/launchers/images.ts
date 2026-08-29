import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AppConfig } from '../config';
import { appImagePath } from '../version';

/** Carpeta image/: copia de la propia Brisa + ayudante `imagen`/`imagen.cmd`. */
export function imagesDir(config: AppConfig): string {
  return path.join(config.root, 'image');
}

/**
 * Ruta de la AppImage de la propia Brisa en image/ (copia;
 * el nombre cambia con la versión), o null si no hay ninguna.
 */
export function selfImagePath(config: AppConfig): string | null {
  try {
    const dir = imagesDir(config);
    if (!fs.existsSync(dir)) return null;
    const files = fs
      .readdirSync(dir)
      .filter((file) => /^Brisa-.*\.AppImage$/i.test(file))
      .map((file) => path.join(dir, file))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    return files[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Copia la AppImage de la propia Brisa en `image/` (solo cuando la app
 * corre desde su AppImage de Linux; el archivo original no se toca).
 * Si la copia ya existe y tiene el mismo tamaño y timestamp, no hace nada.
 * Best-effort: un fallo aquí nunca debe impedir que Brisa arranque.
 */
export function ensureSelfImageCopy(config: AppConfig): string | null {
  const source = appImagePath();
  if (!source) return null;
  try {
    const dir = imagesDir(config);
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, path.basename(source));
    // Mantener image/ limpio: borrar cualquier AppImage que no sea la
    // copia actual (copias viejas de versiones anteriores).
    for (const file of fs.readdirSync(dir)) {
      const full = path.join(dir, file);
      if (full === dest) continue;
      if (/^Brisa-.*\.AppImage$/i.test(file)) {
        try {
          fs.rmSync(full, { force: true });
        } catch {
          // ok
        }
      }
    }
    // Si la copia ya existe con el mismo tamaño y fecha, no hacer nada.
    try {
      const srcStat = fs.statSync(source);
      const destStat = fs.statSync(dest);
      if (srcStat.size === destStat.size && srcStat.mtimeMs === destStat.mtimeMs) {
        return dest;
      }
    } catch {
      // No existe: hay que crear la copia.
    }
    fs.copyFileSync(source, dest);
    try {
      fs.chmodSync(dest, 0o755);
    } catch {
      // ok
    }
    return dest;
  } catch {
    return null;
  }
}
