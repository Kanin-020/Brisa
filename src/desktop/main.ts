import { app } from "electron";
import { Server } from "http";
import { App } from "../core/app";
import { startServer } from "../server/server";
import { runCliIfNeeded } from "./cli";
import { initializeEnvironment } from "./environment";
import { registerLifecycleEvents } from "./lifecycle";
import { createMainWindow } from "./window";

initializeEnvironment();

runCliIfNeeded();

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

const hub = new App();
let server: Server | null = null;

registerLifecycleEvents(() => server);

app.whenReady().then(() => {
  const win = createMainWindow();

  server = startServer(hub, 0, (url) => void win.loadURL(url), {
    openBrowser: false,
  });

  win.once("ready-to-show", () => win.show());
});
