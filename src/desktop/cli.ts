import { app } from "electron";
import path from "node:path";
import { spawnSync } from "node:child_process";

/**
 * Si la app se ejecuta con argumentos (AppImage desde terminal), despacha al
 * CLI (ELECTRON_RUN_AS_NODE) y sale con su código de salida.
 */
export function runCliIfNeeded(): void {
  const args = process.argv.slice(process.defaultApp ? 2 : 1);

  if (args.length === 0) return;

  const cliEntry = app.isPackaged
    ? path.join(process.resourcesPath, "cli-entry.cjs")
    : path.join(app.getAppPath(), "dist", "cli.js");

  const res = spawnSync(process.execPath, [cliEntry, ...args], {
    stdio: "inherit",
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
    },
  });

  app.exit(res.error ? 1 : (res.status ?? 0));
}
