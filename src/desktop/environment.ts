import * as path from "node:path";

import { seedManifests } from "./manifests";
import { app } from "electron";

export function initializeEnvironment(): void {
  if (!app.isPackaged) return;

  process.env.PORT_HUB_ROOT ??= path.join(app.getPath("home"), "Port-hub");

  process.env.PORT_HUB_WEB_ROOT = path.join(app.getAppPath(), "dist", "web");

  seedManifests(
    path.join(process.resourcesPath, "manifests"),
    process.env.PORT_HUB_ROOT,
  );
}
