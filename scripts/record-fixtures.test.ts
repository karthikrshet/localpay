import { describe, expect, it } from 'vitest';
import { assertTestCredentials, MissingReference, resolveTemplate, toFixture } from './record-fixtures.ts';

describe('assertTestCredentials', () => {
  it('accepts test keys', () => {
    expect(assertTestCredentials({ RZP_KEY_ID: 'rzp_test_abc', RZP_KEY_SECRET: 's' })).toEqual({ keyId: 'rzp_test_abc', keySecret: 's' });
  });

  it('refuses live keys and missing credentials', () => {
    expect(() => assertTestCredentials({ RZP_KEY_ID: 'rzp_live_abc', RZP_KEY_SECRET: 's' })).toThrow(/live key/);
    expect(() => assertTestCredentials({})).toThrow(/Set RZP_KEY_ID/);
    expect(() => assertTestCredentials({ RZP_KEY_ID: 'rzp_test_abc' })).toThrow(/Set RZP_KEY_ID/);
  });
});

describe('resolveTemplate', () => {
  const responses = { 'order-create': { id: 'order_ABC', nested: { n: 5 } } };

  it('substitutes earlier response fields and env vars', () => {
    expect(resolveTemplate('/v1/orders/{order-create.id}', responses, {})).toBe('/v1/orders/order_ABC');
    expect(resolveTemplate('/v1/payments/{env.PAYMENT_ID}?n={order-create.nested.n}', responses, { PAYMENT_ID: 'pay_1' })).toBe('/v1/payments/pay_1?n=5');
  });

  it('fails clearly on unresolvable references', () => {
    expect(() => resolveTemplate('/v1/payments/{env.PAYMENT_ID}', responses, {})).toThrow(MissingReference);
    expect(() => resolveTemplate('/{order-create.nested}', responses, {})).toThrow(/cannot resolve/);
  });
});

describe('toFixture', () => {
  it('builds the fixture file shape', () => {
    const fixture = toFixture({ name: 'x', method: 'POST', path: '/v1/orders', body: { amount: 100 } }, '/v1/orders', 200, { id: 'order_1' }, new Date('2026-10-19T10:00:00Z'));
    expect(fixture).toEqual({
      name: 'x', provenance: 'recorded', recorded_at: '2026-10-19',
      request: { method: 'POST', path: '/v1/orders', body: { amount: 100 } },
      response: { status: 200, body: { id: 'order_1' } },
    });
  });
});
