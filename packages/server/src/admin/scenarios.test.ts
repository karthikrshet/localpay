import { afterEach, describe, expect, it } from 'vitest';
import { createLocalPay, type LocalPay } from '../app.ts';

let server: LocalPay | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

const call = async (method: 'GET' | 'POST', url: string, payload?: unknown) => {
  if (!server) throw new Error('no server');
  const response = await server.app.inject({ method, url: `/_localpay/api${url}`, headers: { authorization: `Bearer ${server.adminAuth.token}` }, ...(payload !== undefined && { payload: payload as object }) });
  return { status: response.statusCode, body: response.json<Record<string, unknown>>() };
};

describe('scenario endpoints', () => {
  it('lists the gallery and runs a gallery scenario on the live engine', async () => {
    server = await createLocalPay({}, { dashboardDir: null });
    const list = await call('GET', '/scenarios');
    expect((list.body.items as { id: string }[]).map((i) => i.id)).toContain('01-happy-path');
    const run = await call('POST', '/scenarios/run', { id: '01-happy-path' });
    expect(run.body).toMatchObject({ name: 'Happy path', ok: true });
    expect((run.body.events as { type: string }[]).map((e) => e.type)).toContain('order.paid');
    expect(server.engine.listOrders()).toHaveLength(1);
  });

  it('runs posted YAML and applies webhook faults to the dispatcher', async () => {
    server = await createLocalPay({}, { dashboardDir: null });
    const run = await call('POST', '/scenarios/run', { yaml: 'name: faults\nsteps:\n  - webhook_faults: { duplicate: 0.4 }\n  - order: { amount: 100 }' });
    expect(run.body).toMatchObject({ ok: true });
    expect(server.dispatcher.faults().duplicateRate).toBe(0.4);
  });

  it('explains bad requests', async () => {
    server = await createLocalPay({}, { dashboardDir: null });
    expect((await call('POST', '/scenarios/run', { yaml: 'name: x\nsteps: []' })).body).toMatchObject({ error: { description: expect.stringContaining('steps') as string } });
    expect((await call('POST', '/scenarios/run', { id: 'nope' })).status).toBe(404);
    expect((await call('POST', '/scenarios/run', {})).status).toBe(400);
  });
});
