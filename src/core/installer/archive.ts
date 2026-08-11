import * as fs from "node:fs";
import * as path from "node:path";
import AdmZip from "adm-zip";
import * as tar from "tar";
import type { AssetDef } from "../manifest";

/**
 * Extract the downloaded asset into the port dir.
 * - zip / tar.gz: unpack the archive.
 * - appimage / apk: the asset is a single file, so `destDir` is the file path.
 */
export async function extractArchive(asset: AssetDef, archivePath: string, destDir: string): Promise<void> {
  fs.mkdirSync(destDir, { recursive: true });
  if (asset.type === "zip") {
    const zip = new AdmZip(archivePath);
    zip.extractAllTo(destDir, true);
  } else if (asset.type === "tar.gz") {
    await tar.x({ file: archivePath, cwd: destDir });
  } else {
    // appimage / apk: single file
    fs.mkdirSync(path.dirname(destDir), { recursive: true });
    fs.copyFileSync(archivePath, destDir);
  }
}
