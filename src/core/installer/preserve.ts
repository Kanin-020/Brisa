import * as fs from "node:fs";
import * as path from "node:path";
import { matchGlob } from "../glob";
import type { Manifest } from "../manifest";

/**
 * Después de extraer la nueva versión, restaura desde el backup los datos de
 * usuario del port anterior para que las actualizaciones NO borren saves ni
 * configuraciones:
 *   - Todo archivo/enlace del port anterior que no exista en la nueva release
 *     (saves, configs, mods enlazados, symlinks de ROMs) se copia/enlaza de
 *     vuelta.
 *   - Los archivos que SÍ vienen en la nueva release (configs por defecto)
 *     solo se restauran si coinciden con los patrones `preserve` del
 *     manifiesto: ahí gana la configuración del usuario sobre el default.
 */
export function preserveUserData(backup: string, dir: string, manifest: Manifest): void {
  if (!fs.existsSync(backup)) return;
  const patterns = manifest.preserve ?? [];
  const destExists = (rel: string) => fs.existsSync(path.join(dir, rel));
  // Un archivo se restaura si la nueva release no lo trae, o si el manifiesto
  // lo marca en `preserve` (entonces el del usuario pisa el default).
  const keep = (rel: string) =>
    destExists(rel) ? patterns.some((p) => matchGlob(p, rel)) : true;

  const walk = (src: string, rel: string) => {
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      const srcFull = path.join(src, entry.name);
      const destFull = path.join(dir, relPath);
      if (entry.isDirectory()) {
        // Siempre se baja: keep() decide por archivo si restaurarlo. No usar
        // prefijos literales de `preserve` aquí: son globs (p. ej. "saves/**") y
        // un dir anidado que la release sí traiga ("saves/foo/") haría que se
        // saltara el descenso y se perdieran los saves del usuario.
        fs.mkdirSync(destFull, { recursive: true });
        walk(srcFull, relPath);
      } else if (entry.isSymbolicLink()) {
        if (keep(relPath)) {
          fs.mkdirSync(path.dirname(destFull), { recursive: true });
          if (destExists(relPath)) fs.rmSync(destFull, { force: true });
          try {
            const target = fs.readlinkSync(srcFull);
            // En Windows, los junctions (carpetas de mods) se restauran como
            // junction (destino absoluto, sin permisos de admin); el resto
            // como symlink normal.
            const targetIsDir =
              process.platform === "win32" &&
              fs.existsSync(target) &&
              fs.statSync(target).isDirectory();
            if (targetIsDir) {
              fs.symlinkSync(target, destFull, "junction");
            } else {
              fs.symlinkSync(target, destFull);
            }
          } catch {
            // enlace roto o sin permisos: ignorar
          }
        }
      } else if (keep(relPath)) {
        fs.mkdirSync(path.dirname(destFull), { recursive: true });
        fs.copyFileSync(srcFull, destFull);
      }
    }
  };
  walk(backup, "");
}

/**
 * Borra todo el contenido de `root` excepto los archivos/enlaces que coincidan
 * con alguno de los patrones glob de `preserve` (rutas relativas a `root`).
 * Los directorios se mantienen si contienen algo preservado (o si ellos mismos
 * coinciden). Devuelve true si quedó algo dentro de `root`.
 */
export function removeExceptPreserved(root: string, patterns: string[]): boolean {
  const isPreserved = (rel: string) => patterns.some((p) => matchGlob(p, rel));
  const walk = (dir: string): boolean => {
    let kept = false;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full);
      if (entry.isDirectory()) {
        if (isPreserved(rel)) {
          // El directorio entero está preservado (p. ej. patrón literal "saves").
          kept = true;
          continue;
        }
        if (walk(full)) {
          kept = true;
        } else {
          fs.rmSync(full, { recursive: true, force: true });
        }
      } else if (isPreserved(rel)) {
        // Archivo o symlink preservado (p. ej. un save o una config).
        kept = true;
      } else {
        // Todo lo demás (binarios, symlinks de ROM y mods, …) se borra.
        fs.rmSync(full, { force: true });
      }
    }
    return kept;
  };
  return walk(root);
}
