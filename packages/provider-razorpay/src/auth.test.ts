import { describe, expect, it } from 'vitest';
import { authenticate, isTestKeyId, LIVE_KEY_MESSAGE, parseBasicAuth, redactKeyId, safeEqual } from './auth.ts';

const KEYS = [{ keyId: 'rzp_test_LocalPayDemo01', keySecret: 'demo_secret' }];
const basic = (user: string, password: string) => `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

describe('parseBasicAuth', () => {
  it('decodes user and password, allowing colons in the password', () => {
    expect(parseBasicAuth(basic('id', 'a:b'))).toEqual({ user: 'id', password: 'a:b' });
  });

  it.each([undefined, '', 'Bearer x', 'Basic !!!', `Basic ${Buffer.from('nocolon').toString('base64')}`])('rejects %j', (header) => {
    expect(parseBasicAuth(header)).toBeNull();
  });
});

describe('authenticate', () => {
  it('accepts a configured test key with the right secret', () => {
    expect(authenticate(basic('rzp_test_LocalPayDemo01', 'demo_secret'), KEYS)).toEqual({ ok: true, key: KEYS[0] });
  });

  it('asks for a key when none is sent', () => {
    const result = authenticate(undefined, KEYS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ status: 401, body: { description: 'Please provide your api key for authentication purposes.' } });
  });

  it('refuses live keys with an explicit message', () => {
    const result = authenticate(basic('rzp_live_ABCDEFGHIJKLMN', 'whatever'), KEYS);
    expect(!result.ok && result.error.body.description).toBe(LIVE_KEY_MESSAGE);
  });

  it.each([
    ['unknown prefix', 'sk_test_x', 'demo_secret'],
    ['unknown test key', 'rzp_test_Unknown0000000', 'demo_secret'],
    ['wrong secret', 'rzp_test_LocalPayDemo01', 'nope'],
  ])('rejects %s', (_case, user, password) => {
    const result = authenticate(basic(user, password), KEYS);
    expect(!result.ok && result.error.status).toBe(401);
  });
});

describe('helpers', () => {
  it('recognises both test key prefixes', () => {
    expect(isTestKeyId('rzp_test_x')).toBe(true);
    expect(isTestKeyId('lp_test_x')).toBe(true);
    expect(isTestKeyId('rzp_live_x')).toBe(false);
  });

  it('compares secrets safely, including different lengths', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });

  it('redacts key ids for logs', () => {
    expect(redactKeyId('rzp_test_LocalPayDemo01')).toBe('rzp_test_Loca…');
    expect(redactKeyId('short')).toBe('***');
  });
});
