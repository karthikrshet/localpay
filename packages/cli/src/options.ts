// Turns flags, environment variables and an optional config file into server config.
// Precedence: defaults < localpay.config.json < LOCALPAY_* env < flags.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { DEFAULT_WEBHOOK_SECRET, type LocalPayConfig } from '@localpay/server';

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

export const START_FLAGS = {
  port: { type: 'string', short: 'p' },
  host: { type: 'string' },
  'allow-public': { type: 'boolean' },
  'dashboard-password': { type: 'string' },
  persist: { type: 'string' },
  record: { type: 'string' },
  seed: { type: 'string' },
  key: { type: 'string', multiple: true },
  webhook: { type: 'string', multiple: true },
  'webhook-secret': { type: 'string' },
  'webhook-events': { type: 'string' },
  'no-auto-capture': { type: 'boolean' },
  'refund-delay': { type: 'string' },
  'settlement-days': { type: 'string' },
  'allowed-origin': { type: 'string', multiple: true },
  fault: { type: 'string', multiple: true },
  config: { type: 'string' },
  open: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
} as const;

const FAULT_NAMES: Record<string, keyof NonNullable<LocalPayConfig['faults']>> = {
  duplicate: 'duplicateRate',
  'out-of-order': 'outOfOrderRate',
  unsigned: 'unsignedRate',
  delay: 'delayMs',
};

const int = (name: string, value: string): number => {
  if (!/^\d+$/.test(value)) throw new UsageError(`--${name} must be a whole number, got "${value}"`);
  return Number(value);
};

function parseKey(value: string): { keyId: string; keySecret: string } {
  const index = value.indexOf(':');
  if (index < 1 || index === value.length - 1) throw new UsageError(`--key must look like rzp_test_xxx:secret, got "${value.slice(0, 12)}…"`);
  return { keyId: value.slice(0, index), keySecret: value.slice(index + 1) };
}

function parseFault(value: string): [keyof NonNullable<LocalPayConfig['faults']>, number] {
  const [name = '', raw = ''] = value.split('=');
  const key = FAULT_NAMES[name];
  const number = Number(raw);
  if (!key || raw === '' || !Number.isFinite(number)) throw new UsageError(`--fault must be one of ${Object.keys(FAULT_NAMES).join(', ')}=<number>, got "${value}"`);
  return [key, number];
}

function readConfigFile(path: string | undefined, cwd: string, required: boolean): Partial<LocalPayConfig> {
  const file = resolve(cwd, path ?? 'localpay.config.json');
  if (!existsSync(file)) {
    if (required) throw new UsageError(`config file not found: ${file}`);
    return {};
  }
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Partial<LocalPayConfig>;
  } catch (error) {
    throw new UsageError(`could not read ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function fromEnv(env: NodeJS.ProcessEnv): Partial<LocalPayConfig> {
  const config: Partial<LocalPayConfig> = {};
  if (env.LOCALPAY_PORT) config.port = int('LOCALPAY_PORT', env.LOCALPAY_PORT);
  if (env.LOCALPAY_HOST) config.host = env.LOCALPAY_HOST;
  if (env.LOCALPAY_ALLOW_PUBLIC === '1' || env.LOCALPAY_ALLOW_PUBLIC === 'true') config.allowPublic = true;
  if (env.LOCALPAY_DASHBOARD_PASSWORD) config.dashboardPassword = env.LOCALPAY_DASHBOARD_PASSWORD;
  if (env.LOCALPAY_SEED) config.seed = env.LOCALPAY_SEED;
  if (env.LOCALPAY_PERSIST) config.persist = env.LOCALPAY_PERSIST;
  if (env.LOCALPAY_KEY_ID && env.LOCALPAY_KEY_SECRET) config.keys = [{ keyId: env.LOCALPAY_KEY_ID, keySecret: env.LOCALPAY_KEY_SECRET }];
  if (env.LOCALPAY_WEBHOOK_URL) config.webhooks = [{ url: env.LOCALPAY_WEBHOOK_URL, secret: env.LOCALPAY_WEBHOOK_SECRET ?? DEFAULT_WEBHOOK_SECRET }];
  return config;
}

export interface StartOptions {
  config: Partial<LocalPayConfig>;
  open: boolean;
  help: boolean;
}

export function parseStartOptions(argv: string[], env: NodeJS.ProcessEnv = {}, cwd = process.cwd()): StartOptions {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: START_FLAGS, allowPositionals: false, strict: true });
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
  const v = parsed.values;
  const config: Partial<LocalPayConfig> = { ...readConfigFile(v.config, cwd, v.config !== undefined), ...fromEnv(env) };

  if (v.port !== undefined) config.port = int('port', v.port);
  if (v.host !== undefined) config.host = v.host;
  if (v['allow-public']) config.allowPublic = true;
  if (v['dashboard-password'] !== undefined) config.dashboardPassword = v['dashboard-password'];
  if (v.persist !== undefined) config.persist = resolve(cwd, v.persist);
  // --record is --persist under the name used for record-and-replay.
  if (v.record !== undefined) config.persist = resolve(cwd, v.record);
  if (v.seed !== undefined) config.seed = v.seed;
  if (v.key?.length) config.keys = v.key.map(parseKey);
  if (v.webhook?.length) {
    const secret = v['webhook-secret'] ?? env.LOCALPAY_WEBHOOK_SECRET ?? DEFAULT_WEBHOOK_SECRET;
    const events = v['webhook-events']?.split(',').map((e) => e.trim()).filter(Boolean);
    config.webhooks = v.webhook.map((url) => ({ url, secret, ...(events?.length && { events }) }));
  }
  if (v['no-auto-capture']) config.autoCapture = false;
  if (v['refund-delay'] !== undefined) config.refundDelaySeconds = int('refund-delay', v['refund-delay']);
  if (v['settlement-days'] !== undefined) config.settlementDays = int('settlement-days', v['settlement-days']);
  if (v['allowed-origin']?.length) config.allowedOrigins = v['allowed-origin'];
  if (v.fault?.length) config.faults = Object.fromEntries(v.fault.map(parseFault));

  return { config, open: v.open ?? false, help: v.help ?? false };
}
