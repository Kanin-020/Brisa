import AdmZip from "adm-zip";
import type { App } from "../../core/app";
import { sendError, sendJson } from "../http";
import type { ApiRouter } from "../router";

export function registerManifestsRoutes(router: ApiRouter, app: App): void {
  // Exporta todos los manifiestos como un ZIP con un <id>.json por port
  // (descomprimible directamente sobre la carpeta manifests/).
  router.get("/api/manifests/export", async (_req, res) => {
    const manifests = app.exportManifests();
    const zip = new AdmZip();
    for (const manifest of manifests) {
      // Sanea el id igual que en la importación para evitar nombres de
      // entrada inseguros o no válidos en el ZIP.
      const safeId = manifest.id.replace(/[^A-Za-z0-9._-]/g, "_");
      zip.addFile(`${safeId}.json`, Buffer.from(JSON.stringify(manifest, null, 2) + "\n", "utf8"));
    }
    const buf = zip.toBuffer();
    res.writeHead(200, {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="brisa-manifests.zip"',
      "X-Manifest-Count": String(manifests.length),
    });
    res.end(buf);
  });

  router.post("/api/manifests/import", async (_req, res, body) => {
    let raw: unknown[];
    if (Array.isArray(body)) {
      raw = body;
    } else if (body && typeof body === "object" && typeof (body as { id?: unknown }).id === "string") {
      // Un único manifiesto (archivo JSON suelto) también es válido.
      raw = [body];
    } else {
      raw = (body as { manifests?: unknown[] })?.manifests ?? [];
    }
    if (raw.length === 0) {
      return sendError(res, 400, "expected an array of manifests");
    }
    const result = app.importManifests(raw);
    sendJson(res, 200, { ok: true, ...result });
  });
}
