// Plans and subscriptions. Charges are driven by the clock: tick() charges every
// subscription whose chargeAt has passed, so time travel runs months of renewals.
import type { Notes, Paise, Payment, PaymentMethod, Plan, PlanPeriod, Subscription, UnixSeconds } from '../entities/index.ts';
import { assertTransition } from '../machines/index.ts';
import type { EngineContext } from './context.ts';
import { EngineError, notFound } from './errors.ts';
import { assertAmount, type OrderOps } from './orders.ts';
import type { PaymentOps, PaymentOutcome } from './payments.ts';
import { addPeriod } from './periods.ts';

export interface PlanInput {
  period: PlanPeriod;
  interval: number;
  item: { name: string; amount: Paise; currency?: string; description?: string | null };
  notes?: Notes;
}

export interface SubscriptionInput {
  planId: string;
  totalCount: number;
  quantity?: number;
  startAt?: UnixSeconds | null;
  customerId?: string | null;
  customerNotify?: boolean;
  notes?: Notes;
}

/** Failed renewals are retried daily; after this many in a row the subscription halts. */
export const MAX_CHARGE_ATTEMPTS = 3;

type StatusEvent =
  | 'subscription.authenticated'
  | 'subscription.activated'
  | 'subscription.pending'
  | 'subscription.halted'
  | 'subscription.cancelled'
  | 'subscription.completed'
  | 'subscription.updated';
const RETRY_AFTER_SECONDS = 86_400;
/** Authorization amount when the first charge is in the future (₹1). */
export const MANDATE_AUTH_AMOUNT = 100;

const RENEWAL_FAILURE: PaymentOutcome = {
  kind: 'fail',
  error: { code: 'BAD_REQUEST_ERROR', description: 'The renewal payment was declined by the bank.', source: 'bank', step: 'payment_authorization', reason: 'payment_declined' },
};

