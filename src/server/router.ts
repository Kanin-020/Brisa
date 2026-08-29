import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson } from './http';

export type ApiHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  body: unknown,
) => void | Promise<void>;

/**
 * Router de los endpoints /api/*: asocia método + ruta literal a un handler.
 * Cada dominio (ports, mods, roms, …) registra sus rutas aquí.
 */
export class ApiRouter {
  private routes = new Map<string, ApiHandler>();

  register(method: string, pathname: string, handler: ApiHandler): void {
    this.routes.set(`${method} ${pathname}`, handler);
  }

  get(pathname: string, handler: ApiHandler): void {
    this.register('GET', pathname, handler);
  }

  post(pathname: string, handler: ApiHandler): void {
    this.register('POST', pathname, handler);
  }

  /**
   * Dispatch a request to its handler. Returns true when a route matched;
   * handler errors become 500 responses.
   */
  async dispatch(
    req: IncomingMessage,
    res: ServerResponse,
    method: string,
    pathname: string,
    body: unknown,
  ): Promise<boolean> {
    const handler = this.routes.get(`${method} ${pathname}`);
    if (!handler) return false;
    try {
      await handler(req, res, body);
    } catch (e) {
      sendJson(res, 500, { error: (e as Error).message });
    }
    return true;
  }
}
