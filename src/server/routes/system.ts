import type { App } from "../../core/app";
import { sendJson } from "../http";
import type { ApiRouter } from "../router";

type FolderKind = "root" | "roms" | "mods" | "manifests" | "ports";

export function registerSystemRoutes(router: ApiRouter, app: App): void {
  router.post("/api/open-folder", async (_req, res, body) => {
    const dir = (body as { dir?: string })?.dir;
    try {
      const ok = await app.openFolder(dir as FolderKind | undefined);
      sendJson(res, 200, { ok });
    } catch (e) {
      sendJson(res, 500, { error: (e as Error).message });
    }
  });

  router.post("/api/open-mods-folder", async (_req, res, body) => {
    const id = (body as { id?: string })?.id;
    if (!id) return sendJson(res, 400, { error: "missing id" });
    if (!app.manifest(id)) return sendJson(res, 404, { error: "port not found" });
    try {
      const ok = await app.openPortModsFolder(id);
      sendJson(res, 200, { ok });
    } catch (e) {
      sendJson(res, 500, { error: (e as Error).message });
    }
  });

  router.post("/api/open-port-folder", async (_req, res, body) => {
    const id = (body as { id?: string })?.id;
    if (!id) return sendJson(res, 400, { error: "missing id" });
    if (!app.manifest(id)) return sendJson(res, 404, { error: "port not found" });
    try {
      const ok = await app.openPortFolder(id);
      sendJson(res, 200, { ok });
    } catch (e) {
      sendJson(res, 500, { error: (e as Error).message });
    }
  });
}
