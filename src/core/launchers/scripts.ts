import * as fs from 'node:fs';
import * as path from 'node:path';
import { EXECUTABLE_MODE } from '../constants';
import type { AppConfig } from '../config';
import { detectPlatform } from '../platform';
import { imagesDir, selfImagePath } from './images';

/**
 * Generación de los scripts de los launchers (`.sh` en Linux/macOS/Android y
 * `.cmd` en Windows) y del ayudante `image/imagen` que invoca el CLI de la
 * propia Brisa.
 */

/**
 * Versión del formato de launcher. Cada script lleva una etiqueta
 * `brisa-launcher-format`; si al arrancar se detecta una etiqueta inferior a
 * esta, el launcher se regenera automáticamente. Subir este número obliga a
 * regenerar todos los launchers existentes cuando cambie la plantilla.
 */
export const LAUNCHER_FORMAT_VERSION = 2;

/** Nombre de la etiqueta que marca la versión del formato del launcher. */
export const LAUNCHER_FORMAT_MARKER = 'brisa-launcher-format';
/** Nombre de la etiqueta que marca la versión instalada del port. */
export const PORT_VERSION_MARKER = 'brisa-port-version';

/**
 * Ruta del ayudante `image/imagen` (POSIX) o `image/imagen.cmd` (Windows) que
 * los launchers usan para invocar el CLI de la propia Brisa.
 */
export function helperPath(config: AppConfig): string {
  return path.join(config.root, 'image', detectPlatform().os === 'windows' ? 'imagen.cmd' : 'imagen');
}

/** Ids de port seguros para incrustar sin comillas en los scripts de los launchers. */
const SAFE_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

/** Encierra una ruta en comillas simples de shell (escapa ' como '\'' para que nada se expanda). */
export function shQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Escapa una ruta para usarla entre comillas dobles en un .cmd de Windows. */
function batQuote(s: string): string {
  return `"${s.replace(/%/g, '%%')}"`;
}

/**
 * Ruta que el launcher .sh invoca: la AppImage copiada si existe, o el
 * ayudante `image/imagen`.
 */
function launchTarget(config: AppConfig): string {
  return selfImagePath(config) ?? helperPath(config);
}

/**
 * Script .sh del launcher (Linux/macOS/Android): limpia las variables de
 * Steam y ejecuta el CLI de la propia Brisa (su AppImage en image/) con
 * `update <port>` y `launch <port> --wait`. Si aún no hay copia del AppImage
 * (modo desarrollo), cae al ayudante `image/imagen`.
 */
export function launcherScript(config: AppConfig, portId: string, portVersion: string): string {
  const executable = launchTarget(config);
  // El id del port va sin comillas (ids normales); solo se protege con comillas
  // un id inusual que rompería la sintaxis del script.
  const safeId = SAFE_ID_PATTERN.test(portId) ? portId : shQuote(portId);
  return `#!/bin/sh
# Launcher generado por Brisa (port: ${portId}) — no editar a mano.
# ${LAUNCHER_FORMAT_MARKER}: ${LAUNCHER_FORMAT_VERSION}
# ${PORT_VERSION_MARKER}: ${portVersion}
# Steam lanza los juegos sin pasar por una shell, así que los unset de las
# variables de Steam (LD_PRELOAD, STEAM_COMPAT_*, STEAM_RUNTIME) que
# crashean los binarios nativos solo pueden vivir en este script.
unset LD_PRELOAD
unset STEAM_COMPAT_DATA_PATH
unset STEAM_COMPAT_CLIENT_INSTALL_PATH
unset STEAM_RUNTIME
${shQuote(executable)} update ${safeId} || exit 1
${shQuote(executable)} launch ${safeId} --wait || exit 1
`;
}

/**
 * Script .cmd del launcher (Windows): limpia las variables de Steam y delega
 * en `image/imagen.cmd`, que invoca el exe de la propia Brisa con `update
 * <port>` y `launch <port> --wait`.
 */
export function launcherScriptWin(config: AppConfig, portId: string, portVersion: string): string {
  const helper = batQuote(helperPath(config));
  const safeId = SAFE_ID_PATTERN.test(portId) ? portId : portId.replace(/[^\w.-]/g, '_');
  return [
    '@echo off',
    `rem Launcher generado por Brisa (port: ${portId}) - no editar a mano.`,
    `rem ${LAUNCHER_FORMAT_MARKER}: ${LAUNCHER_FORMAT_VERSION}`,
    `rem ${PORT_VERSION_MARKER}: ${portVersion}`,
    'rem Steam ejecuta los juegos sin pasar por una shell; este .cmd limpia las',
    'rem variables de Steam que crashean los binarios nativos y delega en el CLI',
    "rem de Brisa (image\\imagen.cmd): 'update <port>' y 'launch <port> --wait'.",
    'set "LD_PRELOAD="',
    'set "STEAM_COMPAT_DATA_PATH="',
    'set "STEAM_COMPAT_CLIENT_INSTALL_PATH="',
    'set "STEAM_RUNTIME="',
    `call ${helper} update "${safeId}"`,
    'if errorlevel 1 exit /b 1',
    `call ${helper} launch "${safeId}" --wait`,
    'if errorlevel 1 exit /b 1',
  ].join('\r\n');
}

