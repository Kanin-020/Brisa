import * as fs from "node:fs";
import * as path from "node:path";
import type { AppConfig } from "../config";
import { appImagePath } from "../version";

/** Carpeta image/: copia de la propia Brisa + ayudante `imagen`/`imagen.cmd`. */
export function imagesDir(cfg: AppConfig): string {
  return path.join(cfg.root, "image");
}

/**
 * Ruta de la AppImage de la propia Brisa copiada en image/ (la más reciente;
 * el nombre cambia con la versión), o null si aún no hay copia.
 */
export function selfImagePath(cfg: AppConfig): string | null {
  try {
    const dir = imagesDir(cfg);
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
 * Copia el AppImage de la propia Brisa a `image/` en su primera ejecución
 * (solo cuando la app corre desde su AppImage de Linux; el archivo original
 * no se toca). Si ya hay una copia del mismo archivo, no hace nada; las copias
 * de versiones anteriores en image/ se limpian (el nombre cambia con la
 * versión). Best-effort: un fallo aquí nunca debe impedir que Brisa arranque.
 */
export function ensureSelfImageCopy(cfg: AppConfig): string | null {
  const source = appImagePath();
  if (!source) return null;
  try {
    const dir = imagesDir(cfg);
    fs.mkdirSync(dir, { recursive: true });
    const copy = path.join(dir, path.basename(source));
    // Mantener image/ con una sola copia de Brisa: limpiar copias de otras
    // versiones (el nombre cambia con la versión) en cada ejecución.
    for (const file of fs.readdirSync(dir)) {
      const full = path.join(dir, file);
      if (full === copy) continue;
      if (/^Brisa-.*\.AppImage$/i.test(file)) {
        try {
          fs.rmSync(full, { force: true });
        } catch {
          // ok
        }
      }
    }
    // Recopiar si falta o si el original cambió (mismo tamaño pero más nuevo,
    // p. ej. tras un self-update que reemplaza el archivo en su sitio).
    const fresh =
      fs.existsSync(copy) &&
      fs.statSync(copy).size === fs.statSync(source).size &&
      fs.statSync(copy).mtimeMs >= fs.statSync(source).mtimeMs;
    if (fresh) {
      return copy;
    }
    fs.copyFileSync(source, copy);
    try {
      fs.chmodSync(copy, 0o755);
    } catch {
      // ok
    }
    return copy;
  } catch {
    return null;
  }
}
