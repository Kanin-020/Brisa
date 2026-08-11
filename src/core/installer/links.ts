import * as fs from "node:fs";
import * as path from "node:path";

/** Create a symlink, falling back to a file copy on platforms without symlink privileges. */
export function createSymlink(target: string, link: string): void {
  fs.mkdirSync(path.dirname(link), { recursive: true });
  if (fs.existsSync(link)) fs.rmSync(link, { force: true });
  try {
    fs.symlinkSync(target, link);
  } catch {
    // Fallback: copy for platforms without symlink privileges (older Windows).
    fs.copyFileSync(target, link);
  }
}

/** Search a directory tree for a file by basename (case-insensitive). */
export function findFileByName(dir: string, basename: string): string | null {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === basename.toLowerCase()) return full;
    if (entry.isDirectory()) {
      const sub = findFileByName(full, basename);
      if (sub) return sub;
    }
  }
  return null;
}
