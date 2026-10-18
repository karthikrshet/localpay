import { describe, expect, it } from 'vitest';
import { luhnValid, scanText } from './check-secrets.ts';

describe('scanText', () => {
  it('flags live keys anywhere, except the known fakes', () => {
    // Built from parts so this file does not trip the check itself.
    expect(scanText('src/a.ts', `const k = "${'rzp_live_'}${'Q1w2E3r4T5y6U7'}";`)).toMatchObject([{ rule: 'live API key', line: 1 }]);
    expect(scanText('src/a.ts', 'rzp_live_ABCDEFGHIJKLMN')).toEqual([]);
  });

  it('flags private keys anywhere', () => {
    expect(scanText('docs/x.md', `-----BEGIN RSA ${'PRIVATE'} KEY-----`)).toHaveLength(1);
  });

  it('flags emails, phones, test keys and card numbers only in fixtures', () => {
    const text = 'a@gmail.com 9876543210 rzp_test_Abc123Def456Gh 4111111111111111';
    expect(scanText('src/x.ts', text)).toEqual([]);
    expect(scanText('fixtures/razorpay/x.json', text).map((f) => f.rule)).toEqual(['test API key', 'email address', 'phone number', 'card number']);
  });

  it('accepts scrubber placeholders in fixtures', () => {
    const text = '"email": "customer@example.com", "contact": "+919999999999", "key": "rzp_test_XXXXXXXXXXXXXX", "created_at": 1760800000123';
    expect(scanText('fixtures/a.json', text)).toEqual([]);
  });
});

describe('luhnValid', () => {
  it('recognises valid card numbers', () => {
    expect(luhnValid('4111111111111111')).toBe(true);
    expect(luhnValid('4111111111111112')).toBe(false);
  });
});
