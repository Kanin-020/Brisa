/**
 * Detección de Electron al cargar el módulo.
 *
 * En modo CLI (ELECTRON_RUN_AS_NODE) require("electron") devuelve un string
 * (la ruta del binario), no el API, así que esto solo acierta en Electron
 * real (proceso principal de la app de escritorio).
 */
const electronMod = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS sync, Electron solo disponible vía require
    return require('electron') as Record<string, unknown> | undefined;
  } catch {
    return undefined;
  }
})();

/** Objeto electron si estamos en Electron, o undefined fuera de él. */
export const electron: Record<string, unknown> | undefined =
  electronMod && typeof electronMod === 'object' ? electronMod : undefined;
