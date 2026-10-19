// Property tests for the time-driven entities: payment links, subscriptions, disputes and
// settlements. Random call sequences with day-sized time jumps must keep money consistent.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { replay } from '../state/index.ts';
import { EngineError } from './errors.ts';
import { createEngine, type Engine } from './index.ts';

const pick = fc.nat();
const DAY = 86_400_000;

const command = fc.oneof(
  fc.record({ op: fc.constant('pay' as const), amount: fc.integer({ min: 100, max: 50_000 }), outcome: fc.constantFrom('success', 'authorize_only', 'fail') }),
  fc.record({ op: fc.constant('capture' as const), payment: pick }),
  fc.record({ op: fc.constant('refund' as const), payment: pick, fraction: fc.double({ min: 0.1, max: 1.2, noNaN: true }) }),
  fc.record({ op: fc.constant('link' as const), amount: fc.integer({ min: 100, max: 50_000 }), partial: fc.boolean(), expireDays: fc.option(fc.integer({ min: 1, max: 5 }), { nil: null }) }),
  fc.record({ op: fc.constant('payLink' as const), link: pick, fraction: fc.double({ min: 0.2, max: 1, noNaN: true }) }),
  fc.record({ op: fc.constant('subscribe' as const), amount: fc.constantFrom(1000, 2013, 4900), total: fc.integer({ min: 1, max: 4 }), future: fc.boolean() }),
  fc.record({ op: fc.constant('cancelSub' as const), subscription: pick, atCycleEnd: fc.boolean() }),
  fc.record({ op: fc.constant('dispute' as const), payment: pick, fraction: fc.double({ min: 0.1, max: 1.2, noNaN: true }) }),
  fc.record({ op: fc.constant('disputeAction' as const), dispute: pick, action: fc.constantFrom('accept', 'submit', 'won', 'lost') }),
  fc.record({ op: fc.constant('advance' as const), days: fc.integer({ min: 0, max: 40 }) }),
);
type Command = typeof command extends fc.Arbitrary<infer C> ? C : never;

const nth = <T>(items: T[], index: number): T | undefined => (items.length ? items[index % items.length] : undefined);
const DECLINE = { kind: 'fail' as const, error: { code: 'BAD_REQUEST_ERROR', description: 'x', source: 'bank', step: 'payment_authorization', reason: 'x' } };

function run(engine: Engine, cmd: Command): void {
  switch (cmd.op) {
    case 'pay': {
      const order = engine.createOrder({ amount: cmd.amount });
      engine.attemptPayment({ orderId: order.id, method: 'card', outcome: cmd.outcome === 'fail' ? DECLINE : { kind: cmd.outcome } });
      return;
    }
    case 'capture': {
      const payment = nth(engine.listPayments().filter((p) => p.status === 'authorized'), cmd.payment);
      if (payment) engine.capturePayment(payment.id, { amount: payment.amount });
      return;
    }
    case 'refund': {
      const payment = nth(engine.listPayments(), cmd.payment);
      if (payment) engine.createRefund(payment.id, { amount: Math.max(100, Math.floor((payment.amount - payment.amountRefunded) * cmd.fraction)) });
      return;
    }
    case 'link':
      engine.createPaymentLink({ amount: cmd.amount, acceptPartial: cmd.partial, expireBy: cmd.expireDays ? engine.now() + cmd.expireDays * 86_400 : null });
      return;
    case 'payLink': {
      const link = nth(engine.listPaymentLinks(), cmd.link);
      if (!link) return;
      const due = link.amount - link.amountPaid;
      const amount = link.acceptPartial ? Math.max(100, Math.floor(due * cmd.fraction)) : undefined;
      engine.attemptPayment({ orderId: link.orderId, method: 'upi', outcome: { kind: 'success' }, ...(amount !== undefined && amount <= due && { amount }) });
      return;
    }
    case 'subscribe': {
      const plan = engine.createPlan({ period: 'monthly', interval: 1, item: { name: 'p', amount: cmd.amount } });
      const sub = engine.createSubscription({ planId: plan.id, totalCount: cmd.total, startAt: cmd.future ? engine.now() + 86_400 : null });
      engine.authenticateSubscription(sub.id, { outcome: { kind: 'success' } });
      return;
    }
    case 'cancelSub': {
      const sub = nth(engine.listSubscriptions(), cmd.subscription);
      if (sub) engine.cancelSubscription(sub.id, { atCycleEnd: cmd.atCycleEnd });
      return;
    }
    case 'dispute': {
      const payment = nth(engine.listPayments().filter((p) => p.captured), cmd.payment);
      if (payment) engine.raiseDispute(payment.id, { amount: Math.max(100, Math.floor((payment.amount - payment.amountRefunded) * cmd.fraction)) });
      return;
    }
    case 'disputeAction': {
      const dispute = nth(engine.listDisputes(), cmd.dispute);
      if (!dispute) return;
      if (cmd.action === 'accept') engine.acceptDispute(dispute.id);
      else if (cmd.action === 'submit') engine.contestDispute(dispute.id, { summary: 's' }, { submit: true });
      else engine.resolveDispute(dispute.id, cmd.action);
      return;
    }
    case 'advance':
      engine.advanceTime(cmd.days * DAY);
      return;
  }
}

