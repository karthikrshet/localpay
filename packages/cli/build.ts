// Builds the publishable `localpay` package: one ESM bundle of the CLI and every
// @localpay/* workspace package, plus the prebuilt dashboard and checkout.js.
// Third-party runtime dependencies stay external and are installed by npm.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export const EXTERNAL = ['fastify', '@fastify/static', 'zod', 'esbuild', '@localpay/checkout/build'];

export async function buildCli(): Promise<void> {
  const dashboard = here('../dashboard/dist');
  const checkout = here('../checkout/dist/checkout.js');
  for (const [path, how] of [
    [dashboard, 'pnpm --filter @localpay/dashboard build'],
    [checkout, 'pnpm --filter @localpay/checkout build'],
  ] as const) {
    if (!existsSync(path)) throw new Error(`${path} is missing; run ${how} first (or pnpm build).`);
  }

  rmSync(here('./dist'), { recursive: true, force: true });
  await build({
    entryPoints: [here('./src/bin.ts')],
    outfile: here('./dist/localpay.js'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    external: EXTERNAL,
    legalComments: 'none',
  });
  mkdirSync(here('./dist/assets'), { recursive: true });
  cpSync(dashboard, here('./dist/assets/dashboard'), { recursive: true });
  cpSync(checkout, here('./dist/assets/checkout.js'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildCli();
  console.log('built packages/cli/dist (localpay.js + assets)');
}
