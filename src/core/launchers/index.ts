import * as fs from 'node:fs';
import * as path from 'node:path';
import { EXECUTABLE_MODE } from '../constants';
import type { AppConfig } from '../config';
import { loadManifest } from '../manifest';
import { detectPlatform } from '../platform';
import { listStates, type PortState } from '../state';
import {
  LAUNCHER_FORMAT_MARKER,
  LAUNCHER_FORMAT_VERSION,
  PORT_VERSION_MARKER,
  launcherScriptForPlatform,
  shQuote,
  writeImagenHelper,
} from './scripts';
import { selfImagePath } from './images';
import { normalizeVersion } from '../version';

/**
 * Launchers para añadir los ports instalados a Steam como juegos no-Steam.
 * Se crean automáticamente al instalar/actualizar un port y se borran al
 * desinstalarlo; `brisa srm-config` los regenera todos.
 *
 * El formato depende del SO: `.sh` (POSIX sh) en Linux/macOS/Android y `.cmd`
 * (batch de Windows) en Windows.
 *
 * Cada launcher limpia las variables de Steam y delega en el CLI de la propia
 * Brisa (su AppImage copiada en `<raíz>/image/`, invocada a través del
 * ayudante `image/imagen` o `image/imagen.cmd`): primero `update <port>`
 * (comprueba/actualiza el port a la última versión) y luego
 * `launch <port> --wait`.
 */

export { ensureSelfImageCopy, selfImagePath, imagesDir } from './images';
export { launcherScriptForPlatform, writeImagenHelper, helperPath, shQuote } from './scripts';

/** Carpeta de launchers, junto al resto de datos de Brisa (roms/, mods/, …). */
export function launchersDir(cfg: AppConfig): string {
  return path.join(cfg.root, 'launchers');
}

/** Extensión del launcher según el SO (Windows: .cmd; resto: .sh). */
export function launcherExtension(): string {
  return detectPlatform().os === 'windows' ? '.cmd' : '.sh';
}

/** Nombre de archivo seguro a partir del título del juego (quita ':' y otros caracteres inválidos). */
export function launcherTitle(game: string): string {
  const safe = game
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return safe || 'Port';
}

/**
 * Título de archivo .sh de cada port instalado. Si dos ports comparten juego
 * (p. ej. los dos de Super Mario 64), se desambigua con el nombre del port o
 * su id.
 */
export function computeLauncherNames(cfg: AppConfig): Map<string, string> {
  const names = new Map<string, string>();
  const used = new Set<string>();
  for (const state of listStates(cfg)) {
    const manifest = loadManifest(cfg, state.id);
    const base = launcherTitle(manifest?.launcher || manifest?.game || manifest?.name || state.id);
    let title = base;
    let key = title.toLowerCase();
    if (used.has(key)) title = `${base} (${manifest?.name || state.id})`;
    key = title.toLowerCase();
    if (used.has(key)) title = `${base} (${state.id})`;
    key = title.toLowerCase();
    let i = 2;
    while (used.has(key)) {
      title = `${base} (${state.id} ${i})`;
      key = title.toLowerCase();
      i++;
    }
    used.add(key);
    names.set(state.id, title);
  }
  return names;
}

/**
 * Crea (o actualiza) el launcher de un port instalado (`.sh` o `.cmd` según
 * el SO). Devuelve la ruta o null. Es best-effort: un fallo aquí (permisos,
 * disco) NO debe romper la instalación/actualización del port, que ya tuvo
 * éxito.
 */