function checkInvariants(engine: Engine): void {
  for (const link of engine.listPaymentLinks()) {
    expect(link.amountPaid).toBeLessThanOrEqual(link.amount);
    expect(link.status === 'paid').toBe(link.amountPaid >= link.amount);
    expect(link.amountPaid).toBe(link.paymentIds.reduce((sum, id) => sum + engine.getPayment(id).amount, 0));
  }
  for (const sub of engine.listSubscriptions()) {
    expect(sub.paidCount).toBeLessThanOrEqual(sub.totalCount);
    if (sub.status === 'completed') expect(sub.paidCount).toBe(sub.totalCount);
    if (sub.status === 'cancelled' || sub.status === 'completed' || sub.status === 'halted') expect(sub.chargeAt).toBeNull();
    const charges = sub.paymentIds.map((id) => engine.getPayment(id)).filter((p) => p.captured);
    expect(charges.length).toBe(sub.paidCount);
  }
  for (const dispute of engine.listDisputes()) {
    const payment = engine.getPayment(dispute.paymentId);
    expect(payment.captured).toBe(true);
    expect(dispute.amount).toBeLessThanOrEqual(payment.amount);
    expect(dispute.amountDeducted).toBe(dispute.status === 'lost' ? dispute.amount : 0);
  }
  const seen = new Set<string>();
  for (const settlement of engine.listSettlements()) {
    expect(settlement.amount).toBeGreaterThan(0);
    for (const id of [...settlement.paymentIds, ...settlement.refundIds, ...settlement.disputeIds]) {
      expect(seen.has(id), `${id} settled twice`).toBe(false);
      seen.add(id);
    }
    for (const id of settlement.paymentIds) expect(engine.getPayment(id).captured).toBe(true);
  }
}

describe('billing properties', () => {
  it('keeps links, subscriptions, disputes and settlements consistent through time jumps', () => {
    fc.assert(
      fc.property(fc.array(command, { minLength: 5, maxLength: 50 }), (commands) => {
        const engine = createEngine({ seed: 'billing-prop', config: { refundDelaySeconds: { normal: 3600, optimum: 0 } } });
        for (const cmd of commands) {
          try {
            run(engine, cmd);
          } catch (error) {
            if (!(error instanceof EngineError)) throw error;
          }
          checkInvariants(engine);
        }
        const rebuilt = replay(engine.events);
        expect(rebuilt.subscriptions).toEqual(engine.state.subscriptions);
        expect(rebuilt.settlements).toEqual(engine.state.settlements);
        expect(rebuilt.paymentLinks).toEqual(engine.state.paymentLinks);
      }),
      { numRuns: 150 },
    );
  }, 60_000);
});
