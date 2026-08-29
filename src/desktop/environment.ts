import * as path from "node:path";

import { seedManifests } from "./manifests";
import { app } from "electron";

/**
 * En builds empaquetadas: fija la raíz de datos (BRISA_ROOT en $HOME/Brisa),
 * la ruta de la web empaquetada y siembra los manifiestos incluidos.
 */
export function initializeEnvironment(): void {
  if (!app.isPackaged) return;

  process.env.BRISA_ROOT ??= path.join(app.getPath("home"), "Brisa");

  process.env.BRISA_WEB_ROOT = path.join(app.getAppPath(), "dist", "web");

  seedManifests(
    path.join(process.resourcesPath, "manifests"),
    process.env.BRISA_ROOT,
  );
}
