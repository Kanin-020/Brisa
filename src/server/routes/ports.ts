import * as path from 'node:path';
import { spawn } from 'node:child_process';
import type { App } from '../../core/app';
import { cleanLaunchEnv } from '../../core/env';
import type { RomFile } from '../../core/scanner';
import { requireId, sendError, sendJson } from '../http';
import type { ApiRouter } from '../router';

/** PortId → child PID of game launched from Brisa. */
const runningProcesses = new Map<string, number>();

export function registerPortsRoutes(router: ApiRouter, app: App): void {
  // Instalación como tarea en segundo plano: responde 202 con la tarea y el
  // progreso se consulta por GET /api/tasks (barra real + cancelación).
  router.post('/api/install', async (_req, res, body) => {
    const id = requireId(body, res);
    if (!id) return;
    const manifest = app.manifest(id);
    if (!manifest) return sendError(res, 404, 'port not found');
    if (app.tasks.hasRunning(id)) {
      return sendError(res, 409, 'Ya hay una operación en curso para este port');
    }
    const roms = await app.getRomsForPort(id);
    const { info } = app.tasks.start(
      { type: 'install', portId: id, label: manifest.name },
      async (ctx) => {
        const state = await app.install(id, { roms, signal: ctx.signal }, (stage, done, total) =>
          ctx.update(stage, done, total),
        );
        app.relinkMods(id);
        return { version: state.version, name: manifest.name };
      },
    );
    sendJson(res, 202, { task: info });
  });

  router.post('/api/uninstall', async (_req, res, body) => {
    const id = requireId(body, res);
    if (!id) return;
    app.uninstall(id);
    sendJson(res, 200, { ok: true });
  });

  // Actualización como tarea en segundo plano (progreso + cancelación).
  router.post('/api/update', async (_req, res, body) => {
    const id = requireId(body, res);
    if (!id) return;
    const manifest = app.manifest(id);
    if (!manifest) return sendError(res, 404, 'port not found');
    if (app.tasks.hasRunning(id)) {
      return sendError(res, 409, 'Ya hay una operación en curso para este port');
    }
    const { info } = app.tasks.start(
      { type: 'update', portId: id, label: manifest.name },
      async (ctx) => {
        const applied = await app.update(id, {
          signal: ctx.signal,
          onProgress: (stage, done, total) => ctx.update(stage, done, total),
        });
        app.relinkMods(id);
        return { name: manifest.name, latest: applied.latest };
      },
    );
    sendJson(res, 202, { task: info });
  });

  router.post('/api/check-update', async (_req, res, body) => {
    const id = requireId(body, res);
    if (!id) return;
    // Cached check (non-force): hits the GitHub API at most once per 30 min per port.
    const info = await app.checkUpdate(id);
    sendJson(res, 200, { info });
  });

  router.post('/api/launch', async (_req, res, body) => {
    const id = requireId(body, res);
    if (!id) return;
    const executable = app.launch(id);
    if (!executable) return sendError(res, 404, 'port not installed');
    // Entorno sin las variables de Steam que crashean los binarios nativos.
    const child = spawn(executable, [], {
      cwd: path.dirname(executable),
      detached: true,
      stdio: 'ignore',
      env: cleanLaunchEnv(),
    });
    child.on('error', (err: Error) => {
      console.error(`[launch] ${executable}: ${err.message}`);
    });
    if (child.pid) runningProcesses.set(id, child.pid);
    child.on('exit', () => {
      runningProcesses.delete(id);
    });
    child.unref();
    sendJson(res, 200, { ok: true, exe: executable, pid: child.pid ?? null });
  });

  // ── Stop a running game launched from Brisa ──
  router.post('/api/stop', async (_req, res, body) => {
    const id = requireId(body, res);
    if (!id) return;
    const pid = runningProcesses.get(id);
    if (!pid) return sendError(res, 404, 'no running process for this port');
    try {
      process.kill(pid, 'SIGTERM');
      runningProcesses.delete(id);
      sendJson(res, 200, { ok: true });
    } catch (err) {
      // Process may have already exited
      runningProcesses.delete(id);
      sendError(res, 500, `failed to kill process: ${(err as Error).message}`);
    }
  });
}
