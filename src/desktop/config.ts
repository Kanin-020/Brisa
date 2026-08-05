import { app, BrowserWindowConstructorOptions } from "electron";
import path from "node:path";

export const config: Readonly<BrowserWindowConstructorOptions> = {
  title: "Brisa",
  width: 1240,
  height: 820,
  minWidth: 940,
  minHeight: 600,
  show: false,
  autoHideMenuBar: true,
  icon: app.isPackaged
    ? path.join(process.resourcesPath, "icon.png")
    : path.join(app.getAppPath(), "src", "web", "icon.png"),
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  },
};
