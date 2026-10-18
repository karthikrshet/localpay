import type { Notes, Paise, Payment, Refund, RefundSpeed } from '../entities/index.ts';
import { assertTransition } from '../machines/index.ts';
import type { EngineContext } from './context.ts';
import { EngineError, notFound } from './errors.ts';
import { assertAmount } from './orders.ts';
import type { PaymentOps } from './payments.ts';

export interface CreateRefundInput {
  /** Defaults to everything not yet refunded. */
  amount?: Paise;
  speed?: RefundSpeed;
  notes?: Notes;
  receipt?: string | null;
}

export interface RefundFilter {
  paymentId?: string;
}

/** The payment as it looks after `amountRefunded` changes. */
function withRefunded(payment: Payment, amountRefunded: Paise): Payment {
  const full = amountRefunded >= payment.amount;
  const status = full ? 'refunded' : 'captured';
  assertTransition('payment', payment.status, status);
  return {
    ...payment,
    amountRefunded,
    refundStatus: amountRefunded === 0 ? null : full ? 'full' : 'partial',
    status,
  };
}

export function createRefundOps(ctx: EngineContext, payments: PaymentOps) {
  const findRefund = (id: string): Refund | undefined => ctx.state.refunds.get(id);
  const getRefund = (id: string): Refund => {
    const refund = findRefund(id);
    if (!refund) throw notFound('refund', id);
    return refund;
  };
  const pending = (id: string): Refund => {
    const refund = getRefund(id);
    if (refund.status !== 'pending') throw new EngineError('refund_not_pending', `refund ${id} is already ${refund.status}`);
    return refund;
  };

  const ops = {
    findRefund,
    getRefund,

    listRefunds(filter: RefundFilter = {}): Refund[] {
      const all = [...ctx.state.refunds.values()].reverse();
      return filter.paymentId ? all.filter((r) => r.paymentId === filter.paymentId) : all;
    },

    createRefund(paymentId: string, input: CreateRefundInput = {}): Refund {
      const payment = payments.getPayment(paymentId);
      if (payment.status === 'refunded') throw new EngineError('payment_fully_refunded', `payment ${paymentId} has been fully refunded`);
      if (payment.status !== 'captured') throw new EngineError('payment_not_captured', `only captured payments can be refunded; ${paymentId} is ${payment.status}`);
      const remaining = payment.amount - payment.amountRefunded;
      const amount = input.amount ?? remaining;
      assertAmount(amount);
      if (amount > remaining) throw new EngineError('refund_exceeds_payment', 'refund amount exceeds the amount not yet refunded', 'amount');

      const speed = input.speed ?? 'normal';
      const now = ctx.now();
      const refund: Refund = {
        id: ctx.newId('rfnd'),
        paymentId,
        amount,
        currency: payment.currency,
        status: 'pending',
        speedRequested: speed,
        speedProcessed: null,
        notes: input.notes ?? {},
        receipt: input.receipt ?? null,
        createdAt: now,
        processAt: now + ctx.config.refundDelaySeconds[speed],
        processedAt: null,
      };
      ctx.emit('refund.created', { refund, payment: withRefunded(payment, payment.amountRefunded + amount) });
      return refund.processAt <= now ? ops.processRefund(refund.id) : refund;
    },

    processRefund(id: string): Refund {
      const refund = pending(id);
      assertTransition('refund', refund.status, 'processed');
      const processed: Refund = {
        ...refund,
        status: 'processed',
        speedProcessed: refund.speedRequested === 'optimum' ? 'instant' : 'normal',
        processedAt: ctx.now(),
      };
      ctx.emit('refund.processed', { refund: processed, payment: payments.getPayment(refund.paymentId) });
      return processed;
    },

    /** The bank rejected the refund: the amount goes back to the merchant's side. */
    failRefund(id: string): Refund {
      const refund = pending(id);
      assertTransition('refund', refund.status, 'failed');
      const payment = payments.getPayment(refund.paymentId);
      const failed: Refund = { ...refund, status: 'failed' };
      ctx.emit('refund.failed', { refund: failed, payment: withRefunded(payment, payment.amountRefunded - refund.amount) });
      return failed;
    },

    /** Processes every pending refund whose time has come. Returns how many. */
    processDueRefunds(): number {
      const due = [...ctx.state.refunds.values()].filter((r) => r.status === 'pending' && r.processAt <= ctx.now());
      for (const refund of due) ops.processRefund(refund.id);
      return due.length;
    },
  };
  return ops;
}

export type RefundOps = ReturnType<typeof createRefundOps>;
