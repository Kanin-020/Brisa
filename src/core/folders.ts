import * as fs from 'node:fs';
import { spawn } from 'node:child_process';

/**
 * Open an arbitrary path in the OS file manager. Uses Electron's shell when
 * running inside the desktop app, and falls back to the platform opener
 * (xdg-open / open / explorer) otherwise.
 */
export async function openPathInFileManager(target: string): Promise<boolean> {
  fs.mkdirSync(target, { recursive: true });

  // Desktop (proceso principal de Electron): usar shell.openPath.
  try {
    const electron = require('electron') as { shell?: { openPath(p: string): Promise<string> } };
    if (electron && typeof electron === 'object' && electron.shell) {
      const err = await electron.shell.openPath(target);
      return err === '' || err === undefined;
    }
  } catch {
    // Fuera de Electron (modo CLI/navegador).
  }

  const opener =
    process.platform === 'win32' ? 'explorer' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  return new Promise((resolve) => {
    try {
      const child = spawn(opener, [target], { detached: true, stdio: 'ignore' });
      child.on('error', () => resolve(false));
      child.on('exit', () => resolve(true));
      child.unref();
    } catch {
      resolve(false);
    }
  });
}

/** Open a URL in the default browser (best-effort, no GUI environments included). */
export function openUrlInBrowser(url: string): void {
  try {
    const opener =
      process.platform === 'win32'
        ? 'start'
        : process.platform === 'darwin'
          ? 'open'
          : process.env.WSL_DISTRO_NAME
            ? 'wslview'
            : 'xdg-open';
    const child = spawn(opener, [url], { detached: true, stdio: 'ignore' });
    child.on('error', () => {
      /* opener no disponible (entorno sin GUI) */
    });
    child.unref();
  } catch {
    // ignore
  }
}
