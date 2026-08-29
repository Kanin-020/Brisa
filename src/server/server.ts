import * as http from 'node:http';
import { gzipSync } from 'node:zlib';
import type { App } from '../core/app';
import { openUrlInBrowser } from '../core/folders';
import { sendJson, readJsonBody } from './http';
import { ApiRouter } from './router';
import { serveStatic } from './static';

/** Wraps a ServerResponse to transparently compress JSON bodies with gzip. */
function withCompression(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): http.ServerResponse {
  const accept = req.headers['accept-encoding'] ?? '';
  if (!accept.includes('gzip')) return res;

  const originalWriteHead = res.writeHead.bind(res);
  const originalEnd = res.end.bind(res);
  let headersSent = false;

  res.writeHead = function (statusCode: number, headers?: http.OutgoingHttpHeaders | number) {
    // Store headers for later; we'll add Content-Encoding when we know the body.
    (res as any).__statusHead = statusCode;
    (res as any).__statusHeaders = headers ?? {};
    return res;
  } as typeof res.writeHead;

  res.end = function (this: http.ServerResponse, chunk?: any, ...rest: any[]) {
    if (headersSent) return originalEnd(chunk, ...rest);

    const body = typeof chunk === 'string' ? Buffer.from(chunk) : chunk instanceof Buffer ? chunk : Buffer.alloc(0);
    const contentType = ((res as any).__statusHeaders as http.OutgoingHttpHeaders)?.['content-type'] ??
      this.getHeader('content-type') ?? '';
    const isJson = String(contentType).includes('application/json');

    if (isJson && body.length > 1024) {
      const compressed = gzipSync(body, { level: 6 });
      originalWriteHead((res as any).__statusHead, {
        ...(res as any).__statusHeaders,
        'Content-Encoding': 'gzip',
        'Content-Length': compressed.length,
      });
      headersSent = true;
      return originalEnd(compressed);
    }

    // No compression: send original headers and body.
    originalWriteHead((res as any).__statusHead, {
      ...(res as any).__statusHeaders,
      'Content-Length': body.length,
    });
    headersSent = true;
    return originalEnd(body);
  } as typeof res.end;

  return res;
}
import { registerStatusRoute } from './routes/status';
import { registerTasksRoutes } from './routes/tasks';
import { registerPortsRoutes } from './routes/ports';
import { registerModsRoutes } from './routes/mods';
import { registerRomsRoutes } from './routes/roms';
import { registerManifestsRoutes } from './routes/manifests';
import { registerRegistryRoute } from './routes/registry';
import { registerSelfUpdateRoutes } from './routes/self-update';
import { registerSystemRoutes } from './routes/system';

export interface ServerOptions {
  openBrowser?: boolean;
  /** Se llama tras aplicar un self-update (la app de escritorio lo usa para salir y relanzarse). */
  onSelfUpdate?: () => void;
}

export function startServer(
  app: App,
  port: number,
  onReady?: (url: string) => void,
  opts: ServerOptions = {},
): http.Server {
  const router = new ApiRouter();
  registerStatusRoute(router, app);
  registerTasksRoutes(router, app);
  registerPortsRoutes(router, app);
  registerModsRoutes(router, app);
  registerRomsRoutes(router, app);
  registerManifestsRoutes(router, app);
  registerRegistryRoute(router, app);
  registerSelfUpdateRoutes(router, app, { onSelfUpdate: opts.onSelfUpdate });
  registerSystemRoutes(router, app);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const method = req.method ?? 'GET';
    // Static files — served directly without compression wrapper (streaming).
    if (!url.pathname.startsWith('/api/')) {
      serveStatic(res, url.pathname);
      return;
    }

    // Wrap response for transparent gzip compression on JSON API responses only.
    const resC = withCompression(req, res);

    // Upload de ROM: flujo binario directo a disco (sin buffering en RAM).
    if (url.pathname === '/api/roms/upload' && method === 'POST') {
      await handleRomUpload(app, req, resC);
      return;
    }

    const body = method === 'POST' ? await readJsonBody(req) : null;
    const handled = await router.dispatch(req, resC, method, url.pathname, body);
    if (!handled) sendJson(resC, 404, { error: 'not found' });
  });

  server.listen(port, () => {
    // Con port 0 el puerto real lo asigna el SO; se lee de server.address().
    const addr = server.address();
    const actualPort = typeof addr === 'object' && addr ? addr.port : port;
    const url = `http://localhost:${actualPort}`;
    console.info(`\n  Brisa GUI: ${url}\n`);
    onReady?.(url);
    // La app de escritorio (Electron) abre su propia ventana y no un navegador.
    if (opts.openBrowser === false) return;
    openUrlInBrowser(url);
  });

  return server;
}

/** Upload de un ROM: el nombre viaja en X-Filename y el cuerpo es el binario. */
async function handleRomUpload(
  app: App,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  try {
    const rawName = req.headers['x-filename'];
    let name = 'rom.bin';
    if (rawName) {
      try {
        name = decodeURIComponent(String(rawName));
      } catch {
        name = 'rom.bin'; // cabecera malformada
      }
    }
    const result = await app.saveRomFile(name, req);
    sendJson(res, 200, result);
  } catch (e) {
    sendJson(res, 400, { error: (e as Error).message });
  }
}
