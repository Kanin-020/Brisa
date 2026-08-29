import * as fs from "node:fs";
import * as path from "node:path";
import type { AppConfig } from "../config";
import { appImagePath } from "../version";

/** Carpeta image/: copia de la propia Brisa + ayudante `imagen`/`imagen.cmd`. */
export function imagesDir(cfg: AppConfig): string {
  return path.join(cfg.root, "image");
}

/**
 * Ruta de la AppImage de la propia Brisa en image/ (symlink o copia;
 * el nombre cambia con la versión), o null si no hay ninguna.
 * Si el symlink apunta a un destino que ya no existe (p. ej. tras un
 * self-update que borró la AppImage vieja), se ignora.
 */
export function selfImagePath(cfg: AppConfig): string | null {
  try {
    const dir = imagesDir(cfg);
    if (!fs.existsSync(dir)) return null;
    const files = fs
      .readdirSync(dir)
      .filter((file) => /^Brisa-.*\.AppImage$/i.test(file))
      .map((file) => {
        const full = path.join(dir, file);
        // Si es un symlink roto (destino borrado tras self-update), ignorarlo.
        try {
          if (fs.lstatSync(full).isSymbolicLink() && !fs.existsSync(full)) return null;
        } catch {
          return null;
        }
        return full;
      })
      .filter(Boolean)
      .sort((a, b) => fs.statSync(b!).mtimeMs - fs.statSync(a!).mtimeMs);
    return files[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Crea un symlink en `image/` apuntando a la AppImage de la propia Brisa
 * (solo cuando la app corre desde su AppImage de Linux; el archivo original
 * no se toca). Si el symlink ya apunta al destino correcto, no hace nada;
 * las copias completas de versiones anteriores se reemplazan por symlinks.
 * Best-effort: un fallo aquí nunca debe impedir que Brisa arranque.
 */
export function ensureSelfImageCopy(cfg: AppConfig): string | null {
  const source = appImagePath();
  if (!source) return null;
  try {
    const dir = imagesDir(cfg);
    fs.mkdirSync(dir, { recursive: true });
    const link = path.join(dir, path.basename(source));
    // Mantener image/ limpio: borrar cualquier AppImage que no sea el
    // symlink actual (copias viejas de versiones anteriores).
    for (const file of fs.readdirSync(dir)) {
      const full = path.join(dir, file);
      if (full === link) continue;
      if (/^Brisa-.*\.AppImage$/i.test(file)) {
        try {
          fs.rmSync(full, { force: true });
        } catch {
          // ok
        }
      }
    }
    // Si el symlink (o copia vieja) ya existe y apunta al destino correcto,
    // no hacemos nada.
    let currentTarget: string | null = null;
    try {
      const stat = fs.lstatSync(link);
      if (stat.isSymbolicLink()) {
        currentTarget = fs.realpathSync(link);
      } else {
        // Es una copia completa de una versión anterior: reemplazar por symlink.
        fs.rmSync(link, { force: true });
      }
    } catch {
      // No existe: hay que crear el symlink.
    }
    const realSource = fs.realpathSync(source);
    if (currentTarget === realSource) return link;
    // Crear el symlink (relativo para que funcione si se mueve la carpeta root).
    const relativeSource = path.relative(dir, source);
    try {
      // Intentar symlink relativo primero (no requiere permisos especiales).
      fs.symlinkSync(relativeSource, link);
    } catch {
      // Fallback: symlink absoluto (funciona siempre en Linux sin permisos extra).
      try {
        fs.symlinkSync(source, link);
      } catch {
        // Último recurso: copia completa (solo si symlink falla, p. ej. FS
        // que no soporta symlinks como FAT32).
        fs.copyFileSync(source, link);
        try {
          fs.chmodSync(link, 0o755);
        } catch {
          // ok
        }
      }
    }
    try {
      fs.chmodSync(link, 0o755);
    } catch {
      // ok
    }
    return link;
  } catch {
    return null;
  }
}
