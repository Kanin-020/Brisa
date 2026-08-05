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

/** True cuando la app corre desde una AppImage de Linux (único formato auto-actualizable). */
export function isAppImage(): boolean {
  return process.platform === "linux" && /\.appimage$/i.test(process.execPath);
}
