import * as fs from "node:fs";
import * as path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { USER_AGENT } from "./constants";
import type { AppConfig } from "./config";
import { CancelledError, throwIfAborted } from "./tasks";

/** Tipo de callback para reportar progreso de descarga. */
export type ProgressFn = (bytesDownloaded: number, totalBytes: number) => void;

export interface DownloadOptions {
  /** Signal para cancelar la descarga. Si se aborta, se borra el archivo parcial. */
  signal?: AbortSignal;
}

/**
 * Descarga un archivo desde una URL y lo guarda en disco.
 * Soporta progreso en tiempo real y cancelación via AbortSignal.
 * En caso de cancelación, elimina el archivo parcial.
 */
export async function download(
  config: AppConfig,
  url: string,
  destinationPath: string,
  onProgress?: ProgressFn,
  options: DownloadOptions = {},
): Promise<void> {
  const { signal } = options;

  // Verificar si ya está cancelado antes de empezar
  throwIfAborted(signal);

  // Realizar petición HTTP
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/octet-stream" },
    redirect: "follow",
    signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`Download failed: HTTP ${response.status} for ${url}`);
  }

  const totalBytes = Number(response.headers.get("content-length") ?? 0);
  let bytesDownloaded = 0;

  // Convertir el body a un stream legible
  const readableStream = Readable.fromWeb(response.body as never);

  // Asegurar que el directorio destino existe
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });

  // Crear stream de escritura
  const writeStream = fs.createWriteStream(destinationPath);

  // Reportar progreso en cada chunk recibido
  readableStream.on("data", (chunk: Buffer) => {
    bytesDownloaded += chunk.length;
    onProgress?.(bytesDownloaded, totalBytes);
  });

  try {
    // pipeline() destruye los streams al abortar y rechaza con AbortError;
    // lo convertimos en CancelledError y limpiamos el archivo parcial.
    await pipeline(readableStream, writeStream, { signal });
  } catch (error) {
    if (signal?.aborted) {
      // Limpiar archivo parcial en caso de cancelación
      fs.rmSync(destinationPath, { force: true });
      throw new CancelledError("Descarga cancelada");
    }
    throw error;
  }
}

/**
 * Obtiene la ruta donde se guardará un asset descargado.
 * Estructura: cache/downloads/<portId>/<assetName>
 */
export function downloadPath(
  config: AppConfig,
  portId: string,
  assetName: string,
): string {
  return path.join(config.cacheDir, "downloads", portId, assetName);
}
