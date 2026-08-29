// esbuild config: bundles CLI and desktop entry points into single minified files.
// This replaces `tsc` for the production build — much faster startup + smaller dist.
import { build } from 'esbuild';
import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

/** Read package.json dependencies to mark them as external. */
function getExternalDeps(): string[] {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
  );
  return [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    // Node built-ins
    'electron',
  ];
}

async function main(): Promise<void> {
  const external = getExternalDeps();

  // ── CLI entry (brisa CLI) ──
  await build({
    entryPoints: [path.join(SRC, 'cli.ts')],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    outfile: path.join(DIST, 'cli.js'),
    external,
    minify: true,
    treeShaking: true,
    sourcemap: false,
    logLevel: 'warning',
  });

  // ── Desktop entry (Electron main process) ──
  await build({
    entryPoints: [path.join(SRC, 'desktop', 'main.ts')],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    outfile: path.join(DIST, 'desktop', 'main.js'),
    external: [...external, 'node:*'],
    minify: true,
    treeShaking: true,
    sourcemap: false,
    logLevel: 'warning',
  });

  console.info('Backend bundled → dist/cli.js + dist/desktop/main.js');
}

void main();