export function writeLauncher(cfg: AppConfig, state: PortState): string | null {
  try {
    const root = path.join(cfg.portsDir, state.id);
    const executable = state.executable;
    if (!fs.existsSync(root) || !fs.existsSync(path.join(root, executable))) return null;
    const title = computeLauncherNames(cfg).get(state.id);
    if (!title) return null;
    // Si el título cambió (p. ej. el manifiesto añadió `launcher`), borrar el
    // archivo viejo de este mismo port antes de escribir el nuevo.
    removeLauncher(cfg, state.id);
    const dir = launchersDir(cfg);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${title}${launcherExtension()}`);
    fs.writeFileSync(file, launcherScriptForPlatform(cfg, state.id, state.version));
    if (launcherExtension() !== '.cmd') fs.chmodSync(file, EXECUTABLE_MODE);
    // Asegurar que el ayudante image/imagen exista para que el launcher funcione.
    writeImagenHelper(cfg);
    return file;
  } catch {
    return null;
  }
}

/**
 * Crea los launchers que falten para los ports instalados (p. ej. si se borró
 * la carpeta launchers/, o el port se instaló con una versión anterior que no
 * generaba launchers), y refresca los que apunten a una AppImage de Brisa que
 * ya no está en image/ (el nombre cambia con la versión: tras un self-update
 * el launcher quedaría roto). Para regenerarlos todos usa `brisa srm-config`.
 * Best-effort: devuelve cuántos se crearon o refrescaron.
 */
export function syncLaunchers(cfg: AppConfig): number {
  let created = 0;
  const titles = computeLauncherNames(cfg);
  const dir = launchersDir(cfg);
  // Solo se refrescan referencias cuando hay una AppImage real en image/ (en
  // dev no existe y reescribir los launchers iría y vendría según el entorno).
  const executable = selfImagePath(cfg);
  for (const state of listStates(cfg)) {
    const title = titles.get(state.id);
    if (!title) continue;
    const file = path.join(dir, `${title}${launcherExtension()}`);
    if (launcherNeedsRefresh(cfg, state, file, executable) && writeLauncher(cfg, state) !== null) {
      created++;
    }
  }
  return created;
}

/**
 * Un launcher se regenera cuando: falta el archivo, apunta a una AppImage de
 * Brisa que ya no está en image/ (el nombre cambia con la versión), su
 * etiqueta de formato es más antigua que la actual, o la versión del port
 * instalado ya no coincide con la etiqueta `brisa-port-version` embebida
 * (el port se actualizó y el launcher quedó desactualizado).
 */
function launcherNeedsRefresh(
  cfg: AppConfig,
  state: PortState,
  file: string,
  executable: string | null,
): boolean {
  if (!fs.existsSync(file)) return true;
  let content: string;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {
    return true;
  }
  // Nota (Windows): el .cmd embebe la ruta del ayudante con comillas dobles
  // (batQuote), no con shQuote; este check solo aplica a la copia AppImage de
  // Linux, que en Windows no existe (selfImagePath es null y se omite).
  if (executable && !content.includes(shQuote(executable))) return true;
  const markers = parseLauncherMarkers(content);
  if ((markers.format ?? 0) < LAUNCHER_FORMAT_VERSION) return true;
  return normalizeVersion(markers.portVersion) !== normalizeVersion(state.version);
}

const FORMAT_MARKER_RE = new RegExp(`${LAUNCHER_FORMAT_MARKER}:\\s*([0-9]+)`);
const PORT_VERSION_MARKER_RE = new RegExp(`${PORT_VERSION_MARKER}:\\s*(\\S+)`);

/** Extrae las etiquetas de versión embebidas en un launcher generado por Brisa. */
function parseLauncherMarkers(content: string): {
  format: number | null;
  portVersion: string | null;
} {
  const format = Number(FORMAT_MARKER_RE.exec(content)?.[1]);
  return {
    format: Number.isFinite(format) ? format : null,
    portVersion: PORT_VERSION_MARKER_RE.exec(content)?.[1] ?? null,
  };
}

/**
 * Borra el launcher de un port (busca el marcador "(port: <id>)" del script).
 * Best-effort: un fallo aquí nunca debe impedir la desinstalación.
 */
export function removeLauncher(cfg: AppConfig, portId: string): void {
  try {
    const dir = launchersDir(cfg);
    if (!fs.existsSync(dir)) return;
    const marker = `(port: ${portId})`;
    for (const file of fs.readdirSync(dir)) {
      if (!/\.(sh|cmd|bat)$/i.test(file)) continue;
      try {
        if (fs.readFileSync(path.join(dir, file), 'utf8').includes(marker)) {
          fs.rmSync(path.join(dir, file), { force: true });
        }
      } catch {
        // archivo ilegible: ignorar
      }
    }
  } catch {
    // carpeta inaccesible: ignorar
  }
}
