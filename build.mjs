// Build script for the NinjaCoPilot Chrome extension.
// Bundles TypeScript entry points with esbuild and copies static assets to dist/.
import { build, context } from 'esbuild';
import { rmSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = __dirname;
const outdir = resolve(root, 'dist');
const isWatch = process.argv.includes('--watch');

/**
 * Each entry is bundled separately because the three extension contexts need
 * different output formats:
 *  - service worker: ES module (manifest background.type = "module")
 *  - content script + popup: classic IIFE (injected / loaded via <script>)
 */
const entries = [
  { in: 'src/background/service-worker.ts', out: 'background/service-worker', format: 'esm' },
  { in: 'src/content/content-script.ts', out: 'content/content-script', format: 'iife' },
  { in: 'src/popup/popup.ts', out: 'popup/popup', format: 'iife' },
];

/** Static assets copied verbatim into dist/. */
const staticAssets = [
  { from: 'src/manifest.json', to: 'manifest.json' },
  { from: 'src/popup/popup.html', to: 'popup/popup.html' },
  { from: 'src/popup/popup.css', to: 'popup/popup.css' },
  { from: 'src/icons', to: 'icons', optional: true },
];

function copyAssets() {
  for (const asset of staticAssets) {
    const src = resolve(root, asset.from);
    if (!existsSync(src)) {
      if (asset.optional) continue;
      throw new Error(`Missing required asset: ${asset.from}`);
    }
    const dest = resolve(outdir, asset.to);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest, { recursive: true });
  }
}

/** @param {typeof entries[number]} entry */
function baseOptions(entry) {
  return {
    entryPoints: [{ in: resolve(root, entry.in), out: entry.out }],
    outdir,
    bundle: true,
    format: /** @type {'esm' | 'iife'} */ (entry.format),
    target: 'chrome110',
    platform: 'browser',
    sourcemap: !isWatch ? false : 'inline',
    minify: !isWatch,
    logLevel: 'info',
    tsconfig: resolve(root, 'tsconfig.json'),
  };
}

async function run() {
  rmSync(outdir, { recursive: true, force: true });
  mkdirSync(outdir, { recursive: true });
  copyAssets();

  if (isWatch) {
    const ctxs = await Promise.all(entries.map((e) => context(baseOptions(e))));
    await Promise.all(ctxs.map((c) => c.watch()));
    console.log('[build] watching for changes...');
    // Keep static assets fresh on a light interval; esbuild watch only tracks JS/TS.
    setInterval(copyAssets, 1000);
  } else {
    await Promise.all(entries.map((e) => build(baseOptions(e))));
    console.log('[build] done ->', outdir);
  }
}

run().catch((error) => {
  console.error('[build] failed:', error);
  process.exit(1);
});
