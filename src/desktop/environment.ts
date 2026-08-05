import * as path from "node:path";

import { seedManifests } from "./manifests";
import { app } from "electron";

export function initializeEnvironment(): void {
  if (!app.isPackaged) return;

  process.env.BRISA_ROOT ??= path.join(app.getPath("home"), "Brisa");

  process.env.BRISA_WEB_ROOT = path.join(app.getAppPath(), "dist", "web");

  seedManifests(
    path.join(process.resourcesPath, "manifests"),
    process.env.BRISA_ROOT,
  );
}
