import * as fs from "node:fs";
import * as path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { AppConfig } from "./config";

export type ProgressFn = (done: number, total: number) => void;

export async function download(
  cfg: AppConfig,
  url: string,
  dest: string,
  onProgress?: ProgressFn,
): Promise<void> {
  const res = await fetch(url, {
    headers: { "User-Agent": "brisa", Accept: "application/octet-stream" },
    redirect: "follow",
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
  await pipeline(src, file);
}

export function downloadPath(cfg: AppConfig, portId: string, assetName: string): string {
  return path.join(cfg.cacheDir, "downloads", portId, assetName);
}
