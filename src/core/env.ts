/**
 * Variables de entorno heredadas de Steam/Proton que rompen los binarios
 * nativos de los ports:
 *   - LD_PRELOAD: inyecta las librerías del runtime de Steam en el juego.
 *   - STEAM_COMPAT_DATA_PATH / STEAM_COMPAT_CLIENT_INSTALL_PATH: rutas de
 *     compatibilidad de Proton que confunden a los ejecutables nativos.
 *   - STEAM_RUNTIME: fuerza el runtime de Steam en vez del sistema.
 *
 * Se eliminan del entorno hijo antes de lanzar el ejecutable del port, tanto
 * en el CLI (brisa launch) como en la GUI (POST /api/launch).
 */
const STEAM_ENV_NOISE = new Set([
  "LD_PRELOAD",
  "STEAM_COMPAT_DATA_PATH",
  "STEAM_COMPAT_CLIENT_INSTALL_PATH",
  "STEAM_RUNTIME",
]);

/** Copia del entorno base sin las variables de Steam que rompen los nativos. */
export function cleanLaunchEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base };
  for (const key of STEAM_ENV_NOISE) delete env[key];
  return env;
}
