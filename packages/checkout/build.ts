// Bundles checkout.js into one minified IIFE. `pnpm --filter @localpay/checkout build`
// writes dist/checkout.js; tests and the server can also build it in memory.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

export const SIZE_LIMIT_GZIP_BYTES = 30 * 1024;

export async function buildCheckout(): Promise<string> {
  const result = await build({
    entryPoints: [fileURLToPath(new URL('./src/index.ts', import.meta.url))],
    bundle: true,
    write: false,
    minify: true,
    format: 'iife',
    // Safari 14 has a destructuring bug esbuild will not lower, so 15 is the floor.
    target: ['es2020', 'chrome100', 'firefox100', 'safari15'],
    jsx: 'automatic',
    jsxImportSource: 'preact',
    legalComments: 'none',
    banner: { js: '/* LocalPay checkout.js — test mode only, no real money. Not affiliated with Razorpay. */' },
  });
  const file = result.outputFiles[0];
  if (!file) throw new Error('esbuild produced no output');
  return file.text;
}

export const gzipSize = (code: string): number => gzipSync(code).length;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const code = await buildCheckout();
  const out = new URL('./dist/', import.meta.url);
  mkdirSync(out, { recursive: true });
  writeFileSync(new URL('checkout.js', out), code);
  console.log(`dist/checkout.js: ${code.length} bytes, ${gzipSize(code)} bytes gzipped (limit ${SIZE_LIMIT_GZIP_BYTES})`);
}
