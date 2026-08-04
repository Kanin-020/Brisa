import { app, BrowserWindow, shell } from "electron";
import type { Server } from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { App } from "../core/app";
import { startServer } from "../server/server";

if (app.isPackaged) {
  if (!process.env.PORT_HUB_ROOT) {
    process.env.PORT_HUB_ROOT = path.join(app.getPath("home"), "Port-hub");
  }
  seedManifests(path.join(process.resourcesPath, "manifests"), process.env.PORT_HUB_ROOT);
}

// ---------------------------------------------------------------------------
// Modo CLI: `port-hub install soh`, `port-hub serve`, … conviven con la GUI.
// Si se pasan argumentos, se re-ejecuta este binario como Node plano
// (ELECTRON_RUN_AS_NODE) con la entrada CLI empaquetada y se sale.
// ---------------------------------------------------------------------------
// En desarrollo (`electron .`) argv[1] es el path de la app; empaquetado no.
const userArgs = process.argv.slice(process.defaultApp ? 2 : 1);
if (userArgs.length > 0) {
  const cliEntry = app.isPackaged
    ? path.join(process.resourcesPath, "cli-entry.cjs")
    : path.join(app.getAppPath(), "dist", "cli.js");
  const res = spawnSync(process.execPath, [cliEntry, ...userArgs], {
    stdio: "inherit",
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  });
  app.exit(res.error ? 1 : (res.status ?? 0));
}

// ---------------------------------------------------------------------------
// Modo GUI: ventana de escritorio nativa.
// ---------------------------------------------------------------------------

// Una sola instancia: evita puertos/servidores duplicados al abrir dos veces.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  if (app.isPackaged) {
    // La interfaz web empaquetada vive dentro de app.asar.
    process.env.PORT_HUB_WEB_ROOT = path.join(app.getAppPath(), "dist", "web");
  }

  const hub = new App();
  let server: Server | null = null;

  app.whenReady().then(() => {
    const win = new BrowserWindow({
      width: 1240,
      height: 820,
      minWidth: 940,
      minHeight: 600,
      title: "Port Hub",
      show: false,
      autoHideMenuBar: true,
      icon: app.isPackaged
        ? undefined // electron-builder ya incrusta el icono del ejecutable
        : path.join(app.getAppPath(), "src", "web", "icon.png"),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    win.setMenuBarVisibility(false);
    win.maximize();

    // Enlaces externos se abren en el navegador del sistema, nunca dentro.
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//.test(url)) void shell.openExternal(url);
      return { action: "deny" };
    });
    win.webContents.on("will-navigate", (event, url) => {
      const host = new URL(url).hostname;
      if (host !== "localhost" && host !== "127.0.0.1") event.preventDefault();
    });

    // El puerto es efímero e invisible: la ventana es la app, no hay navegador.
    server = startServer(
      hub,
      0,
      (url) => {
        void win.loadURL(url);
      },
      { openBrowser: false },
    );

    win.once("ready-to-show", () => win.show());
  });

  app.on("window-all-closed", () => {
    server?.close();
    app.quit();
  });
  app.on("before-quit", () => {
    server?.close();
  });
}

/**
 * Copia los manifiestos por defecto a la raíz de datos de usuario la primera
 * vez (no pisa manifiestos actualizados por el usuario con `registry`).
 */
function seedManifests(src: string, root: string): void {
  try {
    const dest = path.join(root, "manifests");
    if (!fs.existsSync(src)) return;
    if (fs.existsSync(dest) && fs.readdirSync(dest).length > 0) return;
    fs.mkdirSync(dest, { recursive: true });
    fs.cpSync(src, dest, { recursive: true });
  } catch (err) {
    console.error("[desktop] no se pudieron sembrar los manifiestos:", (err as Error).message);
  }
}
