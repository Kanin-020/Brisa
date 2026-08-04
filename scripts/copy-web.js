// Copies the static web UI into dist so the server can serve it after build.
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "src", "web");
const dest = path.join(__dirname, "..", "dist", "web");

function copyDir(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const s = path.join(srcDir, entry.name);
    const d = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

copyDir(src, dest);
console.log("copied src/web -> dist/web");