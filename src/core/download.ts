import * as fs from "node:fs";
import * as path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { USER_AGENT } from "./constants";
import type { AppConfig } from "./config";
import { CancelledError, throwIfAborted } from "./tasks";

export type ProgressFn = (done: number, total: number) => void;

export interface DownloadOptions {
  /** Si se aborta, la descarga se detiene y se borra el archivo parcial. */
  signal?: AbortSignal;
}

export async function download(
  cfg: AppConfig,
  url: string,
  dest: string,
  onProgress?: ProgressFn,
  opts: DownloadOptions = {},
): Promise<void> {
  const { signal } = opts;
  throwIfAborted(signal);
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/octet-stream" },
    redirect: "follow",
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Download failed: HTTP ${res.status} for ${url}`);
  }
  const total = Number(res.headers.get("content-length") ?? 0);
  let done = 0;
  const src = Readable.fromWeb(res.body as never);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const file = fs.createWriteStream(dest);
  src.on("data", (chunk: Buffer) => {
    done += chunk.length;
    onProgress?.(done, total);
  });
  try {
    // pipeline() con { signal } destruye los streams al abortar y rechaza con
    // AbortError; lo convertimos en CancelledError y limpiamos el parcial.
    await pipeline(src, file, { signal });
  } catch (err) {
    if (signal?.aborted) {
      fs.rmSync(dest, { force: true });
      throw new CancelledError("Descarga cancelada");
    }
    throw err;
  }
}

export function downloadPath(cfg: AppConfig, portId: string, assetName: string): string {
  return path.join(cfg.cacheDir, "downloads", portId, assetName);
}
