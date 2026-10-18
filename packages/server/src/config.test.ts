import { describe, expect, it } from 'vitest';
import { ConfigError, DEFAULT_CONFIG, isLoopbackHost, resolveConfig } from './config.ts';

describe('resolveConfig', () => {
  it('defaults to loopback on port 4010 with the demo key', () => {
    const config = resolveConfig();
    expect(config).toEqual(DEFAULT_CONFIG);
    expect(config.host).toBe('127.0.0.1');
    expect(config.keys[0]?.keyId).toMatch(/^rzp_test_/);
  });

  it('refuses a public host without --allow-public', () => {
    expect(() => resolveConfig({ host: '0.0.0.0' })).toThrow(/binds to 127.0.0.1 only/);
  });

  it('requires a dashboard password for a public host', () => {
    expect(() => resolveConfig({ host: '0.0.0.0', allowPublic: true })).toThrow(/dashboard password/);
    expect(resolveConfig({ host: '0.0.0.0', allowPublic: true, dashboardPassword: 'pw' }).host).toBe('0.0.0.0');
  });

  it('refuses live or foreign keys', () => {
    expect(() => resolveConfig({ keys: [{ keyId: 'rzp_live_ABCDEFGHIJKLMN', keySecret: 's' }] })).toThrow(ConfigError);
    expect(() => resolveConfig({ keys: [] })).toThrow(/at least one/);
    expect(() => resolveConfig({ keys: [{ keyId: 'lp_test_x', keySecret: '' }] })).toThrow(/no secret/);
  });

  it('validates webhook targets and allowed origins', () => {
    expect(() => resolveConfig({ webhooks: [{ url: 'http://169.254.169.254/x', secret: 's' }] })).toThrow(/blocked/);
    expect(() => resolveConfig({ webhooks: [{ url: 'http://localhost:3000/hook', secret: '' }] })).toThrow(/needs a secret/);
    expect(resolveConfig({ webhooks: [{ url: 'http://localhost:3000/hook', secret: 's' }] }).webhooks).toHaveLength(1);
    expect(() => resolveConfig({ allowedOrigins: ['https://shop.test/path'] })).toThrow(/allowed origin/);
  });

  it('validates the port', () => {
    expect(() => resolveConfig({ port: 70000 })).toThrow(/invalid port/);
  });
});

describe('isLoopbackHost', () => {
  it.each(['127.0.0.1', '127.1.2.3', 'localhost', '::1', '[::1]'])('treats %s as loopback', (host) => {
    expect(isLoopbackHost(host)).toBe(true);
  });

  it.each(['0.0.0.0', '192.168.1.5', '::', 'example.com'])('treats %s as public', (host) => {
    expect(isLoopbackHost(host)).toBe(false);
  });
});
