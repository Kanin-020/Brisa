import type { App } from '../../core/app';
import { sendJson } from '../http';
import type { ApiRouter } from '../router';

export function registerRomsRoutes(router: ApiRouter, app: App): void {
  // Nota: POST /api/roms/upload se gestiona en server.ts (el cuerpo se lee
  // como binario en streaming, sin buffering en RAM).
  router.post('/api/roms/delete', async (_req, res, body) => {
    const file = (body as { path?: string })?.path;
    if (!file) return sendJson(res, 400, { error: 'missing path' });
    try {
      app.deleteRom(file);
      sendJson(res, 200, { ok: true });
    } catch (e) {
      sendJson(res, 400, { error: (e as Error).message });
    }
  });
}
