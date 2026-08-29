import * as fs from "node:fs";
import * as path from "node:path";
import type { App } from "../../core/app";
import { requireId, sendError, sendJson } from "../http";
import type { ApiRouter } from "../router";

type FolderKind = "root" | "roms" | "mods" | "manifests" | "ports";

export function registerSystemRoutes(router: ApiRouter, app: App): void {
  router.post("/api/open-folder", async (_req, res, body) => {
    const dir = (body as { dir?: string })?.dir;
    const ok = await app.openFolder(dir as FolderKind | undefined);
    sendJson(res, 200, { ok });
  });

  router.post("/api/open-mods-folder", async (_req, res, body) => {
    const id = requireId(body, res);
    if (!id) return;
    if (!app.manifest(id)) return sendError(res, 404, "port not found");
    const ok = await app.openPortModsFolder(id);
    sendJson(res, 200, { ok });
  });

  router.post("/api/open-port-folder", async (_req, res, body) => {
    const id = requireId(body, res);
    if (!id) return;
    if (!app.manifest(id)) return sendError(res, 404, "port not found");
    const ok = await app.openPortFolder(id);
    sendJson(res, 200, { ok });
  });

  // Idiomas disponibles: escanea lang/ y devuelve los códigos de locale.
  router.get("/api/locales", async (_req, res) => {
    try {
      const webRoot = process.env.BRISA_WEB_ROOT || path.join(app.cfg.root, "src", "web");
      const langDir = path.join(webRoot, "lang");
      const files = fs.existsSync(langDir)
        ? fs.readdirSync(langDir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""))
        : [];
      sendJson(res, 200, { locales: files.length > 0 ? files : ["en"] });
    } catch {
      sendJson(res, 200, { locales: ["en"] });
    }
  });

  // Persisted flag: ¿se mostró ya la guía de ayuda?
  const helpSeenFile = path.join(app.cfg.stateDir, ".help-seen");

  router.get("/api/help-seen", async (_req, res) => {
    sendJson(res, 200, { seen: fs.existsSync(helpSeenFile) });
  });

  router.post("/api/help-seen", async (_req, res) => {
    try {
      fs.mkdirSync(path.dirname(helpSeenFile), { recursive: true });
      fs.writeFileSync(helpSeenFile, "1");
      sendJson(res, 200, { ok: true });
    } catch (e) {
      sendError(res, 500, (e as Error).message);
    }
  });
}
