import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Seeds/copies the bundled manifests (from the AppImage resources) into the
 * user data dir. Runs on every packaged launch so manifest fixes and new
 * manifests ship with app updates: bundled files overwrite the existing ones,
 * while extra user-added manifests are left untouched.
 */
export function seedManifests(src: string, root: string): void {
  try {
    const dest = path.join(root, "manifests");
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(dest, { recursive: true });
    fs.cpSync(src, dest, { recursive: true });
  } catch (err) {
    console.error(
      "[desktop] no se pudieron sembrar los manifiestos:",
      (err as Error).message,
    );
  }
}
