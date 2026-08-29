import type { App } from "../../core/app";
import { sendJson } from "../http";
import type { ApiRouter } from "../router";

export interface SelfUpdateRouteOptions {
  /** Se llama tras aplicar un self-update (la app de escritorio lo usa para salir y relanzarse). */
  onSelfUpdate?: () => void;
}

export function registerSelfUpdateRoutes(
  router: ApiRouter,
  app: App,
  opts: SelfUpdateRouteOptions = {},
): void {
  router.post("/api/self-update/check", async (_req, res) => {
    const info = await app.selfUpdateInfo(false);
    sendJson(res, 200, { info });
  });

  router.post("/api/self-update", async (_req, res) => {
    const info = await app.selfUpdate((_stage, _done, _total) => {
      // Sin progreso en la GUI por ahora: la descarga se reporta al terminar.
    });
    sendJson(res, 200, { info });
    // La app de escritorio se cierra para que el updater la reemplace, pero
    // SOLO si se aplicó una actualización (available=false significa "ya en
    // la última versión" o asset no encontrado: nada que reemplazar).
    if (info.available) setTimeout(() => opts.onSelfUpdate?.(), 1000);
  });
}
