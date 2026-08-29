import type { App } from '../../core/app';
import { sendJson } from '../http';
import type { ApiRouter } from '../router';

export function registerTasksRoutes(router: ApiRouter, app: App): void {
  // Lista de tareas activas y recién terminadas (con progreso en vivo).
  router.get('/api/tasks', async (_req, res) => {
    sendJson(res, 200, app.tasks.list());
  });

  // Cancela una tarea en marcha (AbortController).
  router.post('/api/tasks/cancel', async (_req, res, body) => {
    const id = (body as { id?: string })?.id;
    if (!id) return sendJson(res, 400, { error: 'missing id' });
    if (!app.tasks.cancel(id)) {
      return sendJson(res, 404, { error: 'task not found or already finished' });
    }
    sendJson(res, 200, { ok: true });
  });

  // Actualiza todos los ports instalados con actualización disponible, en
  // segundo plano, como una única tarea con progreso por port.
  router.post('/api/update-all', async (_req, res) => {
    if (app.tasks.hasRunning()) {
      return sendJson(res, 409, { error: 'Ya hay una operación en curso' });
    }
    const { info } = app.tasks.start(
      { type: 'update-all', portId: null, label: 'Actualizar todos' },
      async (ctx) => {
        const result = await app.updateAll({
          signal: ctx.signal,
          onPortStart: (name) => ctx.setLabel(`Actualizar ${name}`),
          onProgress: (stage, done, total) => ctx.update(stage, done, total),
        });
        return { updated: result.updated, results: result.results };
      },
    );
    sendJson(res, 202, { task: info });
  });
}
