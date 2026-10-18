// Property tests: random sequences of API calls must never reach an impossible state.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { PaymentMethod } from '../entities/index.ts';
import { replay } from '../state/index.ts';
import { EngineError } from './errors.ts';
import { createEngine, type Engine } from './index.ts';

const method = fc.constantFrom<PaymentMethod>('upi', 'card', 'netbanking', 'wallet');
const pick = fc.nat(); // index into existing entities, taken modulo their count

const command = fc.oneof(
  fc.record({ op: fc.constant('order' as const), amount: fc.integer({ min: 100, max: 100_000 }), partial: fc.boolean(), autoCapture: fc.option(fc.boolean(), { nil: null }) }),
  fc.record({ op: fc.constant('attempt' as const), order: pick, method, outcome: fc.constantFrom('success', 'authorize_only', 'fail'), fraction: fc.double({ min: 0.1, max: 1, noNaN: true }) }),
  fc.record({ op: fc.constant('capture' as const), payment: pick, exact: fc.boolean() }),
  fc.record({ op: fc.constant('refund' as const), payment: pick, amount: fc.option(fc.integer({ min: 1, max: 120_000 }), { nil: undefined }) }),
  fc.record({ op: fc.constant('failRefund' as const), refund: pick }),
  fc.record({ op: fc.constant('advance' as const), seconds: fc.integer({ min: 0, max: 30 }) }),
);
type Command = typeof command extends fc.Arbitrary<infer C> ? C : never;

const nth = <T>(items: T[], index: number): T | undefined => (items.length ? items[index % items.length] : undefined);

function run(engine: Engine, cmd: Command): void {
  switch (cmd.op) {
    case 'order':
      engine.createOrder({ amount: cmd.amount, partialPayment: cmd.partial, autoCapture: cmd.autoCapture });
      return;
    case 'attempt': {
      const order = nth(engine.listOrders(), cmd.order);
      if (!order) return;
      const due = order.amount - order.amountPaid;
      const amount = order.partialPayment ? Math.max(1, Math.floor(due * cmd.fraction)) : undefined;
      const outcome = cmd.outcome === 'fail'
        ? { kind: 'fail' as const, error: { code: 'BAD_REQUEST_ERROR', description: 'x', source: 'bank', step: 'payment_authorization', reason: 'x' } }
        : { kind: cmd.outcome };
      engine.attemptPayment({ orderId: order.id, method: cmd.method, outcome, ...(amount !== undefined && { amount }) });
      return;
    }
    case 'capture': {
      const payment = nth(engine.listPayments(), cmd.payment);
      if (payment) engine.capturePayment(payment.id, { amount: cmd.exact ? payment.amount : payment.amount + 1 });
      return;
    }
    case 'refund': {
      const payment = nth(engine.listPayments(), cmd.payment);
      if (payment) engine.createRefund(payment.id, cmd.amount === undefined ? {} : { amount: cmd.amount });
      return;
    }
    case 'failRefund': {
      const refund = nth(engine.listRefunds(), cmd.refund);
      if (refund) engine.failRefund(refund.id);
      return;
    }
    case 'advance':
      engine.advanceTime(cmd.seconds * 1000);
      return;
  }
}

function checkInvariants(engine: Engine): void {
  for (const payment of engine.listPayments()) {
    const live = engine.listRefunds({ paymentId: payment.id }).filter((r) => r.status !== 'failed');
    const refunded = live.reduce((sum, r) => sum + r.amount, 0);
    expect(payment.amountRefunded).toBe(refunded);
    expect(payment.amountRefunded).toBeLessThanOrEqual(payment.amount);
    if (payment.amountRefunded > 0) expect(payment.captured).toBe(true);
    expect(payment.captured).toBe(payment.status === 'captured' || payment.status === 'refunded');
    expect(payment.status === 'refunded').toBe(payment.amountRefunded === payment.amount);
  }
  for (const order of engine.listOrders()) {
    const captured = engine.listPayments({ orderId: order.id }).filter((p) => p.captured);
    expect(order.amountPaid).toBe(captured.reduce((sum, p) => sum + p.amount, 0));
    expect(order.amountPaid).toBeLessThanOrEqual(order.amount);
    expect(order.status === 'paid').toBe(order.amountPaid >= order.amount);
    expect(order.attempts).toBe(engine.listPayments({ orderId: order.id }).length);
  }
}

describe('engine properties', () => {
  it('never reaches an impossible state, and replay rebuilds the same state', () => {
    fc.assert(
      fc.property(fc.array(command, { minLength: 10, maxLength: 80, size: 'large' }), (commands) => {
        const engine = createEngine({ seed: 'prop' });
        for (const cmd of commands) {
          try {
            run(engine, cmd);
          } catch (error) {
            // Rejected requests are fine; anything else (e.g. an invalid transition) is a bug.
            if (!(error instanceof EngineError)) throw error;
          }
          checkInvariants(engine);
        }
        const rebuilt = replay(engine.events);
        expect(rebuilt.orders).toEqual(engine.state.orders);
        expect(rebuilt.payments).toEqual(engine.state.payments);
        expect(rebuilt.refunds).toEqual(engine.state.refunds);
      }),
      { numRuns: 200 },
    );
  }, 30_000);
});
