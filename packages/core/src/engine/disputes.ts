// Disputes (chargebacks). In real life the bank raises them; in LocalPay a test, the
// dashboard or a scenario does. The merchant accepts or contests; an open dispute past
// respond_by is lost automatically on the scheduler tick.
import type { Dispute, DisputeEvidence, Paise, UnixSeconds } from '../entities/index.ts';
import { assertTransition } from '../machines/index.ts';
import type { EngineContext } from './context.ts';
import { EngineError, notFound } from './errors.ts';
import { assertAmount } from './orders.ts';
import type { PaymentOps } from './payments.ts';

export interface RaiseDisputeInput {
  /** Defaults to everything captured and not refunded. */
  amount?: Paise;
  reasonCode?: string;
  reasonDescription?: string;
  /** Days the merchant has to respond. */
  respondInDays?: number;
}

export const DEFAULT_RESPOND_DAYS = 7;

export function createDisputeOps(ctx: EngineContext, payments: PaymentOps) {
  const findDispute = (id: string): Dispute | undefined => ctx.state.disputes.get(id);
  const getDispute = (id: string): Dispute => {
    const dispute = findDispute(id);
    if (!dispute) throw notFound('dispute', id);
    return dispute;
  };
  const settle = (current: Dispute, status: 'won' | 'lost'): Dispute => {
    assertTransition('dispute', current.status, status);
    const dispute: Dispute = { ...current, status, amountDeducted: status === 'lost' ? current.amount : 0, resolvedAt: ctx.now() };
    ctx.emit(status === 'won' ? 'payment.dispute.won' : 'payment.dispute.lost', { dispute, payment: payments.getPayment(dispute.paymentId) });
    return dispute;
  };

  const ops = {
    findDispute,
    getDispute,

    listDisputes: (filter: { paymentId?: string } = {}): Dispute[] =>
      [...ctx.state.disputes.values()].reverse().filter((d) => filter.paymentId === undefined || d.paymentId === filter.paymentId),

    raiseDispute(paymentId: string, input: RaiseDisputeInput = {}): Dispute {
      const payment = payments.getPayment(paymentId);
      if (!payment.captured) throw new EngineError('payment_not_captured', `only captured payments can be disputed; ${paymentId} is ${payment.status}`);
      const disputable = payment.amount - payment.amountRefunded;
      const amount = input.amount ?? disputable;
      assertAmount(amount);
      if (amount > disputable) throw new EngineError('refund_exceeds_payment', 'dispute amount exceeds the captured amount not yet refunded', 'amount');
      const respondBy: UnixSeconds = ctx.now() + (input.respondInDays ?? DEFAULT_RESPOND_DAYS) * 86_400;
      const dispute: Dispute = {
        id: ctx.newId('disp'),
        paymentId,
        amount,
        currency: payment.currency,
        amountDeducted: 0,
        reasonCode: input.reasonCode ?? 'chargeback',
        reasonDescription: input.reasonDescription ?? 'The customer disputed this payment with their bank.',
        respondBy,
        status: 'open',
        phase: 'chargeback',
        evidence: null,
        createdAt: ctx.now(),
        resolvedAt: null,
      };
      ctx.emit('payment.dispute.created', { dispute, payment });
      return dispute;
    },

    /** The merchant gives up: the dispute is lost and the amount deducted. */
    acceptDispute(id: string): Dispute {
      return settle(getDispute(id), 'lost');
    },

    /** Saves evidence; with submit, the dispute goes to the bank for review. */
    contestDispute(id: string, evidence: DisputeEvidence, options: { submit?: boolean } = {}): Dispute {
      const current = getDispute(id);
      if (current.status !== 'open') throw new EngineError('dispute_not_open', `dispute ${id} is ${current.status}`);
      const next: Dispute = { ...current, evidence: { ...current.evidence, ...evidence } };
      if (!options.submit) {
        ctx.emit('payment.dispute.updated', { dispute: next });
        return next;
      }
      assertTransition('dispute', current.status, 'under_review');
      const dispute: Dispute = { ...next, status: 'under_review' };
      ctx.emit('payment.dispute.under_review', { dispute, payment: payments.getPayment(dispute.paymentId) });
      return dispute;
    },

    /** The bank's decision on a contested dispute (dashboard, scenario or test). */
    resolveDispute(id: string, outcome: 'won' | 'lost'): Dispute {
      const current = getDispute(id);
      if (current.status !== 'under_review') throw new EngineError('dispute_not_open', `only disputes under review can be resolved; ${id} is ${current.status}`);
      return settle(current, outcome);
    },

    /** Open disputes past respond_by are lost. Returns how many. */
    expireDueDisputes(): number {
      const due = [...ctx.state.disputes.values()].filter((d) => d.status === 'open' && d.respondBy <= ctx.now());
      for (const dispute of due) settle(dispute, 'lost');
      return due.length;
    },
  };
  return ops;
}

export type DisputeOps = ReturnType<typeof createDisputeOps>;
