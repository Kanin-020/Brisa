// Copies the static web UI into dist so the server can serve it after build.
// With `--watch` it re-copies on every change (hot reload of the web assets).
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

function copyAll() {
  copyDir(src, dest);
  console.log("copied src/web -> dist/web");
}

copyAll();

// `--watch`: recopia src/web -> dist/web cada vez que cambie un archivo web.
if (process.argv.includes("--watch")) {
  console.log("watching src/web for changes...");
  let timer = null;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(copyAll, 80);
  };
  try {
    // fs.watch({recursive}) está disponible desde Node 20 en Linux/macOS.
    fs.watch(src, { recursive: true }, schedule);
  } catch {
    // Fallback para Node < 20: vigilar cada subcarpeta por separado.
    const watchDir = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) watchDir(path.join(dir, entry.name));
      }
      fs.watch(dir, schedule);
    };
    watchDir(src);
  }
}
