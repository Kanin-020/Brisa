import type { IncomingMessage, ServerResponse } from 'node:http';

/** Responde con JSON y el status indicado. */
export function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

/** Responde con un error JSON { error } y el status indicado. */
export function sendError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: message });
}

/**
 * Lee el campo `id` del body de una petición. Si falta, responde 400 y
 * devuelve null (el handler debe abortar en ese caso).
 */
export function requireId(body: unknown, res: ServerResponse): string | null {
  const id = (body as { id?: string })?.id;
  if (!id) {
    sendError(res, 400, 'missing id');
    return null;
  }
  return id;
}

/** Lee el body JSON de una petición POST (objeto vacío si viene vacío). */
export function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}
