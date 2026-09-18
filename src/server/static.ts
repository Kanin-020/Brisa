import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ServerResponse } from 'node:http';
import { projectRoot } from '../core/config';

// En las builds empaquetadas (desktop/CLI) la UI estática se incrusta en la
// entrada CLI por scripts/build-desktop.mjs y se expone vía __WEB_ASSETS__.
const embeddedAssets = (globalThis as Record<string, unknown>).__WEB_ASSETS__ as
  Record<string, string> | undefined;

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};

/**
 * Cache policy per asset type.
 *
 * Only content-hashed filenames (e.g. material-symbols-outlined-NVVFEMFN.woff2,
 * emitted by esbuild's "file" loader) are safe to cache as immutable: their URL
 * changes whenever the content changes. Unhashed entries (bundle.js, bundle.css,
 * lang/*.json) MUST be revalidated on every load — marking them immutable serves
 * users a stale UI after updates (old i18n strings + new bundle = duplicated icons).
 */
const HASHED_NAME = /-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/;
const IMMUTABLE_EXTS = new Set(['.woff2', '.woff', '.ttf']);
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.svg', '.ico', '.webp']);

function cacheControlFor(ext: string, rel: string): string {
  if (ext === '.html') return 'no-cache';
  if (ext === '.json' || rel.startsWith('lang/')) return 'no-cache';
  if (ext === '.js' || ext === '.css') return 'no-cache';
  if (IMMUTABLE_EXTS.has(ext) || HASHED_NAME.test(rel)) {
    return 'public, max-age=31536000, immutable';
  }
  if (IMAGE_EXTS.has(ext)) return 'public, max-age=3600';
  return 'no-cache';
}

export function serveStatic(res: ServerResponse, pathname: string): void {
  const rel = pathname === '/' ? '/index.html' : pathname;
  // Packaged build: serve the UI embedded in the binary first.
  if (embeddedAssets) {
    const key = rel.replace(/^\/+/, '');
    const content = embeddedAssets[key];
    if (content !== undefined) {
      const ext = path.extname(key);
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream',
        'Cache-Control': cacheControlFor(ext, key),
      });
      // Los binarios se incrustan en base64 (prefijo "b64:") desde build-desktop.mjs.
      res.end(content.startsWith('b64:') ? Buffer.from(content.slice(4), 'base64') : content);
      return;
    }
  }
  // dist/web empaquetado (Electron desktop), luego dist/web y src/web (dev).
  const candidates = [
    process.env.BRISA_WEB_ROOT ? path.join(process.env.BRISA_WEB_ROOT, rel) : null,
    path.join(projectRoot(), 'dist', 'web', rel),
    path.join(projectRoot(), 'src', 'web', rel),
  ].filter((file): file is string => file !== null);
  for (const file of candidates) {
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      const ext = path.extname(file);
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream',
        'Cache-Control': cacheControlFor(ext, rel),
      });
      fs.createReadStream(file).pipe(res);
      return;
    }
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
}
