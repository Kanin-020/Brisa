import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { App } from "../core/app";
import { projectRoot } from "../core/config";
import type { RomFile } from "../core/scanner";

// En las builds empaquetadas (desktop/CLI) la UI estática se incrusta en la
// entrada CLI por scripts/build-desktop.mjs y se expone vía __WEB_ASSETS__.
const embeddedAssets = (globalThis as Record<string, unknown>).__WEB_ASSETS__ as
  | Record<string, string>
  | undefined;

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
};

type Handler = (req: http.IncomingMessage, res: http.ServerResponse, body: unknown) => void | Promise<void>;

const routes = new Map<string, Handler>();

function route(method: string, pattern: RegExp, handler: Handler) {
  routes.set(`${method} ${pattern.source}`, handler);
}

function sendJson(res: http.ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

export function startServer(
  app: App,
  port: number,
  onReady?: (url: string) => void,
  opts: { openBrowser?: boolean } = {},
): http.Server {
  // ---- API ----
  route("GET", /^\/api\/status$/, async (_req, res) => {
    const { scan, ports } = await app.status();
    sendJson(res, 200, { scan, ports, platform: app.platform, cfg: { romsDir: app.cfg.romsDir, modsDir: app.cfg.modsDir, portsDir: app.cfg.portsDir } });
  });

  route("POST", /^\/api\/install$/, async (req, res, body) => {
    const id = (body as { id?: string })?.id;
    if (!id) return sendJson(res, 400, { error: "missing id" });
    try {
      const m = app.manifest(id);
      if (!m) return sendJson(res, 404, { error: "port not found" });
      const { scan } = await app.status();
      const roms: Record<string, RomFile> = {};
      for (const mm of scan.matches) {
        if (mm.manifest.id === id) roms[mm.requirement.id] = mm.rom;
      }
      const state = await app.install(id, { roms });
      const relinked = app.relinkMods(id);
      sendJson(res, 200, { state, relinked });
    } catch (e) {
      sendJson(res, 500, { error: (e as Error).message });
    }
  });

  route("POST", /^\/api\/uninstall$/, async (req, res, body) => {
    const id = (body as { id?: string })?.id;
    if (!id) return sendJson(res, 400, { error: "missing id" });
    app.uninstall(id);
    sendJson(res, 200, { ok: true });
  });

  route("POST", /^\/api\/update$/, async (req, res, body) => {
    const id = (body as { id?: string })?.id;
    if (!id) return sendJson(res, 400, { error: "missing id" });
    try {
      const info = await app.update(id);
      app.relinkMods(id);
      sendJson(res, 200, { info });
    } catch (e) {
      sendJson(res, 500, { error: (e as Error).message });
    }
  });

  route("POST", /^\/api\/check-update$/, async (req, res, body) => {
    const id = (body as { id?: string })?.id;
    if (!id) return sendJson(res, 400, { error: "missing id" });
    try {
      // Cached check (non-force): hits the GitHub API at most once per 30 min per port.
      const info = await app.checkUpdate(id);
      sendJson(res, 200, { info });
    } catch (e) {
      sendJson(res, 500, { error: (e as Error).message });
    }
  });

  route("POST", /^\/api\/launch$/, async (req, res, body) => {
    const id = (body as { id?: string })?.id;
    if (!id) return sendJson(res, 400, { error: "missing id" });
    const exe = app.launch(id);
    if (!exe) return sendJson(res, 404, { error: "port not installed" });
    try {
      const { spawn } = require("node:child_process");
      const child = spawn(exe, [], { cwd: path.dirname(exe), detached: true, stdio: "ignore" });
      child.on("error", (err: Error) => {
        console.error(`[launch] ${exe}: ${err.message}`);
      });
      child.unref();
      sendJson(res, 200, { ok: true, exe });
    } catch (e) {
      sendJson(res, 500, { error: (e as Error).message });
    }
  });

  route("POST", /^\/api\/mods\/link$/, async (req, res, body) => {
    const b = body as { id?: string; mod?: string };
    if (!b.id || !b.mod) return sendJson(res, 400, { error: "missing id/mod" });
    try {
      app.linkMod(b.id, b.mod);
      sendJson(res, 200, { ok: true });
    } catch (e) {
      sendJson(res, 500, { error: (e as Error).message });
    }
  });

  route("POST", /^\/api\/mods\/unlink$/, async (req, res, body) => {
    const b = body as { id?: string; mod?: string };
    if (!b.id || !b.mod) return sendJson(res, 400, { error: "missing id/mod" });
    try {
      app.unlinkMod(b.id, b.mod);
      sendJson(res, 200, { ok: true });
    } catch (e) {
      sendJson(res, 500, { error: (e as Error).message });
    }
  });

  route("POST", /^\/api\/relink-mods$/, async (req, res, body) => {
    const id = (body as { id?: string })?.id;
    if (!id) return sendJson(res, 400, { error: "missing id" });
    app.relinkMods(id);
    sendJson(res, 200, { ok: true });
  });

  route("POST", /^\/api\/registry$/, async (_req, res) => {
    try {
      const n = await app.refreshRegistry();
      sendJson(res, 200, { ok: true, manifests: n });
    } catch (e) {
      sendJson(res, 500, { error: (e as Error).message });
    }
  });

  // Subida de ROMs: el cuerpo se lee como binario (posiblemente de varios GB),
  // así que NO pasa por readJson — se gestiona antes del bucle de rutas
  // (ver el handler de POST en el createServer de abajo).

  route("POST", /^\/api\/roms\/delete$/, async (_req, res, body) => {
    const p = (body as { path?: string })?.path;
    if (!p) return sendJson(res, 400, { error: "missing path" });
    try {
      app.deleteRom(p);
      sendJson(res, 200, { ok: true });
    } catch (e) {
      sendJson(res, 400, { error: (e as Error).message });
    }
  });

  route("POST", /^\/api\/open-folder$/, async (_req, res, body) => {
    const dir = (body as { dir?: string })?.dir;
    try {
      const ok = await app.openFolder(dir as "root" | "roms" | "mods" | "manifests" | "ports");
      sendJson(res, 200, { ok });
    } catch (e) {
      sendJson(res, 500, { error: (e as Error).message });
    }
  });

  route("GET", /^\/api\/manifests\/export$/, async (_req, res) => {
    try {
      sendJson(res, 200, { manifests: app.exportManifests() });
    } catch (e) {
      sendJson(res, 500, { error: (e as Error).message });
    }
  });

  route("POST", /^\/api\/manifests\/import$/, async (_req, res, body) => {
    let raw: unknown[];
    if (Array.isArray(body)) {
      raw = body;
    } else if (
      body &&
      typeof body === "object" &&
      typeof (body as { id?: unknown }).id === "string"
    ) {
      // Un único manifiesto (archivo JSON suelto) también es válido.
      raw = [body];
    } else {
      raw = (body as { manifests?: unknown[] })?.manifests ?? [];
    }
    if (raw.length === 0) {
      return sendJson(res, 400, { error: "expected an array of manifests" });
    }
    try {
      const result = app.importManifests(raw);
      sendJson(res, 200, { ok: true, ...result });
    } catch (e) {
      sendJson(res, 500, { error: (e as Error).message });
    }
  });

  // ---- Server ----
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const method = req.method ?? "GET";

    // Static files
    if (!url.pathname.startsWith("/api/")) {
      serveStatic(res, url.pathname);
      return;
    }

    // Upload de ROM: flujo binario directo a disco (sin buffering en RAM).
    if (url.pathname === "/api/roms/upload" && method === "POST") {
      try {
        const rawName = req.headers["x-filename"];
        let name = "rom.bin";
        if (rawName) {
          try {
            name = decodeURIComponent(String(rawName));
          } catch {
            name = "rom.bin"; // cabecera malformada
          }
        }
        const result = await app.saveRomFile(name, req);
        sendJson(res, 200, result);
      } catch (e) {
        sendJson(res, 400, { error: (e as Error).message });
      }
      return;
    }

    let body: unknown = null;
    if (method === "POST") {
      body = await readJson(req);
    }

    for (const [key, handler] of routes) {
      const [m, patternSrc] = key.split(" ");
      if (m !== method) continue;
      const re = new RegExp(patternSrc);
      if (re.test(url.pathname)) {
        try {
          await handler(req, res, body);
        } catch (e) {
          sendJson(res, 500, { error: (e as Error).message });
        }
        return;
      }
    }
    sendJson(res, 404, { error: "not found" });
  });

  server.listen(port, () => {
    // Con port 0 el puerto real lo asigna el SO; se lee de server.address().
    const addr = server.address();
    const actualPort = typeof addr === "object" && addr ? addr.port : port;
    const url = `http://localhost:${actualPort}`;
    console.log(`\n  Brisa GUI: ${url}\n`);
    onReady?.(url);
    // La app de escritorio (Electron) abre su propia ventana y no un navegador.
    if (opts.openBrowser === false) return;
    // Try to open the browser
    try {
      const { spawn } = require("node:child_process");
      const opener =
        process.platform === "win32"
          ? "start"
          : process.platform === "darwin"
            ? "open"
            : process.env.WSL_DISTRO_NAME
              ? "wslview"
              : "xdg-open";
      const child = spawn(opener, [url], { detached: true, stdio: "ignore" });
      child.on("error", () => {
        /* opener no disponible (entorno sin GUI) */
      });
      child.unref();
    } catch {
      // ignore
    }
  });

  return server;
}

function serveStatic(res: http.ServerResponse, pathname: string): void {
  let rel = pathname === "/" ? "/index.html" : pathname;
  // Packaged build: serve the UI embedded in the binary first.
  if (embeddedAssets) {
    const key = rel.replace(/^\/+/, "");
    const content = embeddedAssets[key];
    if (content !== undefined) {
      const ext = path.extname(key);
      res.writeHead(200, { "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream" });
      // Los binarios se incrustan en base64 (prefijo "b64:") desde build-desktop.mjs.
      res.end(content.startsWith("b64:") ? Buffer.from(content.slice(4), "base64") : content);
      return;
    }
  }
  // dist/web empaquetado (Electron desktop), luego dist/web y src/web (dev).
  const candidates = [
    process.env.PORT_HUB_WEB_ROOT ? path.join(process.env.PORT_HUB_WEB_ROOT, rel) : null,
    path.join(projectRoot(), "dist", "web", rel),
    path.join(projectRoot(), "src", "web", rel),
  ].filter((f): f is string => f !== null);
  for (const file of candidates) {
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      const ext = path.extname(file);
      res.writeHead(200, { "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
      return;
    }
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found");
}

function readJson(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}
