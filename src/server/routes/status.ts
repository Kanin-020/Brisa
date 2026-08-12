import type { App } from "../../core/app";
import { sendJson } from "../http";
import type { ApiRouter } from "../router";

export function registerStatusRoute(router: ApiRouter, app: App): void {
  router.get("/api/status", async (_req, res) => {
    const { scan, ports, self } = await app.status();
    sendJson(res, 200, {
      scan,
      ports,
      self,
      platform: app.platform,
      cfg: {
        romsDir: app.cfg.romsDir,
        romsDirs: app.cfg.romsDirs,
        modsDir: app.cfg.modsDir,
        portsDir: app.cfg.portsDir,
      },
    });
  });
}
