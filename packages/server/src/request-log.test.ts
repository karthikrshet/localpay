import { describe, expect, it } from 'vitest';
import { createLocalPay } from './app.ts';
import { DEMO_KEY } from './config.ts';
import { formatRequestLine } from './request-log.ts';

describe('request log', () => {
  it('formats one line without secrets, query strings or headers', () => {
    const authorization = `Basic ${Buffer.from('rzp_test_LocalPayDemo01:super_secret_value').toString('base64')}`;
    const line = formatRequestLine({ method: 'GET', url: '/v1/orders?count=5&token=abc', status: 200, ms: 3.4, authorization });
    expect(line).toBe('GET    /v1/orders 200 3ms key=rzp_test_Loca…');
    expect(line).not.toContain('super_secret_value');
    expect(line).not.toContain('token');
  });

  it('logs every request when enabled and nothing when not', async () => {
    const lines: string[] = [];
    const server = await createLocalPay({ log: true }, { dashboardDir: null, log: (l) => lines.push(l) });
    const auth = `Basic ${Buffer.from(`${DEMO_KEY.keyId}:${DEMO_KEY.keySecret}`).toString('base64')}`;
    await server.app.inject({ method: 'POST', url: '/v1/orders', headers: { authorization: auth }, payload: { amount: 100 } });
    await server.app.inject({ url: '/_localpay/health' });
    await server.close();
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^POST {3}\/v1\/orders 200 \d+ms key=rzp_test_Loca…$/);
    expect(lines.join('\n')).not.toContain(DEMO_KEY.keySecret);

    const quiet: string[] = [];
    const silent = await createLocalPay({}, { dashboardDir: null, log: (l) => quiet.push(l) });
    await silent.app.inject({ url: '/_localpay/health' });
    await silent.close();
    expect(quiet).toEqual([]);
  });
});
