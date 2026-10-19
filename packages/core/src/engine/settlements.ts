// Settlements: the gateway paying captured money out to the merchant, T+N days after
// capture. Each tick settles everything that has become due since the last settlement:
// payments (minus fees), less processed refunds and lost disputes not yet settled.
import type { Settlement } from '../entities/index.ts';
import type { EngineContext } from './context.ts';
import { notFound } from './errors.ts';

const UTR_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function createSettlementOps(ctx: EngineContext, random: { int(max: number): number }) {
  const getSettlement = (id: string): Settlement => {
    const settlement = ctx.state.settlements.get(id);
    if (!settlement) throw notFound('settlement', id);
    return settlement;
  };

  const settled = () => {
    const ids = new Set<string>();
    for (const s of ctx.state.settlements.values()) for (const id of [...s.paymentIds, ...s.refundIds, ...s.disputeIds]) ids.add(id);
    return ids;
  };

  return {
    getSettlement,
    listSettlements: (): Settlement[] => [...ctx.state.settlements.values()].reverse(),

    /** Creates at most one settlement with everything due. Returns 1 if it did, else 0. */
    settleDue(): number {
      const days = ctx.config.settlementDays;
      const cutoff = ctx.now() - days * 86_400;
      const done = settled();
      const payments = [...ctx.state.payments.values()].filter((p) => p.captured && p.capturedAt !== null && p.capturedAt <= cutoff && !done.has(p.id));
      const refunds = [...ctx.state.refunds.values()].filter((r) => r.status === 'processed' && r.processedAt !== null && r.processedAt <= ctx.now() && !done.has(r.id));
      const disputes = [...ctx.state.disputes.values()].filter((d) => d.status === 'lost' && !done.has(d.id));
      if (payments.length === 0) return 0;

      const gross = payments.reduce((sum, p) => sum + p.amount, 0);
      const fees = payments.reduce((sum, p) => sum + (p.fee ?? 0), 0);
      const tax = payments.reduce((sum, p) => sum + (p.tax ?? 0), 0);
      const deductions = refunds.reduce((sum, r) => sum + r.amount, 0) + disputes.reduce((sum, d) => sum + d.amountDeducted, 0);
      const amount = gross - fees - deductions;
      // A negative balance is carried over until later payments cover it.
      if (amount <= 0) return 0;

      let utr = '';
      for (let i = 0; i < 16; i++) utr += UTR_ALPHABET[random.int(UTR_ALPHABET.length)];
      const settlement: Settlement = {
        id: ctx.newId('setl'),
        amount,
        fees,
        tax,
        utr,
        status: 'processed',
        paymentIds: payments.map((p) => p.id),
        refundIds: refunds.map((r) => r.id),
        disputeIds: disputes.map((d) => d.id),
        createdAt: ctx.now(),
      };
      ctx.emit('settlement.processed', { settlement });
      return 1;
    },
  };
}

export type SettlementOps = ReturnType<typeof createSettlementOps>;
