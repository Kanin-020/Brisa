// Bundles Preact components via esbuild, then copies static assets (HTML, CSS, etc.)
// into dist/web.
// With `--watch` it re-builds on every change.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "src", "web");
const dest = path.join(__dirname, "..", "dist", "web");

function buildBundle() {
  const script = path.join(__dirname, "webbuild.mjs");
  execSync(`node ${script}`, { stdio: "inherit" });
}

function copyDir(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.name === "components" || entry.name.endsWith(".jsx") || entry.name.endsWith(".js")) {
      // Skip source JS/JSX files — they're bundled now
      if (entry.isFile()) continue;
    }
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
  buildBundle();
  // Copy static assets (HTML, CSS, images) but skip source JS/JSX and components dir
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.isFile() && /\.(html|css|png|svg|ico|json)$/.test(entry.name)) {
      fs.copyFileSync(path.join(src, entry.name), path.join(dest, entry.name));
    }
  }
  console.log("copied src/web → dist/web (with Preact bundle)");
}

copyAll();

// --watch mode
if (process.argv.includes("--watch")) {
  console.log("watching src/web for changes...");
  let timer = null;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(copyAll, 200);
  };
  try {
    fs.watch(src, { recursive: true }, schedule);
  } catch {
    const watchDir = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) watchDir(path.join(dir, entry.name));
      }
      fs.watch(dir, schedule);
    };
    watchDir(src);
  }
}
