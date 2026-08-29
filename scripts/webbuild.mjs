// esbuild config: bundles src/web/main.jsx → dist/web/bundle.js + bundle.css
import { build, context } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, '..', 'src', 'web');
const dest = path.join(__dirname, '..', 'dist', 'web');

const shared = {
  entryPoints: [path.join(src, 'main.jsx')],
  bundle: true,
  format: 'esm',
  target: 'es2020',
  outdir: dest,
  entryNames: 'bundle',
  minify: false,
  sourcemap: false,
  loader: {
    '.jsx': 'jsx',
    '.css': 'css',
  },
  jsxFactory: 'h',
  jsxFragment: 'Fragment',
  alias: {
    'preact': 'preact',
  },
};

if (process.argv.includes('--watch')) {
  const ctx = await context(shared);
  await ctx.watch();
  console.log('Watching web sources for changes...');
} else {
  await build(shared);
  console.log('Web bundle built → dist/web/bundle.js + bundle.css');
}
