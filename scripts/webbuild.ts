// esbuild config: bundles src/web/main.tsx → dist/web/bundle.js + bundle.css
import { build, context } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, '..', 'src', 'web');
const dest = path.join(__dirname, '..', 'dist', 'web');

const shared = {
  entryPoints: [path.join(src, 'main.tsx')],
  bundle: true,
  format: 'esm' as const,
  target: 'es2020' as const,
  outdir: dest,
  entryNames: 'bundle',
  minify: true,
  sourcemap: false,
  loader: {
    '.ts': 'ts' as const,
    '.tsx': 'tsx' as const,
    '.css': 'css' as const,
    // Font files referenced by CSS url() (material-symbols woff2) → emit as assets
    '.woff': 'file' as const,
    '.woff2': 'file' as const,
    '.ttf': 'file' as const,
  },
  jsxFactory: 'h',
  jsxFragment: 'Fragment',
  alias: {
    preact: 'preact',
  },
};

async function main(): Promise<void> {
  if (process.argv.includes('--watch')) {
    const ctx = await context(shared);
    await ctx.watch();
    console.info('Watching web sources for changes...');
  } else {
    await build(shared);
    console.info('Web bundle built → dist/web/bundle.js + bundle.css');
  }
}

void main();
