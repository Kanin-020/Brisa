import type { App } from "../../core/app";
import { sendJson } from "../http";
import type { ApiRouter } from "../router";

export function registerRegistryRoute(router: ApiRouter, app: App): void {
  router.post("/api/registry", async (_req, res) => {
    try {
      const count = await app.refreshRegistry();
      sendJson(res, 200, { ok: true, manifests: count });
    } catch (e) {
      sendJson(res, 500, { error: (e as Error).message });
    }
  });
}
