import { describe, expect, it } from 'vitest';
import { createEngine } from './index.ts';

const DAY = 86_400_000;
const setup = (amount = 49900, period: 'monthly' | 'daily' = 'monthly') => {
  const engine = createEngine({ seed: 'subs' });
  const plan = engine.createPlan({ period, interval: period === 'daily' ? 7 : 1, item: { name: 'Pro', amount } });
  return { engine, plan };
};
const types = (engine: ReturnType<typeof setup>['engine'], prefix = 'subscription.') => engine.events.map((e) => e.type).filter((t) => t.startsWith(prefix));

describe('plans', () => {
  it('creates and lists plans, and validates them', () => {
    const { engine, plan } = setup();
    expect(plan).toMatchObject({ period: 'monthly', interval: 1, item: { name: 'Pro', amount: 49900, currency: 'INR', description: null } });
    expect(plan.id).toMatch(/^plan_/);
    expect(engine.listPlans()).toEqual([plan]);
    expect(() => engine.createPlan({ period: 'monthly', interval: 0, item: { name: 'x', amount: 100 } })).toThrow(expect.objectContaining({ reason: 'invalid_plan' }) as Error);
  });
});

describe('subscriptions', () => {
  it('charges the first cycle on authentication and renews monthly with time travel', () => {
    const { engine, plan } = setup();
    const sub = engine.createSubscription({ planId: plan.id, totalCount: 3 });
    expect(sub).toMatchObject({ status: 'created', paidCount: 0, chargeAt: null });
    const { subscription, payment } = engine.authenticateSubscription(sub.id, { outcome: { kind: 'success' } });
    expect(payment).toMatchObject({ status: 'captured', amount: 49900, method: 'card' });
    expect(subscription).toMatchObject({ status: 'active', paidCount: 1, currentStart: engine.now() });
    expect(types(engine)).toEqual(['subscription.created', 'subscription.authenticated', 'subscription.activated', 'subscription.charged']);

    engine.advanceTime(65 * DAY);
    expect(engine.getSubscription(sub.id)).toMatchObject({ status: 'completed', paidCount: 3, chargeAt: null });
    expect(types(engine).slice(4)).toEqual(['subscription.charged', 'subscription.charged', 'subscription.completed']);
    expect(engine.getSubscription(sub.id).paymentIds).toHaveLength(3);
  });

  it('waits for start_at when it is in the future', () => {
    const { engine, plan } = setup();
    const sub = engine.createSubscription({ planId: plan.id, totalCount: 12, startAt: engine.now() + 10 * 86_400 });
    const { subscription, payment } = engine.authenticateSubscription(sub.id, { outcome: { kind: 'success' } });
    expect(subscription).toMatchObject({ status: 'authenticated', paidCount: 0, chargeAt: sub.startAt });
    expect(payment).toMatchObject({ status: 'authorized', amount: 100 });
    expect(engine.authenticationAmount(sub.id)).toBe(100);
    engine.advanceTime(9 * DAY);
    expect(engine.getSubscription(sub.id).status).toBe('authenticated');
    engine.advanceTime(DAY);
    expect(engine.getSubscription(sub.id)).toMatchObject({ status: 'active', paidCount: 1, currentStart: sub.startAt });
  });

  it('keeps a subscription created when the first checkout fails', () => {
    const { engine, plan } = setup();
    const sub = engine.createSubscription({ planId: plan.id, totalCount: 2 });
    const failed = engine.authenticateSubscription(sub.id, { outcome: { kind: 'fail', error: { code: 'BAD_REQUEST_ERROR', description: 'x', source: 'bank', step: 'payment_authorization', reason: 'x' } } });
    expect(failed.subscription).toMatchObject({ status: 'created', authAttempts: 1 });
    expect(engine.authenticateSubscription(sub.id, { outcome: { kind: 'success' } }).subscription.status).toBe('active');
  });

  it('goes pending on a failed renewal, retries daily, and halts after three failures', () => {
    const { engine, plan } = setup(49913);
    const sub = engine.createSubscription({ planId: plan.id, totalCount: 6, startAt: engine.now() + 86_400 });
    engine.authenticateSubscription(sub.id, { outcome: { kind: 'success' } });
    engine.advanceTime(DAY);
    expect(engine.getSubscription(sub.id)).toMatchObject({ status: 'pending', authAttempts: 1 });
    engine.advanceTime(DAY);
    expect(engine.getSubscription(sub.id)).toMatchObject({ status: 'pending', authAttempts: 2 });
    engine.advanceTime(DAY);
    expect(engine.getSubscription(sub.id)).toMatchObject({ status: 'halted', authAttempts: 3, chargeAt: null });
    expect(types(engine)).toEqual(['subscription.created', 'subscription.authenticated', 'subscription.pending', 'subscription.updated', 'subscription.halted']);
    engine.advanceTime(30 * DAY);
    expect(engine.getSubscription(sub.id).status).toBe('halted');
  });

  it('runs every missed retry in one long time jump', () => {
    const { engine, plan } = setup(49913);
    const sub = engine.createSubscription({ planId: plan.id, totalCount: 6, startAt: engine.now() + 86_400 });
    engine.authenticateSubscription(sub.id, { outcome: { kind: 'success' } });
    engine.advanceTime(10 * DAY);
    expect(engine.getSubscription(sub.id)).toMatchObject({ status: 'halted', authAttempts: 3 });
  });

  it('cancels now or at the end of the current cycle', () => {
    const { engine, plan } = setup();
    const now = engine.createSubscription({ planId: plan.id, totalCount: 5 });
    engine.authenticateSubscription(now.id, { outcome: { kind: 'success' } });
    expect(engine.cancelSubscription(now.id)).toMatchObject({ status: 'cancelled', chargeAt: null });
    expect(() => engine.cancelSubscription(now.id)).toThrow(expect.objectContaining({ reason: 'subscription_ended' }) as Error);

    const later = engine.createSubscription({ planId: plan.id, totalCount: 5 });
    engine.authenticateSubscription(later.id, { outcome: { kind: 'success' } });
    expect(engine.cancelSubscription(later.id, { atCycleEnd: true })).toMatchObject({ status: 'active', cancelAtCycleEnd: true });
    engine.advanceTime(32 * DAY);
    expect(engine.getSubscription(later.id)).toMatchObject({ status: 'cancelled', paidCount: 1 });
  });

  it('rejects bad input and double authentication', () => {
    const { engine, plan } = setup();
    expect(() => engine.createSubscription({ planId: 'plan_missing0000000', totalCount: 1 })).toThrow(expect.objectContaining({ reason: 'not_found' }) as Error);
    expect(() => engine.createSubscription({ planId: plan.id, totalCount: 0 })).toThrow(expect.objectContaining({ field: 'total_count' }) as Error);
    expect(() => engine.createSubscription({ planId: plan.id, totalCount: 1, startAt: engine.now() - 1 })).toThrow(expect.objectContaining({ field: 'start_at' }) as Error);
    const sub = engine.createSubscription({ planId: plan.id, totalCount: 2, quantity: 2 });
    expect(engine.authenticateSubscription(sub.id, { outcome: { kind: 'success' } }).payment.amount).toBe(99800);
    expect(() => engine.authenticateSubscription(sub.id, { outcome: { kind: 'success' } })).toThrow(expect.objectContaining({ reason: 'subscription_not_authenticatable' }) as Error);
  });
});
