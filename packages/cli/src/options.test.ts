import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseStartOptions, UsageError } from './options.ts';

const dir = mkdtempSync(join(tmpdir(), 'lp-cli-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('parseStartOptions', () => {
  it('returns no overrides by default', () => {
    expect(parseStartOptions([], {}, dir)).toEqual({ config: {}, open: false, help: false });
  });

  it('maps every flag', () => {
    const { config, open } = parseStartOptions(
      [
        '-p', '5000', '--host', '0.0.0.0', '--allow-public', '--dashboard-password', 'pw', '--persist', 'data/events.jsonl', '--seed', 's1',
        '--key', 'rzp_test_A:secret:with:colons', '--webhook', 'http://127.0.0.1:3000/webhooks', '--webhook', 'http://127.0.0.1:3001/hooks',
        '--webhook-secret', 'whsec', '--webhook-events', 'payment.captured, order.paid', '--no-auto-capture', '--refund-delay', '30', '--settlement-days', '3',
        '--allowed-origin', 'https://shop.test', '--fault', 'duplicate=0.5', '--fault', 'delay=200', '--fault', 'rate-limit=0.1', '--open',
      ],
      {},
      dir,
    );
    expect(open).toBe(true);
    expect(config).toEqual({
      port: 5000, host: '0.0.0.0', allowPublic: true, dashboardPassword: 'pw', persist: resolve(dir, 'data/events.jsonl'), seed: 's1',
      keys: [{ keyId: 'rzp_test_A', keySecret: 'secret:with:colons' }],
      webhooks: [
        { url: 'http://127.0.0.1:3000/webhooks', secret: 'whsec', events: ['payment.captured', 'order.paid'] },
        { url: 'http://127.0.0.1:3001/hooks', secret: 'whsec', events: ['payment.captured', 'order.paid'] },
      ],
      autoCapture: false, refundDelaySeconds: 30, settlementDays: 3, allowedOrigins: ['https://shop.test'], faults: { duplicateRate: 0.5, delayMs: 200 }, apiFaults: { rateLimitRate: 0.1 },
    });
  });

  it('uses the default webhook secret when none is given', () => {
    expect(parseStartOptions(['--webhook', 'http://127.0.0.1:3000/w'], {}, dir).config.webhooks).toEqual([{ url: 'http://127.0.0.1:3000/w', secret: 'localpay_webhook_secret' }]);
  });

  it('layers config file < env < flags', () => {
    writeFileSync(join(dir, 'localpay.config.json'), JSON.stringify({ port: 4100, seed: 'file', autoCapture: false }));
    const { config } = parseStartOptions(['--port', '4300'], { LOCALPAY_PORT: '4200', LOCALPAY_SEED: 'env' }, dir);
    expect(config).toMatchObject({ port: 4300, seed: 'env', autoCapture: false });
    rmSync(join(dir, 'localpay.config.json'));
  });

  it('reads public-binding settings from the environment (Docker)', () => {
    const { config } = parseStartOptions([], { LOCALPAY_HOST: '0.0.0.0', LOCALPAY_ALLOW_PUBLIC: '1', LOCALPAY_DASHBOARD_PASSWORD: 'pw' }, dir);
    expect(config).toMatchObject({ host: '0.0.0.0', allowPublic: true, dashboardPassword: 'pw' });
  });

  it('reads keys and a webhook from the environment', () => {
    const { config } = parseStartOptions([], { LOCALPAY_KEY_ID: 'rzp_test_E', LOCALPAY_KEY_SECRET: 'x', LOCALPAY_WEBHOOK_URL: 'http://127.0.0.1:9/w' }, dir);
    expect(config.keys).toEqual([{ keyId: 'rzp_test_E', keySecret: 'x' }]);
    expect(config.webhooks).toEqual([{ url: 'http://127.0.0.1:9/w', secret: 'localpay_webhook_secret' }]);
  });

  it.each([
    [['--port', 'abc'], /whole number/],
    [['--key', 'nosecret'], /rzp_test_xxx:secret/],
    [['--fault', 'chaos=1'], /--fault must be/],
    [['--unknown'], /Unknown option/],
    [['--config', 'missing.json'], /config file not found/],
  ])('rejects %j', (argv, message) => {
    expect(() => parseStartOptions(argv, {}, dir)).toThrow(UsageError);
    expect(() => parseStartOptions(argv, {}, dir)).toThrow(message);
  });
});
