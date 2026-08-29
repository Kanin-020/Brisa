import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { cleanLaunchEnv } from '../core/env';

/**
 * Lanza el ejecutable del juego. Con `wait` el CLI permanece vivo hasta que el
 * juego termina (necesario para que Steam trackee el shortcut como en
 * ejecución). El entorno se limpia de las variables de Steam (LD_PRELOAD,
 * STEAM_COMPAT_*, STEAM_RUNTIME) que crashean los binarios nativos.
 */
export function launchPortProcess(executable: string, wait: boolean): Promise<void> {
  const child = spawn(executable, [], {
    cwd: path.dirname(executable),
    detached: !wait,
    stdio: wait ? 'inherit' : 'ignore',
    env: cleanLaunchEnv(),
  });
  child.on('error', (err) => {
    console.error(`No se pudo lanzar ${executable}: ${err.message}`);
  });
  if (wait) {
    return new Promise<void>((resolve) => child.on('exit', () => resolve()));
  }
  child.unref();
  return Promise.resolve();
}
