import type { App } from '../../core/app';
import { requireId, sendError, sendJson } from '../http';
import type { ApiRouter } from '../router';

export function registerModsRoutes(router: ApiRouter, app: App): void {
  router.post('/api/mods/link', async (_req, res, body) => {
    const id = requireId(body, res);
    const mod = (body as { mod?: string })?.mod;
    if (!id || !mod) return sendError(res, 400, 'missing id/mod');
    app.linkMod(id, mod);
    sendJson(res, 200, { ok: true });
  });

  router.post('/api/mods/unlink', async (_req, res, body) => {
    const id = requireId(body, res);
    const mod = (body as { mod?: string })?.mod;
    if (!id || !mod) return sendError(res, 400, 'missing id/mod');
    app.unlinkMod(id, mod);
    sendJson(res, 200, { ok: true });
  });

  router.post('/api/mods/link-all', async (_req, res, body) => {
    const id = requireId(body, res);
    if (!id) return;
    app.relinkMods(id);
    sendJson(res, 200, { ok: true });
  });

  router.post('/api/mods/unlink-all', async (_req, res, body) => {
    const id = requireId(body, res);
    if (!id) return;
    app.unlinkAllMods(id);
    sendJson(res, 200, { ok: true });
  });
}
