import { describe, expect, it } from 'vitest';
import { BlockedTargetError, guardedLookup, isBlockedAddress, validateTargetUrl } from './ssrf.ts';

describe('isBlockedAddress', () => {
  it.each(['169.254.169.254', '169.254.1.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '100.100.100.200', 'fe80::1', 'ff02::1', 'fd00:ec2::254', '::ffff:169.254.169.254', '::', 'not-an-ip'])(
    'blocks %s',
    (address) => {
      expect(isBlockedAddress(address)).toBe(true);
    },
  );

  it.each(['127.0.0.1', '::1', '10.0.0.5', '172.17.0.2', '192.168.1.10', '93.184.216.34', '::ffff:127.0.0.1'])('allows %s', (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });
});

describe('validateTargetUrl', () => {
  it('accepts local http and https targets', () => {
    expect(validateTargetUrl('http://localhost:3000/webhooks').port).toBe('3000');
    expect(validateTargetUrl('https://127.0.0.1/hook').protocol).toBe('https:');
  });

  it.each([
    ['ftp://localhost/x', /http\(s\)/],
    ['http://169.254.169.254/latest/meta-data', /blocked/],
    ['http://metadata.google.internal/computeMetadata', /metadata/],
    ['http://[fe80::1]/x', /blocked/],
    ['http://user:pass@localhost/x', /credentials/],
    ['not a url', /invalid/],
  ])('rejects %s', (url, message) => {
    expect(() => validateTargetUrl(url)).toThrow(message);
  });
});

describe('guardedLookup', () => {
  const lookup = (host: string, all: boolean) =>
    new Promise<unknown>((resolve, reject) => {
      guardedLookup(host, { all }, (error, address) => (error ? reject(error) : resolve(address)));
    });

  it('resolves allowed names', async () => {
    expect(await lookup('localhost', false)).toMatch(/^(127\.0\.0\.1|::1)$/);
    expect(Array.isArray(await lookup('localhost', true))).toBe(true);
  });

  it('refuses metadata names and blocked literals', async () => {
    await expect(lookup('metadata.google.internal', false)).rejects.toBeInstanceOf(BlockedTargetError);
    await expect(lookup('169.254.169.254', false)).rejects.toBeInstanceOf(BlockedTargetError);
  });
});
