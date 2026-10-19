// `localpay` commands. main() returns an exit code; `start` also returns the running
// server so tests (and embedders) can stop it.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createLocalPay, type LocalPay, type LocalPayDependencies } from '@localpay/server';
import { banner, createStyle } from './banner.ts';
import { parseStartOptions, UsageError } from './options.ts';
import { callServer, readSession, removeSession, writeSession } from './session.ts';

export interface Io {
  out: (text: string) => void;
  err: (text: string) => void;
  env: NodeJS.ProcessEnv;
  cwd: string;
  color: boolean;
}

export interface Result {
  code: number;
  server?: LocalPay;
  /** Stops a started server and removes its session file. */
  stop?: () => Promise<void>;
}

export const VERSION = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;

export const HELP = `LocalPay — a Razorpay-compatible payment emulator for local testing.

Usage
  localpay [start] [options]        start the server (default command)
  localpay status [--port N]        show what a running server holds
  localpay reset [--port N]         delete all data in a running server
  localpay time [--port N]          show emulator time
  localpay time advance <duration>  fast-forward, e.g. 1h, 3d, 1w [--port N]
  localpay scenario list            list the built-in scenario gallery [--port N]
  localpay scenario run <file|id>   run a YAML scenario on a running server [--port N]
  localpay help | --version

Start options
  -p, --port <n>              port (default 4010)
      --host <addr>           bind address (default 127.0.0.1)
      --allow-public          allow a non-loopback --host (needs --dashboard-password)
      --dashboard-password <p>
      --key <id:secret>       API key, repeatable (default rzp_test_LocalPayDemo01)
      --webhook <url>         webhook target, repeatable
      --webhook-secret <s>    secret for X-Razorpay-Signature (default localpay_webhook_secret)
      --webhook-events <a,b>  only these events
      --fault <name=value>    duplicate=0.2, out-of-order=0.2, unsigned=0.1, delay=500
      --no-auto-capture       stop successful payments at authorized
      --refund-delay <s>      seconds before refunds are processed (default 5)
      --settlement-days <n>   days from capture to settlement (default 2)
      --persist <file>        keep data in a JSONL event log between runs
      --seed <value>          deterministic ids
      --allowed-origin <url>  allow checkout on a non-localhost origin, repeatable
      --config <file>         JSON config (default ./localpay.config.json if present)
      --open                  open the dashboard in a browser

Environment: LOCALPAY_PORT, LOCALPAY_HOST, LOCALPAY_SEED, LOCALPAY_PERSIST,
LOCALPAY_KEY_ID + LOCALPAY_KEY_SECRET, LOCALPAY_WEBHOOK_URL + LOCALPAY_WEBHOOK_SECRET.

LocalPay never moves money and is not affiliated with Razorpay.`;

/** In the published package, the dashboard and checkout.js ship in dist/assets. */
export function bundledAssets(assetsDir = fileURLToPath(new URL('./assets/', import.meta.url))): LocalPayDependencies {
  const checkout = `${assetsDir}checkout.js`;
  if (!existsSync(checkout)) return {};
  return { dashboardDir: `${assetsDir}dashboard`, galleryDir: `${assetsDir}scenarios`, checkoutScript: () => readFile(checkout, 'utf8') };
}

