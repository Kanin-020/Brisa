import * as fs from "node:fs";
import * as path from "node:path";
import type { AppConfig } from "./config";
import { loadManifest } from "./manifest";
import { listStates, type PortState } from "./state";
import { appImagePath } from "./version";
import { detectPlatform } from "./platform";

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

/** Carpeta de launchers, junto al resto de datos de Brisa (roms/, mods/, …). */
export function launchersDir(cfg: AppConfig): string {
  return path.join(cfg.root, "launchers");
}

/** Carpeta image/: copia de la propia Brisa + ayudante `imagen`/`imagen.cmd`. */
export function imagesDir(cfg: AppConfig): string {
  return path.join(cfg.root, "image");
}

/** Extensión del launcher según el SO (Windows: .cmd; resto: .sh). */
export function launcherExtension(): string {
  return detectPlatform().os === "windows" ? ".cmd" : ".sh";
}

/**
 * Ruta del ayudante `image/imagen` (POSIX) o `image/imagen.cmd` (Windows) que
 * los launchers usan para invocar el CLI de la propia Brisa.
 */
export function helperPath(cfg: AppConfig): string {
  return path.join(
    cfg.root,
    "image",
    detectPlatform().os === "windows" ? "imagen.cmd" : "imagen",
  );
}

/** Nombre de archivo seguro a partir del título del juego (quita ':' y otros caracteres inválidos). */
export function launcherTitle(game: string): string {
  const t = game.replace(/[\\\\/:*?\"<>|]/g, " ").replace(/\s+/g, " ").trim();
  return t || "Port";
}

/** Encierra una ruta en comillas simples de shell (escapa ' como '\\'' para que nada se expanda). */
export function shQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\\\''`)}'`;
}

/** Escapa una ruta para usarla entre comillas dobles en un .cmd de Windows. */
function batQuote(s: string): string {
  return `"${s.replace(/%/g, "%%")}"`;
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
      .filter((f) => /^Brisa-.*\.AppImage$/i.test(f))
      .map((f) => path.join(dir, f))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    return files[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Ruta que el launcher .sh invoca: la AppImage copiada si existe, o el
 * ayudante `image/imagen`.
 */
function shTarget(cfg: AppConfig): string {
  return selfImagePath(cfg) ?? helperPath(cfg);
}

/**
 * Script .sh del launcher (Linux/macOS/Android): limpia las variables de
 * Steam y ejecuta el CLI de la propia Brisa (su AppImage en image/) con
 * `update <port>` y `launch <port> --wait`. Si aún no hay copia del AppImage
 * (modo desarrollo), cae al ayudante `image/imagen`.
 */
export function launcherScript(cfg: AppConfig, portId: string): string {
  const exe = shTarget(cfg);
  // El id del port va sin comillas (ids normales: [A-Za-z0-9._-]+); solo se
  // protege con comillas un id inusual que rompería la sintaxis del script.
  const safeId = /^[A-Za-z0-9._-]+$/.test(portId) ? portId : shQuote(portId);
  return `#!/bin/sh
# Launcher generado por Brisa (port: ${portId}) — no editar a mano.
# Steam lanza los juegos sin pasar por una shell, así que los unset de las
# variables de Steam (LD_PRELOAD, STEAM_COMPAT_*, STEAM_RUNTIME) que
# crashean los binarios nativos solo pueden vivir en este script.
unset LD_PRELOAD
unset STEAM_COMPAT_DATA_PATH
unset STEAM_COMPAT_CLIENT_INSTALL_PATH
unset STEAM_RUNTIME
${shQuote(exe)} update ${safeId} || exit 1
${shQuote(exe)} launch ${safeId} --wait || exit 1
`;
}

/**
 * Script .cmd del launcher (Windows): limpia las variables de Steam y delega
 * en `image/imagen.cmd`, que invoca el exe de la propia Brisa con `update
 * <port>` y `launch <port> --wait`.
 */
export function launcherScriptWin(cfg: AppConfig, portId: string): string {
  const helper = batQuote(path.join(cfg.root, "image", "imagen.cmd"));
  const safeId = /^[A-Za-z0-9._-]+$/.test(portId) ? portId : portId.replace(/[^\w.-]/g, "_");
  return [
    "@echo off",
    `rem Launcher generado por Brisa (port: ${portId}) - no editar a mano.`,
    "rem Steam ejecuta los juegos sin pasar por una shell; este .cmd limpia las",
    "rem variables de Steam que crashean los binarios nativos y delega en el CLI",
    "rem de Brisa (image\\imagen.cmd): 'update <port>' y 'launch <port> --wait'.",
    'set "LD_PRELOAD="',
    'set "STEAM_COMPAT_DATA_PATH="',
    'set "STEAM_COMPAT_CLIENT_INSTALL_PATH="',
    'set "STEAM_RUNTIME="',
    `call ${helper} update "${safeId}"`,
    "if errorlevel 1 exit /b 1",
    `call ${helper} launch "${safeId}" --wait`,
    "if errorlevel 1 exit /b 1",
  ].join("\r\n");
}

/** Devuelve el contenido del launcher adecuado para el SO actual. */
export function launcherScriptForPlatform(cfg: AppConfig, portId: string): string {
  return detectPlatform().os === "windows"
    ? launcherScriptWin(cfg, portId)
    : launcherScript(cfg, portId);
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
export function imagenHelperScript(cfg: AppConfig): string {
  return `#!/bin/sh
# Ayudante de Brisa (generado por Brisa — no editar a mano).
# Uso: imagen <subcomando> <port> [args...]
# Ejecuta el CLI de la propia Brisa (su AppImage en image/) con los argumentos
# recibidos, p. ej. imagen update <port> o imagen launch <port> --wait.
ROOT=${shQuote(cfg.root)}
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
    "@echo off",
    "rem Ayudante de Brisa (generado por Brisa - no editar a mano).",
    "rem Uso: imagen <subcomando> <port> [args...]",
    "rem Ejecuta el CLI de la propia Brisa con los argumentos recibidos,",
    "rem p. ej. imagen update <port> o imagen launch <port> --wait.",
    `${exe} %*`,
    "exit /b %errorlevel%",
  ].join("\r\n");
}

/**
 * Escribe (o regenera) el ayudante `image/imagen` (POSIX) o `image/imagen.cmd`
 * (Windows), y borra el del otro formato si existe (restos de otra plataforma
 * o de una versión anterior). Best-effort: devuelve la ruta o null; un fallo
 * aquí no debe romper la instalación del port.
 */
export function writeImagenHelper(cfg: AppConfig): string | null {
  try {
    const dir = imagesDir(cfg);
    fs.mkdirSync(dir, { recursive: true });
    const win = detectPlatform().os === "windows";
    const file = path.join(dir, win ? "imagen.cmd" : "imagen");
    const stale = path.join(dir, win ? "imagen" : "imagen.cmd");
    if (stale !== file && fs.existsSync(stale)) {
      try {
        fs.rmSync(stale, { force: true });
      } catch {
        // ok
      }
    }
    fs.writeFileSync(file, win ? imagenHelperScriptWin(cfg) : imagenHelperScript(cfg));
    if (!win) fs.chmodSync(file, 0o755);
    return file;
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
  const src = appImagePath();
  if (!src) return null;
  try {
    const dir = imagesDir(cfg);
    fs.mkdirSync(dir, { recursive: true });
    const img = path.join(dir, path.basename(src));
    // Mantener image/ con una sola copia de Brisa: limpiar copias de otras
    // versiones (el nombre cambia con la versión) en cada ejecución.
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      if (full === img) continue;
      if (/^Brisa-.*\.AppImage$/i.test(f)) {
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
      fs.existsSync(img) &&
      fs.statSync(img).size === fs.statSync(src).size &&
      fs.statSync(img).mtimeMs >= fs.statSync(src).mtimeMs;
    if (fresh) {
      return img;
    }
    fs.copyFileSync(src, img);
    try {
      fs.chmodSync(img, 0o755);
    } catch {
      // ok
    }
    return img;
  } catch {
    return null;
  }
}

/**
 * Título de archivo .sh de cada port instalado. Si dos ports comparten juego
 * (p. ej. los dos de Super Mario 64), se desambigua con el nombre del port o
 * su id.
 */
export function computeLauncherNames(cfg: AppConfig): Map<string, string> {
  const names = new Map<string, string>();
  const used = new Set<string>();
  for (const st of listStates(cfg)) {
    const m = loadManifest(cfg, st.id);
    const base = launcherTitle(m?.launcher || m?.game || m?.name || st.id);
    let title = base;
    let key = title.toLowerCase();
    if (used.has(key)) title = `${base} (${m?.name || st.id})`;
    key = title.toLowerCase();
    if (used.has(key)) title = `${base} (${st.id})`;
    key = title.toLowerCase();
    let i = 2;
    while (used.has(key)) {
      title = `${base} (${st.id} ${i})`;
      key = title.toLowerCase();
      i++;
    }
    used.add(key);
    names.set(st.id, title);
  }
  return names;
}

/**
 * Crea (o actualiza) el launcher de un port instalado (`.sh` o `.cmd` según
 * el SO). Devuelve la ruta o null. Es best-effort: un fallo aquí (permisos,
 * disco) NO debe romper la instalación/actualización del port, que ya tuvo
 * éxito.
 */
export function writeLauncher(cfg: AppConfig, st: PortState): string | null {
  try {
    const root = path.join(cfg.portsDir, st.id);
    const exe = st.executable;
    if (!fs.existsSync(root) || !fs.existsSync(path.join(root, exe))) return null;
    const title = computeLauncherNames(cfg).get(st.id);
    if (!title) return null;
    // Si el título cambió (p. ej. el manifiesto añadió `launcher`), borrar el
    // archivo viejo de este mismo port antes de escribir el nuevo.
    removeLauncher(cfg, st.id);
    const dir = launchersDir(cfg);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${title}${launcherExtension()}`);
    fs.writeFileSync(file, launcherScriptForPlatform(cfg, st.id));
    if (launcherExtension() !== ".cmd") fs.chmodSync(file, 0o755);
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
  const exe = selfImagePath(cfg);
  for (const st of listStates(cfg)) {
    const title = titles.get(st.id);
    if (!title) continue;
    const file = path.join(dir, `${title}${launcherExtension()}`);
    let need = !fs.existsSync(file);
    if (!need && exe) {
      try {
        if (!fs.readFileSync(file, "utf8").includes(shQuote(exe))) need = true;
      } catch {
        need = true;
      }
    }
    if (need && writeLauncher(cfg, st) !== null) created++;
  }
  return created;
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
    for (const f of fs.readdirSync(dir)) {
      if (!/\.(sh|cmd|bat)$/i.test(f)) continue;
      try {
        if (fs.readFileSync(path.join(dir, f), "utf8").includes(marker)) {
          fs.rmSync(path.join(dir, f), { force: true });
        }
      } catch {
        // archivo ilegible: ignorar
      }
    }
  } catch {
    // carpeta inaccesible: ignorar
  }
}
