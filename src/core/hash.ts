import * as crypto from "node:crypto";
import * as fs from "node:fs";

export function sha1File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha1");
    const stream = fs.createReadStream(file);
    stream.on("data", (d) => hash.update(d));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

/** Cheap fingerprint of a file for caching hash results. */
export function fileFingerprint(file: string): { size: number; mtimeMs: number } {
  const st = fs.statSync(file);
  return { size: st.size, mtimeMs: st.mtimeMs };
}
