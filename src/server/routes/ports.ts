import * as path from "node:path";
import { spawn } from "node:child_process";
import type { ServerResponse } from "node:http";
import type { App } from "../../core/app";
import { cleanLaunchEnv } from "../../core/env";
import type { RomFile } from "../../core/scanner";
import { sendJson } from "../http";
import type { ApiRouter } from "../router";

/** Lee el campo `id` del body; si falta, responde 400 y devuelve null. */
function requirePortId(body: unknown, res: ServerResponse): string | null {
  const id = (body as { id?: string })?.id;
  if (!id) {
    sendJson(res, 400, { error: "missing id" });
    return null;
  }
  return id;
}

export function registerPortsRoutes(router: ApiRouter, app: App): void {
  router.post("/api/install", async (_req, res, body) => {
    const id = requirePortId(body, res);
    if (!id) return;
    try {
      const manifest = app.manifest(id);
      if (!manifest) return sendJson(res, 404, { error: "port not found" });
      const { scan } = await app.status();
      const roms: Record<string, RomFile> = {};
      for (const match of scan.matches) {
        if (match.manifest.id === id) roms[match.requirement.id] = match.rom;
      }
      const state = await app.install(id, { roms });
      const relinked = app.relinkMods(id);
      sendJson(res, 200, { state, relinked });
    } catch (e) {
      sendJson(res, 500, { error: (e as Error).message });
    }
  });

  router.post("/api/uninstall", async (_req, res, body) => {
    const id = requirePortId(body, res);
    if (!id) return;
    app.uninstall(id);
    sendJson(res, 200, { ok: true });
  });

  router.post("/api/update", async (_req, res, body) => {
    const id = requirePortId(body, res);
    if (!id) return;
    try {
      const info = await app.update(id);
      app.relinkMods(id);
      sendJson(res, 200, { info });
    } catch (e) {
      sendJson(res, 500, { error: (e as Error).message });
    }
  });

  router.post("/api/check-update", async (_req, res, body) => {
    const id = requirePortId(body, res);
    if (!id) return;
    try {
      // Cached check (non-force): hits the GitHub API at most once per 30 min per port.
      const info = await app.checkUpdate(id);
      sendJson(res, 200, { info });
    } catch (e) {
      sendJson(res, 500, { error: (e as Error).message });
    }
  });

  router.post("/api/launch", async (_req, res, body) => {
    const id = requirePortId(body, res);
    if (!id) return;
    const executable = app.launch(id);
    if (!executable) return sendJson(res, 404, { error: "port not installed" });
    try {
      // Entorno sin las variables de Steam que crashean los binarios nativos.
      const child = spawn(executable, [], {
        cwd: path.dirname(executable),
        detached: true,
        stdio: "ignore",
        env: cleanLaunchEnv(),
      });
      child.on("error", (err: Error) => {
        console.error(`[launch] ${executable}: ${err.message}`);
      });
      child.unref();
      sendJson(res, 200, { ok: true, exe: executable });
    } catch (e) {
      sendJson(res, 500, { error: (e as Error).message });
    }
  });
}
