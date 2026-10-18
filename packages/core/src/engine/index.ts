// The engine: one object with every operation, backed by one event log.
import type { ControllableClock } from '../clock/index.ts';
import { createEngineBase, type EngineBase, type EngineOptions } from './base.ts';
import { createCustomerOps, type CustomerOps } from './customers.ts';
import { EngineError } from './errors.ts';
import { createOrderOps, type OrderOps } from './orders.ts';
import { createPaymentLinkOps, type PaymentLinkOps } from './payment-links.ts';
import { createPaymentOps, type PaymentOps } from './payments.ts';
import { createRefundOps, type RefundOps } from './refunds.ts';
import { createSubscriptionOps, type SubscriptionOps } from './subscriptions.ts';

export interface Engine extends EngineBase, OrderOps, PaymentOps, RefundOps, CustomerOps, PaymentLinkOps, SubscriptionOps {
  /** Runs every time-driven transition that is due now. Returns how many ran. */
  tick(): number;
  /** Moves emulator time forward (needs a controllable clock), then ticks. */
  advanceTime(ms: number): number;
}

const isControllable = (clock: EngineBase['clock']): clock is ControllableClock => 'advance' in clock;

export function createEngine(options: EngineOptions = {}): Engine {
  const base = createEngineBase(options);
  const orders = createOrderOps(base);
  const payments = createPaymentOps(base, orders);
  const refunds = createRefundOps(base, payments);
  const customers = createCustomerOps(base);
  const paymentLinks = createPaymentLinkOps(base, orders);
  const subscriptions = createSubscriptionOps(base, orders, payments);

  // Links hook into the payment flow: refuse payments on closed links, advance them on capture.
  const attempt = payments.attemptPayment.bind(payments);
  payments.attemptPayment = (input) => {
    paymentLinks.assertPayable(input.orderId);
    return attempt(input);
  };
  const capture = payments.capturePayment.bind(payments);
  payments.capturePayment = (id, input) => {
    const captured = capture(id, input);
    paymentLinks.afterCapture(captured);
    return captured;
  };

  const tick = (): number => refunds.processDueRefunds() + paymentLinks.expireDuePaymentLinks() + subscriptions.chargeDueSubscriptions();

  // Two calls: Object.assign is only typed for up to three sources.
  const withOps = Object.assign(Object.assign(base, orders, payments), Object.assign(refunds, customers, paymentLinks), subscriptions);
  return Object.assign(withOps, {
    tick,
    advanceTime(ms: number): number {
      const clock = base.clock;
      if (!isControllable(clock)) throw new EngineError('time_not_controllable', 'this engine uses the system clock; start it with a controllable clock');
      const from = clock.now();
      clock.advance(ms);
      base.emit('clock.advanced', { from, to: clock.now() });
      return tick();
    },
  });
}

export type { EngineBase, EngineOptions, EventListener } from './base.ts';
export { DEFAULT_ENGINE_CONFIG, type EngineConfig, type EngineContext } from './context.ts';
export { EngineError, type EngineErrorReason } from './errors.ts';
export { amountDue, type CreateOrderInput } from './orders.ts';
export type { PaymentAttemptInput, PaymentFilter, PaymentOutcome } from './payments.ts';
export type { CreateRefundInput, RefundFilter } from './refunds.ts';
export type { CustomerInput } from './customers.ts';
export type { PaymentLinkInput, PaymentLinkPatch } from './payment-links.ts';
export { addPeriod } from './periods.ts';
export { MAX_CHARGE_ATTEMPTS, type PlanInput, type SubscriptionInput } from './subscriptions.ts';
