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

function copyAll(): void {
  buildBundle();
  // Copy static assets (HTML, images) to dist/web
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.isFile() && /\.(html|png|svg|ico|json)$/.test(entry.name)) {
      fs.copyFileSync(path.join(src, entry.name), path.join(dest, entry.name));
    }
  }
  console.log('copied src/web → dist/web (with Preact bundle)');
}

copyAll();

// --watch mode
if (process.argv.includes('--watch')) {
  console.log('watching src/web for changes...');
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
