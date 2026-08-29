import { BrowserWindow, shell } from "electron";
import { config } from "./config";

/** Crea y configura la ventana principal (sin barra de menú, maximizada, enlaces externos seguros). */
export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow(config);

  win.setMenuBarVisibility(false);
  win.maximize();

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) {
      void shell.openExternal(url);
    }

    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    const host = new URL(url).hostname;

    if (!["localhost", "127.0.0.1"].includes(host)) {
      event.preventDefault();
    }
  });

  return win;
}
