// Phase 0 gate: the official Node SDK creates an order against localhost and gets back
// a correctly shaped object. Keep this green until Phase 1's real server replaces it.
import { describe, expect, it } from 'vitest';
import { runSpike } from './create-order.ts';

describe('razorpay Node SDK base-URL override', () => {
  it('defaults to the real API host', async () => {
    const { defaultHost } = await runSpike();
    expect(defaultHost).toBe('https://api.razorpay.com');
  });

  it('sends POST /v1/orders with Basic auth to the local server', async () => {
    const { seen } = await runSpike();
    expect(seen).toHaveLength(1);
    const [req] = seen;
    expect(req?.method).toBe('POST');
    expect(req?.url).toBe('/v1/orders');
    const decoded = Buffer.from((req?.authorization ?? '').replace(/^Basic /, ''), 'base64').toString();
    expect(decoded).toBe('rzp_test_spike:spike_secret');
    expect(JSON.parse(req?.body ?? '{}')).toEqual({ currency: 'INR', amount: 50000, receipt: 'spike-1', notes: { purpose: 'phase-0' } });
  });

  it('returns an order-shaped object', async () => {
    const { order } = await runSpike();
    expect(order.id).toMatch(/^order_[A-Za-z0-9]{14}$/);
    expect(order).toMatchObject({ entity: 'order', amount: 50000, amount_paid: 0, amount_due: 50000, currency: 'INR', status: 'created', attempts: 0 });
    expect(Number.isInteger(order.created_at)).toBe(true);
  });
});
