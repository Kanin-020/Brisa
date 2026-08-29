// Bundles Preact components via esbuild, then copies static assets into dist/web.
// With `--watch` it re-builds on every change.
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, '..', 'src', 'web');
const dest = path.join(__dirname, '..', 'dist', 'web');

function buildBundle(): void {
  const script = path.join(__dirname, 'webbuild.ts');
  execSync(`npx tsx ${script}`, { stdio: 'inherit' });
}

function copyDir(from: string, to: string): void {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const srcPath = path.join(from, entry.name);
    const destPath = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      // Skip source files already bundled by esbuild (JS, TS, TSX).
      // Only copy CSS, JSON, images, and other static assets.
      if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) continue;
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyAll(): void {
  buildBundle();
  // Copy only needed static assets to dist/web (NOT .js/.ts/.tsx — those
  // are in bundle.js produced by esbuild above).
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.isFile() && /\.(html|png|svg|ico|json)$/.test(entry.name)) {
      fs.copyFileSync(path.join(src, entry.name), path.join(dest, entry.name));
    }
    // Copy subdirectories like assets/ and lang/
    if (entry.isDirectory()) {
      copyDir(path.join(src, entry.name), path.join(dest, entry.name));
    }
  }
  console.info('copied src/web → dist/web (with Preact bundle)');
}

copyAll();

// --watch mode
if (process.argv.includes('--watch')) {
  console.info('watching src/web for changes...');
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(copyAll, 200);
  };
  try {
    fs.watch(src, { recursive: true }, schedule);
  } catch {
    const watchDir = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) watchDir(path.join(dir, entry.name));
      }
      fs.watch(dir, schedule);
    };
    watchDir(src);
  }
}
