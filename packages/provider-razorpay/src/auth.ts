// HTTP Basic auth with key_id:key_secret. LocalPay accepts only test keys and
// refuses live keys loudly, so a real secret is never used against it by mistake.
import { timingSafeEqual } from 'node:crypto';
import { unauthorized, type ApiError } from './errors.ts';

export interface ApiKey {
  keyId: string;
  keySecret: string;
}

export const TEST_KEY_PREFIXES = ['rzp_test_', 'lp_test_'] as const;

export const isTestKeyId = (keyId: string): boolean => TEST_KEY_PREFIXES.some((prefix) => keyId.startsWith(prefix));
export const isLiveKeyId = (keyId: string): boolean => keyId.startsWith('rzp_live_');

export function parseBasicAuth(header: string | undefined): { user: string; password: string } | null {
  const match = header?.match(/^Basic\s+([A-Za-z0-9+/=]+)\s*$/i);
  if (!match?.[1]) return null;
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const colon = decoded.indexOf(':');
  if (colon < 0) return null;
  return { user: decoded.slice(0, colon), password: decoded.slice(colon + 1) };
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export const LIVE_KEY_MESSAGE = 'LocalPay never accepts live keys. Use a test key (rzp_test_ or lp_test_) and keep live secrets out of local tools.';

export type AuthResult = { ok: true; key: ApiKey } | { ok: false; error: ApiError };

export function authenticate(header: string | undefined, keys: readonly ApiKey[]): AuthResult {
  const credentials = parseBasicAuth(header);
  if (!credentials || !credentials.user) {
    return { ok: false, error: unauthorized('Please provide your api key for authentication purposes.') };
  }
  if (isLiveKeyId(credentials.user)) return { ok: false, error: unauthorized(LIVE_KEY_MESSAGE) };
  if (!isTestKeyId(credentials.user)) return { ok: false, error: unauthorized('The api key provided is invalid') };
  const key = keys.find((k) => k.keyId === credentials.user);
  // Compare the secret even for unknown keys so timing does not reveal which ids exist.
  const secretMatches = safeEqual(credentials.password, key?.keySecret ?? '\u0000'.repeat(credentials.password.length + 1));
  if (!key || !secretMatches) return { ok: false, error: unauthorized('The api key or secret provided is invalid') };
  return { ok: true, key };
}

/** For logs: rzp_test_LocalPayDemo01 → rzp_test_Loca…. Never log secrets at all. */
export const redactKeyId = (keyId: string): string => (keyId.length <= 13 ? '***' : `${keyId.slice(0, 13)}…`);
