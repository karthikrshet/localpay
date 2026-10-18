// Server configuration with safe defaults: loopback only, test keys only.
import { isTestKeyId, type ApiKey } from '@localpay/provider-razorpay';

/** Shipped demo credentials. Public on purpose: they only ever work against LocalPay. */
export const DEMO_KEY: ApiKey = { keyId: 'rzp_test_LocalPayDemo01', keySecret: 'localpay_demo_secret' };

export interface LocalPayConfig {
  port: number;
  host: string;
  /** Required, together with a dashboard password, to listen on a non-loopback address. */
  allowPublic: boolean;
  dashboardPassword: string | null;
  keys: ApiKey[];
  /** Seed for ids and scenario randomness. */
  seed: string | null;
  /** Path of a JSONL event log to keep data between runs. */
  persist: string | null;
  autoCapture: boolean;
  /** Seconds before a pending refund is processed. */
  refundDelaySeconds: number;
}

export const DEFAULT_CONFIG: LocalPayConfig = {
  port: 4010,
  host: '127.0.0.1',
  allowPublic: false,
  dashboardPassword: null,
  keys: [DEMO_KEY],
  seed: null,
  persist: null,
  autoCapture: true,
  refundDelaySeconds: 5,
};

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '::1' || host === '[::1]' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

export function resolveConfig(overrides: Partial<LocalPayConfig> = {}): LocalPayConfig {
  const config: LocalPayConfig = { ...DEFAULT_CONFIG, ...overrides };
  if (!Number.isInteger(config.port) || config.port < 0 || config.port > 65535) throw new ConfigError(`invalid port ${config.port}`);
  if (!isLoopbackHost(config.host)) {
    if (!config.allowPublic) {
      throw new ConfigError(`refusing to listen on ${config.host}: LocalPay binds to 127.0.0.1 only. Pass --allow-public (and a dashboard password) if you really mean it.`);
    }
    if (!config.dashboardPassword) throw new ConfigError('listening on a public address requires a dashboard password (--dashboard-password)');
  }
  if (config.keys.length === 0) throw new ConfigError('at least one API key is required');
  for (const key of config.keys) {
    if (!isTestKeyId(key.keyId)) throw new ConfigError(`key ${key.keyId.slice(0, 9)}… is not a test key; LocalPay only accepts rzp_test_ or lp_test_ keys`);
    if (!key.keySecret) throw new ConfigError(`key ${key.keyId} has no secret`);
  }
  if (!Number.isInteger(config.refundDelaySeconds) || config.refundDelaySeconds < 0) throw new ConfigError('refundDelaySeconds must be a non-negative integer');
  return config;
}
