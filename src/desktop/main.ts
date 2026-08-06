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

const brisa = new App();
let server: Server | null = null;

registerLifecycleEvents(() => server);

app.whenReady().then(() => {
  const win = createMainWindow();

  server = startServer(brisa, 0, (url) => void win.loadURL(url), {
    openBrowser: false,
    // Tras aplicar un self-update la app se cierra; un updater desacoplado
    // reemplaza el binario (AppImage) o instala la versión nueva (Windows)
    // y relanza la app.
    onSelfUpdate: () => setTimeout(() => app.quit(), 800),
  });

  win.once("ready-to-show", () => win.show());
});