/** Devuelve el contenido del launcher adecuado para el SO actual. */
export function launcherScriptForPlatform(
  config: AppConfig,
  portId: string,
  portVersion: string,
): string {
  return detectPlatform().os === 'windows'
    ? launcherScriptWin(config, portId, portVersion)
    : launcherScript(config, portId, portVersion);
}

/**
 * Script del ayudante `image/imagen` (POSIX sh). Uso:
 *   imagen <subcomando> <port> [args...]
 *
 * Ejecuta el CLI de la propia Brisa (su AppImage en image/) pasándole los
 * argumentos tal cual, p. ej. `imagen update <port>` -> `brisa update <port>`
 * o `imagen launch <port> --wait` -> `brisa launch <port> --wait`.
 * Se elige la AppImage más reciente por mtime (el nombre cambia con la
 * versión); si no hay ninguna (dev), cae al comando `brisa` del PATH.
 */
export function imagenHelperScript(config: AppConfig): string {
  return `#!/bin/sh
# Ayudante de Brisa (generado por Brisa — no editar a mano).
# Uso: imagen <subcomando> <port> [args...]
# Ejecuta el CLI de la propia Brisa (su AppImage en image/) con los argumentos
# recibidos, p. ej. imagen update <port> o imagen launch <port> --wait.
ROOT=${shQuote(config.root)}
APPIMAGE="$(ls -t "$ROOT"/image/Brisa-*.AppImage 2>/dev/null | head -n 1)"
if [ -z "$APPIMAGE" ]; then
  if command -v brisa >/dev/null 2>&1; then
    exec brisa "$@"
  fi
  echo "imagen: no se encuentra la AppImage de Brisa en $ROOT/image." >&2
  echo "        Ejecuta Brisa una vez para que se copie a image/, o instala 'brisa' en el PATH." >&2
  exit 1
fi
exec "$APPIMAGE" "$@"
`;
}

/**
 * Script del ayudante `image/imagen.cmd` (Windows). Uso:
 *   imagen <subcomando> <port> [args...]
 *
 * Invoca el exe de la propia Brisa (la app empaquetada despacha a su CLI
 * cuando recibe argumentos) pasándole los argumentos tal cual, p. ej.
 * `imagen update <port>` -> `Brisa.exe update <port>` o
 * `imagen launch <port> --wait` -> `Brisa.exe launch <port> --wait`.
 */
export function imagenHelperScriptWin(_cfg: AppConfig): string {
  const exe = batQuote(process.execPath);
  return [
    '@echo off',
    'rem Ayudante de Brisa (generado por Brisa - no editar a mano).',
    'rem Uso: imagen <subcomando> <port> [args...]',
    'rem Ejecuta el CLI de la propia Brisa con los argumentos recibidos,',
    'rem p. ej. imagen update <port> o imagen launch <port> --wait.',
    `${exe} %*`,
    'exit /b %errorlevel%',
  ].join('\r\n');
}

/**
 * Escribe (o regenera) el ayudante `image/imagen` (POSIX) o `image/imagen.cmd`
 * (Windows), y borra el del otro formato si existe (restos de otra plataforma
 * o de una versión anterior). Best-effort: devuelve la ruta o null; un fallo
 * aquí no debe romper la instalación del port.
 */
export function writeImagenHelper(config: AppConfig): string | null {
  try {
    const dir = imagesDir(config);
    fs.mkdirSync(dir, { recursive: true });
    const win = detectPlatform().os === 'windows';
    const file = path.join(dir, win ? 'imagen.cmd' : 'imagen');
    const stale = path.join(dir, win ? 'imagen' : 'imagen.cmd');
    if (stale !== file && fs.existsSync(stale)) {
      try {
        fs.rmSync(stale, { force: true });
      } catch {
        // ok
      }
    }
    fs.writeFileSync(file, win ? imagenHelperScriptWin(config) : imagenHelperScript(config));
    if (!win) fs.chmodSync(file, EXECUTABLE_MODE);
    return file;
  } catch {
    return null;
  }
}
