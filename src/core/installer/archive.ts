import * as fs from 'node:fs';
import * as path from 'node:path';
import AdmZip from 'adm-zip';
import * as tar from 'tar';
import type { AssetDef } from '../manifest';

/**
 * Extract the downloaded asset into the port dir.
 * - zip / tar.gz: unpack the archive.
 * - appimage / apk: the asset is a single file, so `destDir` is the file path.
 *
 * When `asset.nested` is true, the archive contains another archive that
 * must be extracted in a second pass (e.g. .zip containing .tar.gz).
 */
export async function extractArchive(
  asset: AssetDef,
  archivePath: string,
  destDir: string,
): Promise<void> {
  fs.mkdirSync(destDir, { recursive: true });
  if (asset.type === 'zip') {
    const zip = new AdmZip(archivePath);
    if (asset.nested) {
      // Find the inner archive (tar.gz or zip) and extract it.
      const entries = zip.getEntries();
      const inner = entries.find((e) => /\.tar\.gz$|\.zip$/i.test(e.entryName));
      if (inner) {
        const innerPath = path.join(destDir, inner.entryName);
        zip.extractEntryTo(inner, destDir, false, true);
        if (/\.tar\.gz$/i.test(inner.entryName)) {
          await tar.x({ file: innerPath, cwd: destDir });
        } else {
          const innerZip = new AdmZip(innerPath);
          innerZip.extractAllTo(destDir, true);
        }
        try {
          fs.rmSync(innerPath, { force: true });
        } catch {
          /* ok */
        }
      } else {
        // Fallback: extract as flat zip.
        zip.extractAllTo(destDir, true);
      }
    } else {
      zip.extractAllTo(destDir, true);
    }
  } else if (asset.type === 'tar.gz') {
    await tar.x({ file: archivePath, cwd: destDir });
  } else {
    // appimage / apk: single file
    fs.mkdirSync(path.dirname(destDir), { recursive: true });
    fs.copyFileSync(archivePath, destDir);
  }
}
