import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../test-helpers.ts';
import { settlementRoutes } from './settlements.ts';

describe('settlements API', () => {
  it('lists and fetches settlements after T+2', async () => {
    const { call, engine } = await buildTestApp([settlementRoutes], { seed: 'settle-api' });
    const order = engine.createOrder({ amount: 100000 });
    engine.attemptPayment({ orderId: order.id, method: 'upi', outcome: { kind: 'success' } });
    expect((await call('GET', '/v1/settlements')).body).toMatchObject({ count: 0 });
    engine.advanceTime(2 * 86_400_000);
    const list = await call('GET', '/v1/settlements');
    expect(list.body).toMatchObject({ entity: 'collection', count: 1, items: [{ entity: 'settlement', amount: 97640, fees: 2360, tax: 360, status: 'processed' }] });
    const id = (list.body.items as { id: string }[])[0]?.id ?? '';
    expect((await call('GET', `/v1/settlements/${id}`)).body).toMatchObject({ id, utr: expect.stringMatching(/^[A-Z0-9]{16}$/) as string });
  });
});
