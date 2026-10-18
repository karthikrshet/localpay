import { describe, expect, it } from 'vitest';
import { buildTestApp, TEST_KEY } from '../test-helpers.ts';
import { subscriptionRoutes } from './routes.ts';
import { subscriptionSignature, verifySubscriptionSignature } from './serializer.ts';

const setup = () => buildTestApp([subscriptionRoutes], { seed: 'subs-api' });
const PLAN = { period: 'monthly', interval: 1, item: { name: 'Pro', amount: 49900, description: 'Pro plan' }, notes: { tier: 'pro' } };

describe('plans API', () => {
  it('creates, fetches and lists plans', async () => {
    const { call } = await setup();
    const created = await call('POST', '/v1/plans', PLAN);
    expect(created.body).toMatchObject({ entity: 'plan', period: 'monthly', interval: 1, item: { name: 'Pro', amount: 49900, unit_amount: 49900, currency: 'INR', type: 'plan' }, notes: { tier: 'pro' } });
    expect(String((created.body.item as { id: string }).id)).toMatch(/^item_/);
    expect((await call('GET', `/v1/plans/${String(created.body.id)}`)).body).toEqual(created.body);
    expect((await call('GET', '/v1/plans')).body).toMatchObject({ entity: 'collection', count: 1 });
  });

  it('validates the period', async () => {
    const { call } = await setup();
    expect((await call('POST', '/v1/plans', { ...PLAN, period: 'hourly' })).body).toMatchObject({ error: { field: 'period' } });
  });
});

describe('subscriptions API', () => {
  it('creates a subscription with counts and a short_url, then cancels it', async () => {
    const { call } = await setup();
    const plan = await call('POST', '/v1/plans', PLAN);
    const created = await call('POST', '/v1/subscriptions', { plan_id: plan.body.id, total_count: 12, quantity: 1, customer_notify: 1, notes: { a: 'b' } });
    expect(created.body).toMatchObject({ entity: 'subscription', status: 'created', total_count: 12, paid_count: 0, remaining_count: 12, customer_notify: true, auth_attempts: 0 });
    const id = String(created.body.id);
    expect(created.body.short_url).toBe(`http://localhost:80/s/${id}`);
    expect((await call('GET', `/v1/subscriptions?plan_id=${String(plan.body.id)}`)).body).toMatchObject({ count: 1 });
    expect((await call('POST', `/v1/subscriptions/${id}/cancel`, { cancel_at_cycle_end: 0 })).body).toMatchObject({ status: 'cancelled' });
  });

  it('schedules cancellation at cycle end for an active subscription', async () => {
    const { call, engine } = await setup();
    const plan = await call('POST', '/v1/plans', PLAN);
    const created = await call('POST', '/v1/subscriptions', { plan_id: plan.body.id, total_count: 3 });
    engine.authenticateSubscription(String(created.body.id), { outcome: { kind: 'success' } });
    const cancelled = await call('POST', `/v1/subscriptions/${String(created.body.id)}/cancel`, { cancel_at_cycle_end: 1 });
    expect(cancelled.body).toMatchObject({ status: 'active', has_scheduled_changes: true, paid_count: 1 });
  });

  it('rejects unsupported fields and unknown plans or customers', async () => {
    const { call } = await setup();
    const plan = await call('POST', '/v1/plans', PLAN);
    expect((await call('POST', '/v1/subscriptions', { plan_id: plan.body.id, total_count: 2, addons: [{ item: {} }] })).body).toMatchObject({ error: { field: 'addons' } });
    expect((await call('POST', '/v1/subscriptions', { plan_id: 'plan_missing0000000', total_count: 2 })).body).toMatchObject({ error: { description: 'The id provided does not exist' } });
    expect((await call('POST', '/v1/subscriptions', { plan_id: plan.body.id, total_count: 2, customer_id: 'cust_missing0000000' })).status).toBe(400);
  });
});

describe('subscription signature', () => {
  it('signs payment_id|subscription_id', () => {
    const signature = subscriptionSignature('pay_1', 'sub_1', TEST_KEY.keySecret);
    expect(verifySubscriptionSignature({ paymentId: 'pay_1', subscriptionId: 'sub_1', signature }, TEST_KEY.keySecret)).toBe(true);
    expect(verifySubscriptionSignature({ paymentId: 'pay_1', subscriptionId: 'sub_2', signature }, TEST_KEY.keySecret)).toBe(false);
  });
});
