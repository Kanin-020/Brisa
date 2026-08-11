import type { App } from "../../core/app";
import { sendJson } from "../http";
import type { ApiRouter } from "../router";

export function registerModsRoutes(router: ApiRouter, app: App): void {
  router.post("/api/mods/link", async (_req, res, body) => {
    const { id, mod } = body as { id?: string; mod?: string };
    if (!id || !mod) return sendJson(res, 400, { error: "missing id/mod" });
    try {
      app.linkMod(id, mod);
      sendJson(res, 200, { ok: true });
    } catch (e) {
      sendJson(res, 500, { error: (e as Error).message });
    }
  });

  router.post("/api/mods/unlink", async (_req, res, body) => {
    const { id, mod } = body as { id?: string; mod?: string };
    if (!id || !mod) return sendJson(res, 400, { error: "missing id/mod" });
    try {
      app.unlinkMod(id, mod);
      sendJson(res, 200, { ok: true });
    } catch (e) {
      sendJson(res, 500, { error: (e as Error).message });
    }
  });

  router.post("/api/mods/link-all", async (_req, res, body) => {
    const id = (body as { id?: string })?.id;
    if (!id) return sendJson(res, 400, { error: "missing id" });
    try {
      app.relinkMods(id);
      sendJson(res, 200, { ok: true });
    } catch (e) {
      sendJson(res, 500, { error: (e as Error).message });
    }
  });

  router.post("/api/mods/unlink-all", async (_req, res, body) => {
    const id = (body as { id?: string })?.id;
    if (!id) return sendJson(res, 400, { error: "missing id" });
    try {
      app.unlinkAllMods(id);
      sendJson(res, 200, { ok: true });
    } catch (e) {
      sendJson(res, 500, { error: (e as Error).message });
    }
  });

  router.post("/api/relink-mods", async (_req, res, body) => {
    const id = (body as { id?: string })?.id;
    if (!id) return sendJson(res, 400, { error: "missing id" });
    app.relinkMods(id);
    sendJson(res, 200, { ok: true });
  });
}