export function createSubscriptionOps(ctx: EngineContext, orders: OrderOps, payments: PaymentOps) {
  const getPlan = (id: string): Plan => {
    const plan = ctx.state.plans.get(id);
    if (!plan) throw notFound('plan', id);
    return plan;
  };
  const findSubscription = (id: string): Subscription | undefined => ctx.state.subscriptions.get(id);
  const getSubscription = (id: string): Subscription => {
    const subscription = findSubscription(id);
    if (!subscription) throw notFound('subscription', id);
    return subscription;
  };
  const chargeAmount = (subscription: Subscription): Paise => getPlan(subscription.planId).item.amount * subscription.quantity;

  /** Records a change with its event, checking the state machine. */
  const move = (current: Subscription, next: Subscription, event: StatusEvent): Subscription => {
    if (current.status !== next.status) assertTransition('subscription', current.status, next.status);
    ctx.emit(event, { subscription: next });
    return next;
  };

  /** One charge attempt for the current cycle. Returns the subscription afterwards. */
  const charge = (current: Subscription, method: PaymentMethod, outcome?: PaymentOutcome): { subscription: Subscription; payment: Payment } => {
    const plan = getPlan(current.planId);
    const amount = chargeAmount(current);
    const order = orders.createOrder({ amount, currency: plan.item.currency, receipt: current.id, autoCapture: true });
    // Magic value: plans whose amount ends in paise 13 fail every renewal.
    const chosen = outcome ?? (plan.item.amount % 100 === 13 ? RENEWAL_FAILURE : { kind: 'success' as const });
    const payment = payments.attemptPayment({ orderId: order.id, method, outcome: chosen });

    if (payment.status !== 'captured') {
      const failed: Subscription = { ...current, authAttempts: current.authAttempts + 1, paymentIds: [...current.paymentIds, payment.id] };
      // A failed first checkout leaves the subscription waiting for another attempt.
      if (current.status === 'created') return { subscription: move(current, failed, 'subscription.updated'), payment };
      if (failed.authAttempts >= MAX_CHARGE_ATTEMPTS) {
        return { subscription: move(current, { ...failed, status: 'halted', chargeAt: null }, 'subscription.halted'), payment };
      }
      // Retry a day after the missed charge, not after "now": one long time jump then runs
      // every retry that would have happened, as if the clock had ticked all along.
      const retry: Subscription = { ...failed, status: 'pending', chargeAt: (current.chargeAt ?? ctx.now()) + RETRY_AFTER_SECONDS };
      return { subscription: move(current, retry, current.status === 'pending' ? 'subscription.updated' : 'subscription.pending'), payment };
    }

    const periodStart = current.chargeAt ?? ctx.now();
    const paidCount = current.paidCount + 1;
    const done = paidCount >= current.totalCount;
    const periodEnd = addPeriod(periodStart, plan.period, plan.interval);
    let subscription: Subscription = {
      ...current,
      paidCount,
      authAttempts: 0,
      currentStart: periodStart,
      currentEnd: periodEnd,
      chargeAt: done ? null : periodEnd,
      paymentIds: [...current.paymentIds, payment.id],
    };
    if (current.status === 'created') subscription = move(current, { ...subscription, status: 'authenticated' }, 'subscription.authenticated');
    if (subscription.status !== 'active') subscription = move(subscription, { ...subscription, status: 'active' }, 'subscription.activated');
    ctx.emit('subscription.charged', { subscription, payment });
    if (done) subscription = move(subscription, { ...subscription, status: 'completed', endedAt: ctx.now() }, 'subscription.completed');
    return { subscription, payment };
  };

  const ops = {
    getPlan,
    findSubscription,
    getSubscription,

    createPlan(input: PlanInput): Plan {
      if (!Number.isInteger(input.interval) || input.interval < 1) throw new EngineError('invalid_plan', 'interval must be a positive integer', 'interval');
      assertAmount(input.item.amount, 'item.amount');
      const plan: Plan = {
        id: ctx.newId('plan'),
        period: input.period,
        interval: input.interval,
        item: { name: input.item.name, amount: input.item.amount, currency: input.item.currency ?? 'INR', description: input.item.description ?? null },
        notes: input.notes ?? {},
        createdAt: ctx.now(),
      };
      ctx.emit('plan.created', { plan });
      return plan;
    },

    listPlans: (): Plan[] => [...ctx.state.plans.values()].reverse(),

    createSubscription(input: SubscriptionInput): Subscription {
      getPlan(input.planId);
      if (!Number.isInteger(input.totalCount) || input.totalCount < 1) throw new EngineError('invalid_plan', 'total_count must be a positive integer', 'total_count');
      const quantity = input.quantity ?? 1;
      if (!Number.isInteger(quantity) || quantity < 1) throw new EngineError('invalid_plan', 'quantity must be a positive integer', 'quantity');
      if (input.startAt != null && input.startAt <= ctx.now()) throw new EngineError('invalid_expiry', 'start_at must be in the future', 'start_at');
      const subscription: Subscription = {
        id: ctx.newId('sub'),
        planId: input.planId,
        customerId: input.customerId ?? null,
        status: 'created',
        quantity,
        totalCount: input.totalCount,
        paidCount: 0,
        startAt: input.startAt ?? null,
        chargeAt: null,
        currentStart: null,
        currentEnd: null,
        endedAt: null,
        authAttempts: 0,
        cancelAtCycleEnd: false,
        customerNotify: input.customerNotify ?? true,
        notes: input.notes ?? {},
        paymentIds: [],
        createdAt: ctx.now(),
      };
      ctx.emit('subscription.created', { subscription });
      return subscription;
    },

    /** What checkout charges or authorizes when the subscription is authenticated. */
    authenticationAmount(id: string): Paise {
      const subscription = getSubscription(id);
      return subscription.startAt === null ? chargeAmount(subscription) : MANDATE_AUTH_AMOUNT;
    },

    listSubscriptions: (filter: { planId?: string } = {}): Subscription[] =>
      [...ctx.state.subscriptions.values()].reverse().filter((s) => filter.planId === undefined || s.planId === filter.planId),

    /**
     * The customer completes checkout for a subscription. Without start_at the first
     * cycle is charged now; with a future start_at the mandate is authenticated and the
     * first charge waits for start_at.
     */
    authenticateSubscription(id: string, input: { method?: PaymentMethod; outcome: PaymentOutcome }): { subscription: Subscription; payment: Payment } {
      const current = getSubscription(id);
      if (current.status !== 'created') throw new EngineError('subscription_not_authenticatable', `subscription ${id} is ${current.status}`);
      const method = input.method ?? 'card';
      if (current.startAt === null || input.outcome.kind === 'fail') return charge(current, method, input.outcome.kind === 'fail' ? input.outcome : undefined);

      // Future start: a ₹1 authorization records the mandate and is released at once, so it
      // can never be captured (found by the billing property test).
      const order = orders.createOrder({ amount: MANDATE_AUTH_AMOUNT, receipt: current.id, autoCapture: false });
      const authorized = payments.attemptPayment({ orderId: order.id, method, outcome: { kind: 'authorize_only' } });
      const payment = payments.releaseAuthorization(authorized.id);
      const subscription = move(current, { ...current, status: 'authenticated', chargeAt: current.startAt, paymentIds: [...current.paymentIds, payment.id] }, 'subscription.authenticated');
      return { subscription, payment };
    },

    cancelSubscription(id: string, options: { atCycleEnd?: boolean } = {}): Subscription {
      const current = getSubscription(id);
      if (current.status === 'cancelled' || current.status === 'completed') throw new EngineError('subscription_ended', `subscription ${id} is already ${current.status}`);
      if (options.atCycleEnd && current.status !== 'created') {
        return move(current, { ...current, cancelAtCycleEnd: true }, 'subscription.updated');
      }
      return move(current, { ...current, status: 'cancelled', chargeAt: null, endedAt: ctx.now() }, 'subscription.cancelled');
    },

    /** Charges (or retries) every subscription that is due. Returns how many attempts ran. */
    chargeDueSubscriptions(): number {
      let attempts = 0;
      for (;;) {
        const due = [...ctx.state.subscriptions.values()].filter(
          (s) => (s.status === 'authenticated' || s.status === 'active' || s.status === 'pending') && s.chargeAt !== null && s.chargeAt <= ctx.now(),
        );
        if (due.length === 0) return attempts;
        for (const subscription of due) {
          attempts++;
          if (subscription.cancelAtCycleEnd) {
            move(subscription, { ...subscription, status: 'cancelled', chargeAt: null, endedAt: ctx.now() }, 'subscription.cancelled');
            continue;
          }
          charge(subscription, 'card');
        }
      }
    },
  };
  return ops;
}

export type SubscriptionOps = ReturnType<typeof createSubscriptionOps>;
