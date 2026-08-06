import * as fs from "node:fs";
import * as path from "node:path";
import { projectRoot } from "./config";

/**
 * Versión de la propia app Brisa.
 *
 * Orden de resolución:
 *   1. __BRISA_VERSION__ inyectado en tiempo de build por scripts/build-desktop.mjs
 *      dentro de la entrada CLI empaquetada (vale para la AppImage en modo CLI).
 *   2. app.getVersion() de Electron (proceso principal de la app de escritorio).
 *   3. package.json del root del proyecto (dev / node plano).
 */
export function appVersion(): string {
  const injected = (globalThis as Record<string, unknown>).__BRISA_VERSION__;
  if (typeof injected === "string" && injected) return injected;
  try {
    // En modo CLI (ELECTRON_RUN_AS_NODE) require("electron") devuelve un string
    // (la ruta del binario), no el API, así que esto solo acierta en Electron.
    const electron = require("electron") as
      | { app?: { getVersion?(): string } }
      | undefined;
    if (electron && typeof electron === "object" && typeof electron.app?.getVersion === "function") {
      const v = electron.app.getVersion();
      if (v) return v;
    }
  } catch {
    // fuera de Electron
  }
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(projectRoot(), "package.json"), "utf8"),
    ) as { version?: string };
    if (pkg.version) return pkg.version;
  } catch {
    // sin package.json accesible
  }
  return "0.0.0";
}

/**
 * Ruta real del archivo AppImage de Linux cuando la app corre desde una
 * AppImage, o null en cualquier otro caso (dev, node plano, CLI, .exe).
 *
 * Ojo: dentro de una AppImage en ejecución, process.execPath apunta al binario
 * del mount temporal (/tmp/.mount_<nombre>/…), no al archivo .AppImage, y
 * además el mount es de solo lectura. El runtime de AppImage (type 2) define
 * la variable de entorno APPIMAGE con la ruta absoluta del archivo original;
 * esa es la que hay que reemplazar y relanzar en un self-update.
 */
export function appImagePath(): string | null {
  if (process.platform !== "linux") return null;
  const fromEnv = process.env.APPIMAGE;
  if (fromEnv) return path.resolve(fromEnv);
  // Fallback para entornos sin variable (p. ej. ejecutando el binario
  // directamente con un nombre que termina en .AppImage).
  return /\.appimage$/i.test(process.execPath) ? process.execPath : null;
}

/** True cuando la app corre desde una AppImage de Linux. */
export function isAppImage(): boolean {
  return appImagePath() !== null;
}

/**
 * True cuando esta build puede auto-actualizarse: AppImage de Linux, o la app
 * de escritorio empaquetada de Windows (el instalador NSIS se puede ejecutar
 * en silencio). En Windows se detecta con BRISA_ROOT, que solo define
 * src/desktop/environment.ts en builds empaquetadas (app.isPackaged); en
 * dev/CLI plano no hay auto-update.
 */
export function isSelfUpdateSupported(): boolean {
  if (process.platform === "win32") return !!process.env.BRISA_ROOT;
  return isAppImage();
}
