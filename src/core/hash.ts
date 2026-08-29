import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AppConfig } from './config';

export function sha1File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha1');
    const stream = fs.createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/** Cheap fingerprint of a file for caching hash results. */
export function fileFingerprint(file: string): { size: number; mtimeMs: number } {
  const st = fs.statSync(file);
  return { size: st.size, mtimeMs: st.mtimeMs };
}

/** Cache file path for the SHA1 of a ROM file (keyed by a sanitized absolute path). */
export function hashCacheFile(cfg: AppConfig, file: string): string {
  const key = file.replace(/[^a-zA-Z0-9]/g, '_');
  return path.join(cfg.cacheDir, 'hashes', `${key}.json`);
}
