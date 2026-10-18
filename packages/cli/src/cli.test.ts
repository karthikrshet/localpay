import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { banner, createStyle } from './banner.ts';
import { HELP, main, VERSION, type Io, type Result } from './cli.ts';
import { sessionPath } from './session.ts';

const home = mkdtempSync(join(tmpdir(), 'lp-home-'));
afterAll(() => rmSync(home, { recursive: true, force: true }));

const io = () => {
  const out: string[] = [];
  const err: string[] = [];
  const value: Io = { out: (t) => out.push(t), err: (t) => err.push(t), env: { LOCALPAY_HOME: home }, cwd: home, color: false };
  return { io: value, out, err };
};

const running: Result[] = [];
afterEach(async () => {
  for (const result of running.splice(0)) await result.stop?.();
});

describe('localpay CLI', () => {
  it('prints help and version', async () => {
    const h = io();
    expect((await main(['help'], h.io)).code).toBe(0);
    expect(h.out[0]).toBe(HELP);
    const v = io();
    await main(['--version'], v.io);
    expect(v.out[0]).toBe(VERSION);
  });

  it('rejects unknown commands and bad flags with exit code 2', async () => {
    const a = io();
    expect((await main(['deploy'], a.io)).code).toBe(2);
    expect(a.err[0]).toContain('unknown command "deploy"');
    const b = io();
    expect((await main(['start', '--host', '0.0.0.0'], b.io)).code).toBe(2);
    expect(b.err[0]).toContain('binds to 127.0.0.1 only');
  });

  it('starts, writes a session file, and serves the other commands', async () => {
    const s = io();
    const started = await main(['start', '--port', '0', '--refund-delay', '3600'], s.io);
    running.push(started);
    const server = started.server;
    expect(server).toBeDefined();
    if (!server) return;
    const port = (server.app.server.address() as AddressInfo).port;
    expect(existsSync(sessionPath(port, { LOCALPAY_HOME: home }))).toBe(true);
    expect(s.out.join('\n')).toContain('rzp_test_LocalPayDemo01');
    expect(s.out.join('\n')).toContain('/?token=');

    const order = server.engine.createOrder({ amount: 100 });
    const payment = server.engine.attemptPayment({ orderId: order.id, method: 'upi', outcome: { kind: 'success' } });
    const refund = server.engine.createRefund(payment.id);

    const st = io();
    expect((await main(['status', '--port', String(port)], st.io)).code).toBe(0);
    expect(st.out[0]).toContain('orders 1 · payments 1');

    const t = io();
    expect((await main(['time', 'advance', '1h', '--port', String(port)], t.io)).code).toBe(0);
    expect(t.out[0]).toContain('1 scheduled change(s) ran');
    expect(server.engine.getRefund(refund.id).status).toBe('processed');

    const list = io();
    expect((await main(['scenario', 'list', '--port', String(port)], list.io)).code).toBe(0);
    expect(list.out[0]).toContain('01-happy-path');
    const passed = io();
    expect((await main(['scenario', 'run', '01-happy-path', '--port', String(port)], passed.io)).code).toBe(0);
    expect(passed.out[0]).toContain('Scenario passed.');
    writeFileSync(join(home, 'failing.yaml'), 'name: failing\nsteps:\n  - order: { amount: 100 }\nexpect:\n  orders: { paid: 1 }\n');
    const failed = io();
    expect((await main(['scenario', 'run', 'failing.yaml', '--port', String(port)], failed.io)).code).toBe(1);
    expect(failed.out[0]).toContain('expect orders.paid: expected 1, got 0');

    const r = io();
    expect((await main(['reset', '-p', String(port)], r.io)).code).toBe(0);
    expect(server.engine.listOrders()).toEqual([]);

    await started.stop?.();
    running.length = 0;
    expect(existsSync(sessionPath(port, { LOCALPAY_HOME: home }))).toBe(false);
  });

  it('generates a dashboard password for public binding and survives a read-only session dir', async () => {
    const s = io();
    s.io.env = { LOCALPAY_HOME: join(home, 'missing', '\u0000bad'), LOCALPAY_HOST: '0.0.0.0', LOCALPAY_ALLOW_PUBLIC: '1' };
    const started = await main(['start', '--port', '0'], s.io);
    running.push(started);
    expect(started.server?.config.dashboardPassword).toMatch(/^[\w-]{16}$/);
    expect(s.out.join('\n')).toContain('(generated dashboard password)');
    expect(s.out.join('\n')).toContain('WARNING');
    expect(s.err.join('\n')).toContain('could not write the session file');
  });

  it('explains when no server is running', async () => {
    const x = io();
    expect((await main(['reset', '--port', '4999'], x.io)).code).toBe(2);
    expect(x.err[0]).toContain('No LocalPay is running on port 4999');
  });
});

describe('banner', () => {
  const config = { keys: [{ keyId: 'rzp_test_LocalPayDemo01', keySecret: 'localpay_demo_secret' }, { keyId: 'rzp_test_Mine', keySecret: 'my-real-test-secret' }], webhooks: [], persist: null, seed: null, allowPublic: false, host: '127.0.0.1' };
  it('shows the demo secret but masks user secrets', () => {
    const text = banner({ version: '0.1.0', url: 'http://127.0.0.1:4010', dashboardUrl: 'http://127.0.0.1:4010/?token=t', config: config as never }, createStyle(false));
    expect(text).toContain('localpay_demo_secret');
    expect(text).not.toContain('my-real-test-secret');
    expect(text).toContain('not affiliated with Razorpay');
  });

  it('warns loudly on public binding', () => {
    const text = banner({ version: '0', url: 'http://0.0.0.0:4010', dashboardUrl: 'x', config: { ...config, allowPublic: true, host: '0.0.0.0' } as never }, createStyle(true));
    expect(text).toContain('\u001b[31m  WARNING');
  });
});
