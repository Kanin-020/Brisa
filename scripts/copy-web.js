// Copies the static web UI into dist so the server can serve it after build.
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "src", "web");
const dest = path.join(__dirname, "..", "dist", "web");

fs.mkdirSync(dest, { recursive: true });
for (const f of fs.readdirSync(src)) {
  fs.copyFileSync(path.join(src, f), path.join(dest, f));
}
console.log("copied src/web -> dist/web");
