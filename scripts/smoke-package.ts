// Packs the `localpay` package, installs it into an empty folder like a user would,
// starts the installed binary and checks the API, checkout.js and the dashboard.
// Run after `pnpm build`: node --experimental-strip-types scripts/smoke-package.ts
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const shell = process.platform === 'win32';
const run = (cmd: string, args: string[], cwd: string) => execFileSync(cmd, args, { cwd, stdio: 'pipe', encoding: 'utf8', shell });

const work = mkdtempSync(join(tmpdir(), 'localpay-smoke-'));
let child: ReturnType<typeof spawn> | null = null;

function check(condition: unknown, message: string): void {
  if (!condition) throw new Error(`smoke test failed: ${message}`);
  console.log(`ok  ${message}`);
}

try {
  run('pnpm', ['--filter', 'localpay', 'pack', '--pack-destination', work], resolve('.'));
  const tarball = readdirSync(work).find((f) => f.endsWith('.tgz'));
  check(tarball, 'package packs');
  const app = join(work, 'app');
  mkdirSync(app);
  writeFileSync(join(app, 'package.json'), '{"name":"smoke","private":true}');
  run('npm', ['install', '--no-audit', '--no-fund', join(work, tarball ?? '')], app);

  const bin = join(app, 'node_modules', 'localpay', 'dist', 'localpay.js');
  check(run('node', [bin, '--version'], app).trim().length > 0, 'installed binary prints a version');

  child = spawn('node', [bin, 'start', '--port', '0'], { cwd: app, env: { ...process.env, LOCALPAY_HOME: join(work, 'home'), NO_COLOR: '1' } });
  const output = await new Promise<string>((resolveOut, reject) => {
    let text = '';
    const timer = setTimeout(() => reject(new Error(`no banner after 20s:\n${text}`)), 20_000);
    child?.stdout?.on('data', (chunk: Buffer) => {
      text += chunk.toString();
      if (text.includes('?token=')) {
        clearTimeout(timer);
        resolveOut(text);
      }
    });
    child?.stderr?.on('data', (chunk: Buffer) => (text += chunk.toString()));
  });
  const dashboard = output.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[0-9a-f]+/)?.[0] ?? '';
  const base = new URL(dashboard).origin;
  check(dashboard, `server started at ${base}`);

  const auth = `Basic ${Buffer.from('rzp_test_LocalPayDemo01:localpay_demo_secret').toString('base64')}`;
  const order = (await (await fetch(`${base}/v1/orders`, { method: 'POST', headers: { authorization: auth, 'content-type': 'application/json' }, body: '{"amount":50000}' })).json()) as { id?: string };
  check(order.id?.startsWith('order_'), 'POST /v1/orders works');

  check((await (await fetch(`${base}/v1/checkout.js`)).text()).includes('TEST MODE'), 'checkout.js is served from bundled assets');

  const login = await fetch(dashboard, { redirect: 'manual' });
  const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
  const page = await fetch(`${base}/`, { headers: { cookie } });
  check(page.status === 200 && (await page.text()).includes('id="root"'), 'dashboard is served from bundled assets');
} finally {
  if (child && child.exitCode === null) {
    const exited = new Promise((done) => child?.once('exit', done));
    child.kill();
    await exited;
  }
  // Windows may hold the folder briefly after the process exits.
  rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
