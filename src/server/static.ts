import * as fs from "node:fs";
import * as path from "node:path";
import type { ServerResponse } from "node:http";
import { projectRoot } from "../core/config";

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

export function serveStatic(res: ServerResponse, pathname: string): void {
  const rel = pathname === "/" ? "/index.html" : pathname;
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
    process.env.BRISA_WEB_ROOT ? path.join(process.env.BRISA_WEB_ROOT, rel) : null,
    path.join(projectRoot(), "dist", "web", rel),
    path.join(projectRoot(), "src", "web", rel),
  ].filter((file): file is string => file !== null);
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
