import { app, BrowserWindow } from "electron";
import type { Server } from "node:http";

/**
 * Registra los eventos del ciclo de vida de Electron: segunda instancia
 * (focaliza la ventana existente) y cierre del servidor HTTP al salir.
 */
export function registerLifecycleEvents(getServer: () => Server | null): void {
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];

    if (!win) return;

    if (win.isMinimized()) {
      win.restore();
    }

    win.focus();
  });

  app.on("before-quit", () => {
    getServer()?.close();
  });

  app.on("window-all-closed", () => {
    getServer()?.close();
    app.quit();
  });
}