function openBrowser(url: string): void {
  const [command, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : [process.platform === 'darwin' ? 'open' : 'xdg-open', [url]];
  spawn(command, args, { stdio: 'ignore', detached: true }).on('error', () => undefined).unref();
}

async function start(argv: string[], io: Io): Promise<Result> {
  const options = parseStartOptions(argv, io.env, io.cwd);
  if (options.help) {
    io.out(HELP);
    return { code: 0 };
  }
  // Public binding needs a dashboard password; generate one rather than refuse (Docker).
  let generatedPassword: string | null = null;
  if (options.config.allowPublic && !options.config.dashboardPassword) {
    generatedPassword = randomBytes(12).toString('base64url');
    options.config.dashboardPassword = generatedPassword;
  }
  const server = await createLocalPay(options.config, bundledAssets());
  const url = await server.listen();
  const port = Number(new URL(url).port);
  try {
    writeSession(port, { url, token: server.adminAuth.token, pid: process.pid }, io.env);
  } catch (error) {
    // Read-only filesystems (containers) cannot keep a session file; only the CLI helpers need it.
    io.err(`localpay: could not write the session file (${error instanceof Error ? error.message : String(error)}); status/reset/time/scenario commands will not find this server.`);
  }
  const dashboardUrl = server.dashboardUrl(url);
  io.out(banner({ version: VERSION, url, dashboardUrl, config: server.config, generatedPassword }, createStyle(io.color)));
  if (options.open) openBrowser(dashboardUrl);
  const stop = async () => {
    removeSession(port, io.env);
    await server.close();
  };
  return { code: 0, server, stop };
}

function portOf(argv: string[], io: Io): { port: number; rest: string[] } {
  const { values, positionals } = parseArgs({ args: argv, options: { port: { type: 'string', short: 'p' } }, allowPositionals: true, strict: true });
  const port = Number(values.port ?? io.env.LOCALPAY_PORT ?? 4010);
  if (!Number.isInteger(port)) throw new UsageError('--port must be a number');
  return { port, rest: positionals };
}

async function status(argv: string[], io: Io): Promise<Result> {
  const { port } = portOf(argv, io);
  const session = readSession(port, io.env);
  const info = await callServer<{ accountId: string; eventCount: number; time: number; autoCapture: boolean }>(session, '/session');
  const orders = await callServer<{ items: unknown[] }>(session, '/orders');
  const payments = await callServer<{ items: unknown[] }>(session, '/payments');
  io.out(`LocalPay at ${session.url}\n  orders ${orders.items.length} · payments ${payments.items.length} · events ${info.eventCount}\n  emulator time ${new Date(info.time * 1000).toISOString()}`);
  return { code: 0 };
}

async function reset(argv: string[], io: Io): Promise<Result> {
  const { port } = portOf(argv, io);
  await callServer(readSession(port, io.env), '/reset', { method: 'POST' });
  io.out('All LocalPay data deleted.');
  return { code: 0 };
}

async function time(argv: string[], io: Io): Promise<Result> {
  const { port, rest } = portOf(argv, io);
  const session = readSession(port, io.env);
  if (rest[0] === 'advance') {
    if (!rest[1]) throw new UsageError('usage: localpay time advance <duration>, e.g. 3d');
    const result = await callServer<{ now: number; processed: number }>(session, '/time/advance', { method: 'POST', body: { duration: rest[1] } });
    io.out(`Emulator time is now ${new Date(result.now * 1000).toISOString()} (${result.processed} scheduled change(s) ran).`);
    return { code: 0 };
  }
  if (rest.length > 0) throw new UsageError(`unknown time command "${rest[0] ?? ''}"`);
  const result = await callServer<{ now: number; offsetMs: number }>(session, '/time');
  io.out(`Emulator time ${new Date(result.now * 1000).toISOString()} (${(result.offsetMs / 3_600_000).toFixed(1)} h ahead of real time).`);
  return { code: 0 };
}

interface ScenarioRun {
  name: string;
  ok: boolean;
  steps: { at: string; step: string; ok: boolean; detail: string }[];
  checks: { name: string; ok: boolean; detail: string }[];
  summary: Record<string, Record<string, number>>;
}

async function scenario(argv: string[], io: Io): Promise<Result> {
  const { port, rest } = portOf(argv, io);
  const session = readSession(port, io.env);
  const [action, target] = rest;
  if (action === 'list') {
    const { items } = await callServer<{ items: { id: string; name: string; description: string }[] }>(session, '/scenarios');
    io.out(items.map((s) => `${s.id.padEnd(34)} ${s.name}`).join('\n'));
    return { code: 0 };
  }
  if (action !== 'run' || !target) throw new UsageError('usage: localpay scenario run <file.yaml | gallery-id>, or localpay scenario list');
  const file = resolve(io.cwd, target);
  const body = existsSync(file) ? { yaml: readFileSync(file, 'utf8') } : { id: target };
  const result = await callServer<ScenarioRun>(session, '/scenarios/run', { method: 'POST', body });
  const style = createStyle(io.color);
  const mark = (ok: boolean) => (ok ? style.blue('✓') : style.red('✗'));
  const lines = [style.bold(result.name)];
  for (const step of result.steps) lines.push(`  ${mark(step.ok)} ${step.at.padEnd(8)} ${step.step.padEnd(14)} ${step.detail}`);
  for (const check of result.checks) lines.push(`  ${mark(check.ok)} expect ${check.name}: ${check.detail}`);
  const counts = Object.entries(result.summary)
    .filter(([, byStatus]) => Object.keys(byStatus).length > 0)
    .map(([kind, byStatus]) => `${kind} ${Object.entries(byStatus).map(([s, n]) => `${n} ${s}`).join(', ')}`);
  if (counts.length) lines.push(style.dim(`  ${counts.join(' · ')}`));
  lines.push(result.ok ? 'Scenario passed.' : style.red('Scenario failed.'));
  io.out(lines.join('\n'));
  return { code: result.ok ? 0 : 1 };
}

export async function main(argv: string[], io: Io): Promise<Result> {
  const [first, ...rest] = argv;
  try {
    switch (first) {
      case undefined:
        return await start([], io);
      case 'start':
        return await start(rest, io);
      case 'status':
        return await status(rest, io);
      case 'reset':
        return await reset(rest, io);
      case 'time':
        return await time(rest, io);
      case 'scenario':
        return await scenario(rest, io);
      case 'help':
      case '--help':
      case '-h':
        io.out(HELP);
        return { code: 0 };
      case '--version':
      case '-v':
        io.out(VERSION);
        return { code: 0 };
      default:
        if (first.startsWith('-')) return await start(argv, io);
        throw new UsageError(`unknown command "${first}". Run localpay help.`);
    }
  } catch (error) {
    if (error instanceof UsageError || (error instanceof Error && error.name === 'ConfigError')) {
      io.err(`localpay: ${error.message}`);
      return { code: 2 };
    }
    throw error;
  }
}
