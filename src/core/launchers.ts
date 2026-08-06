import * as fs from "node:fs";
import * as path from "node:path";
import type { AppConfig } from "./config";
import { loadManifest, type Manifest } from "./manifest";
import { listStates, type PortState } from "./state";

/**
 * Launchers .sh para añadir los ports instalados a Steam como juegos
 * no-Steam. Se crean automáticamente al instalar/actualizar un port y se
 * borran al desinstalarlo; `brisa srm-config` los regenera todos.
 */

/** Carpeta de launchers, junto al resto de datos de Brisa (roms/, mods/, …). */
export function launchersDir(cfg: AppConfig): string {
  return path.join(cfg.root, "launchers");
}

/** Nombre de archivo seguro a partir del título del juego (quita ':' y otros caracteres inválidos). */
export function launcherTitle(game: string): string {
  const t = game.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
  return t || "Port";
}

/** Encierra una ruta en comillas simples de shell (escapa ' como '\'' para que nada se expanda). */
export function shQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Script .sh del launcher: entra al dir del port y ejecuta su imagen directamente. */
export function launcherScript(portRoot: string, exe: string, portId: string): string {
  return `#!/bin/sh
# Launcher generado por Brisa (port: ${portId}) — no editar a mano.
# Steam lanza los juegos sin pasar por una shell, así que los unset de las
# variables de Steam (LD_PRELOAD, STEAM_COMPAT_*, STEAM_RUNTIME) que
# crashean los binarios nativos solo pueden vivir en este script.
unset LD_PRELOAD
unset STEAM_COMPAT_DATA_PATH
unset STEAM_COMPAT_CLIENT_INSTALL_PATH
unset STEAM_RUNTIME
cd ${shQuote(portRoot)} || exit 1
exec ./${shQuote(exe)} "$@"
`;
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
 * Crea (o actualiza) el launcher .sh de un port instalado. Devuelve la ruta o
 * null. Es best-effort: un fallo aquí (permisos, disco) NO debe romper la
 * instalación/actualización del port, que ya tuvo éxito.
 */
export function writeLauncher(cfg: AppConfig, m: Manifest, st: PortState): string | null {
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
    const file = path.join(dir, `${title}.sh`);
    fs.writeFileSync(file, launcherScript(root, exe, st.id));
    fs.chmodSync(file, 0o755);
    return file;
  } catch {
    return null;
  }
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
      if (!f.endsWith(".sh")) continue;
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
