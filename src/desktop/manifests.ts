import * as fs from "node:fs";
import * as path from "node:path";

export function seedManifests(src: string, root: string): void {
  try {
    const dest = path.join(root, "manifests");
    if (!fs.existsSync(src)) return;
    if (fs.existsSync(dest) && fs.readdirSync(dest).length > 0) return;
    fs.mkdirSync(dest, { recursive: true });
    fs.cpSync(src, dest, { recursive: true });
  } catch (err) {
    console.error(
      "[desktop] no se pudieron sembrar los manifiestos:",
      (err as Error).message,
    );
  }
}
