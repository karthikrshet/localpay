import type { Notes, Paise, Payment, PaymentError, PaymentMethod } from '../entities/index.ts';
import { assertTransition } from '../machines/index.ts';
import { computeFee } from '../money/index.ts';
import type { EngineContext } from './context.ts';
import { EngineError, notFound } from './errors.ts';
import { amountDue, assertAmount, type OrderOps } from './orders.ts';

/** What the (fake) customer and bank do with this attempt. */
export type PaymentOutcome =
  | { kind: 'success' }
  | { kind: 'authorize_only' }
  | { kind: 'fail'; error: PaymentError };

export interface PaymentAttemptInput {
  orderId: string;
  method: PaymentMethod;
  outcome: PaymentOutcome;
  /** Defaults to the order's amount due. */
  amount?: Paise;
  email?: string | null;
  contact?: string | null;
  description?: string | null;
  notes?: Notes;
  vpa?: string | null;
  bank?: string | null;
  wallet?: string | null;
}

export interface PaymentFilter {
  orderId?: string;
}

export function createPaymentOps(ctx: EngineContext, orders: OrderOps) {
  const findPayment = (id: string): Payment | undefined => ctx.state.payments.get(id);
  const getPayment = (id: string): Payment => {
    const payment = findPayment(id);
    if (!payment) throw notFound('payment', id);
    return payment;
  };

  const ops = {
    findPayment,
    getPayment,

    listPayments(filter: PaymentFilter = {}): Payment[] {
      const all = [...ctx.state.payments.values()].reverse();
      return filter.orderId ? all.filter((p) => p.orderId === filter.orderId) : all;
    },

    updatePaymentNotes(id: string, notes: Notes): Payment {
      const payment: Payment = { ...getPayment(id), notes };
      ctx.emit('payment.updated', { payment });
      return payment;
    },

    /** Runs one checkout attempt against an order: authorize (and maybe capture) or fail. */
    attemptPayment(input: PaymentAttemptInput): Payment {
      const order = orders.getOrder(input.orderId);
      if (order.status === 'paid') throw new EngineError('order_already_paid', `order ${order.id} is already paid`, 'order_id');
      const due = amountDue(order);
      const amount = input.amount ?? due;
      assertAmount(amount);
      if (amount > due) throw new EngineError('amount_exceeds_amount_due', 'amount exceeds the amount due on the order', 'amount');
      if (!order.partialPayment && amount !== due) {
        throw new EngineError('partial_payment_not_allowed', 'partial payments are not enabled for this order', 'amount');
      }

      const attemptedOrder = { ...order, attempts: order.attempts + 1, status: order.status === 'created' ? ('attempted' as const) : order.status };
      assertTransition('order', order.status, attemptedOrder.status);
      ctx.emit('order.updated', { order: attemptedOrder });

      const created: Payment = {
        id: ctx.newId('pay'),
        orderId: order.id,
        amount,
        currency: order.currency,
        status: 'created',
        method: input.method,
        captured: false,
        description: input.description ?? null,
        email: input.email ?? null,
        contact: input.contact ?? null,
        bank: input.method === 'netbanking' ? (input.bank ?? null) : null,
        wallet: input.method === 'wallet' ? (input.wallet ?? null) : null,
        vpa: input.method === 'upi' ? (input.vpa ?? null) : null,
        cardId: input.method === 'card' ? ctx.newId('card') : null,
        amountRefunded: 0,
        refundStatus: null,
        fee: null,
        tax: null,
        error: null,
        notes: input.notes ?? {},
        createdAt: ctx.now(),
        authorizedAt: null,
        capturedAt: null,
      };

      if (input.outcome.kind === 'fail') {
        assertTransition('payment', created.status, 'failed');
        const failed: Payment = { ...created, status: 'failed', error: input.outcome.error };
        ctx.emit('payment.failed', { payment: failed });
        return failed;
      }

      assertTransition('payment', created.status, 'authorized');
      const authorized: Payment = { ...created, status: 'authorized', authorizedAt: ctx.now() };
      ctx.emit('payment.authorized', { payment: authorized });

      const autoCapture = input.outcome.kind === 'success' && (order.autoCapture ?? ctx.config.autoCapture);
      return autoCapture ? ops.capturePayment(authorized.id, { amount: authorized.amount }) : authorized;
    },

    /** Claims an authorized payment. The amount must equal the authorized amount. */
    capturePayment(id: string, input: { amount: Paise; currency?: string }): Payment {
      const payment = getPayment(id);
      if (payment.captured) throw new EngineError('payment_already_captured', `payment ${id} has already been captured`);
      if (payment.status !== 'authorized') {
        throw new EngineError('payment_not_authorized', `only authorized payments can be captured; ${id} is ${payment.status}`);
      }
      if (input.amount !== payment.amount) {
        throw new EngineError('capture_amount_mismatch', 'capture amount must equal the authorized amount', 'amount');
      }
      if (input.currency !== undefined && input.currency !== payment.currency) {
        throw new EngineError('currency_mismatch', 'currency does not match the payment currency', 'currency');
      }

      // Two payments can be authorized against one order; only one may settle it.
      const order = payment.orderId ? orders.getOrder(payment.orderId) : null;
      if (order && order.amountPaid + payment.amount > order.amount) {
        throw order.status === 'paid'
          ? new EngineError('order_already_paid', `order ${order.id} is already paid`)
          : new EngineError('amount_exceeds_amount_due', 'capturing this payment would exceed the amount due on the order', 'amount');
      }

      const { fee, tax } = computeFee(payment.amount, ctx.config.fees);
      assertTransition('payment', payment.status, 'captured');
      const captured: Payment = { ...payment, status: 'captured', captured: true, fee, tax, capturedAt: ctx.now() };
      ctx.emit('payment.captured', { payment: captured });

      if (order) {
        const amountPaid = order.amountPaid + captured.amount;
        const status = amountPaid >= order.amount ? 'paid' : order.status;
        assertTransition('order', order.status, status);
        const updated = { ...order, amountPaid, status };
        if (status === 'paid') ctx.emit('order.paid', { order: updated, payment: captured });
        else ctx.emit('order.updated', { order: updated });
      }
      return captured;
    },
  };
  return ops;
}

export type PaymentOps = ReturnType<typeof createPaymentOps>;
