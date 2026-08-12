import * as fs from "node:fs";
import * as path from "node:path";
import type { AppConfig } from "./config";
import { hashCacheFile } from "./hash";
import { portDir } from "./installer";
import { listStates, readState, writeState } from "./state";

/** True when `target` is `dir` itself or lives inside it. */
function isPathWithin(dir: string, target: string): boolean {
  const root = path.resolve(dir);
  const abs = path.resolve(target);
  return abs === root || abs.startsWith(root + path.sep);
}

/**
 * Stream an uploaded ROM file into the roms dir (avoiding loading whole
 * multi-GB dumps into memory). Existing files are NOT overwritten — a
 * dropped file that already exists is reported as skipped.
 */
export function saveRomFile(
  cfg: AppConfig,
  name: string,
  source: NodeJS.ReadableStream,
): Promise<{ saved: boolean; skipped: boolean; name: string }> {
  return new Promise((resolve, reject) => {
    const safe = path.basename(name);
    const romsRoot = path.resolve(cfg.romsDir);
    const dest = path.join(romsRoot, safe);
    if (!isPathWithin(romsRoot, dest)) {
      reject(new Error(`Nombre de archivo no válido: ${name}`));
      return;
    }
    fs.mkdirSync(romsRoot, { recursive: true });
    if (fs.existsSync(dest)) {
      source.resume(); // consumir el cuerpo para reutilizar la conexión
      resolve({ saved: false, skipped: true, name: safe });
      return;
    }
    const part = `${dest}.part`;
    const cleanup = () => {
      try {
        fs.rmSync(part, { force: true });
      } catch {
        /* ignore */
      }
    };
    const out = fs.createWriteStream(part);
    const fail = (err: Error) => {
      cleanup();
      reject(err);
    };
    out.on("error", fail);
    source.on("error", fail);
    out.on("finish", () => {
      try {
        if (out.bytesWritten === 0) {
          cleanup();
          reject(new Error("Archivo vacío"));
          return;
        }
        fs.renameSync(part, dest);
        resolve({ saved: true, skipped: false, name: safe });
      } catch (e) {
        cleanup();
        reject(e as Error);
      }
    });
    source.pipe(out);
  });
}

/**
 * Delete a ROM file. Only files inside the roms dir are accepted (path
 * traversal guard). Also invalidates the cached SHA1 so the next scan
 * starts clean.
 */
export function deleteRom(cfg: AppConfig, file: string): void {
  const abs = path.resolve(file);
  // Con varias carpetas de ROMs, el archivo debe vivir dentro de alguna de ellas.
  const withinAny = cfg.romsDirs.some((dir) => isPathWithin(dir, abs));
  if (!withinAny) {
    throw new Error(`Ruta fuera de las carpetas de ROMs: ${file}`);
  }
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    throw new Error(`No es un archivo: ${file}`);
  }
  fs.rmSync(abs, { force: true });
  const cacheFile = hashCacheFile(cfg, abs);
  if (fs.existsSync(cacheFile)) fs.rmSync(cacheFile, { force: true });
  // Quitar symlinks colgantes de ports instalados que apuntaban a este ROM.
  removeSymlinksToDeletedRom(cfg, abs);
}

/**
 * Cuando se borra un ROM, elimina los symlinks que los ports instalados
 * tenían hacia él (y limpia el estado romsLinked) para no dejar enlaces
 * rotos en las carpetas de los ports. No depende del manifiesto: recorre
 * el árbol del port y borra cualquier symlink cuyo destino real sea el
 * archivo borrado.
 */
export function removeSymlinksToDeletedRom(cfg: AppConfig, deleted: string): void {
  for (const state of listStates(cfg)) {
    const portRoot = portDir(cfg, state.id);
    if (!fs.existsSync(portRoot)) continue;
    let changed = false;

    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        // readlink funciona incluso con symlinks rotos (el destino ya
        // no existe), a diferencia de realpathSync que lanza ENOENT.
        if (entry.isSymbolicLink()) {
          try {
            const target = fs.readlinkSync(full);
            if (path.resolve(path.dirname(full), target) === deleted) {
              fs.rmSync(full, { force: true });
              changed = true;
            }
          } catch {
            // enlace inaccesible: ignorar
          }
        }
      }
    };
    walk(portRoot);

    // Limpiar las referencias al ROM en el estado del port.
    const links = { ...(state.romsLinked ?? {}) };
    for (const [requirementId, romPath] of Object.entries(links)) {
      if (path.resolve(romPath) === deleted) delete links[requirementId];
    }
    const stateRefChanged =
      (state.romLinked !== null && path.resolve(state.romLinked) === deleted) ||
      Object.keys(links).length !== Object.keys(state.romsLinked ?? {}).length;
    if (changed || stateRefChanged) {
      const stored = readState(cfg, state.id);
      if (stored) {
        stored.romsLinked = Object.keys(links).length > 0 ? links : undefined;
        stored.romLinked = null;
        writeState(cfg, stored);
      }
    }
  }
}
