import type { App } from '../../core/app';
import { sendJson } from '../http';
import type { ApiRouter } from '../router';

export function registerStatusRoute(router: ApiRouter, app: App): void {
  router.get('/api/status', async (_req, res) => {
    const { scan, ports, self } = await app.status();
    sendJson(res, 200, {
      scan,
      ports,
      self,
      platform: app.platform,
      config: {
        romsDir: app.config.romsDir,
        romsDirs: app.config.romsDirs,
        modsDir: app.config.modsDir,
        portsDir: app.config.portsDir,
      },
    });
  });
}
