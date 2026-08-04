import { app, BrowserWindow } from "electron";
import type { Server } from "node:http";

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
