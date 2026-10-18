import { describe, expect, it } from 'vitest';
import { createEngine } from './index.ts';

const setup = () => {
  const engine = createEngine({ seed: 'disputes', config: { refundDelaySeconds: { normal: 0, optimum: 0 } } });
  const order = engine.createOrder({ amount: 100000 });
  const payment = engine.attemptPayment({ orderId: order.id, method: 'card', outcome: { kind: 'success' } });
  return { engine, payment };
};

describe('disputes', () => {
  it('raises a dispute on a captured payment with a respond-by deadline', () => {
    const { engine, payment } = setup();
    const dispute = engine.raiseDispute(payment.id, { reasonCode: 'fraud' });
    expect(dispute).toMatchObject({ paymentId: payment.id, amount: 100000, status: 'open', reasonCode: 'fraud', amountDeducted: 0, respondBy: engine.now() + 7 * 86_400 });
    expect(dispute.id).toMatch(/^disp_/);
    expect(engine.events.at(-1)?.type).toBe('payment.dispute.created');
  });

  it('only disputes what was captured and not refunded', () => {
    const { engine, payment } = setup();
    engine.createRefund(payment.id, { amount: 60000 });
    expect(() => engine.raiseDispute(payment.id, { amount: 50000 })).toThrow(expect.objectContaining({ reason: 'refund_exceeds_payment' }) as Error);
    expect(engine.raiseDispute(payment.id).amount).toBe(40000);
    const order = engine.createOrder({ amount: 100, autoCapture: false });
    const authorized = engine.attemptPayment({ orderId: order.id, method: 'card', outcome: { kind: 'success' } });
    expect(() => engine.raiseDispute(authorized.id)).toThrow(expect.objectContaining({ reason: 'payment_not_captured' }) as Error);
  });

  it('accepting loses the dispute and deducts the amount', () => {
    const { engine, payment } = setup();
    const dispute = engine.raiseDispute(payment.id, { amount: 30000 });
    expect(engine.acceptDispute(dispute.id)).toMatchObject({ status: 'lost', amountDeducted: 30000 });
    expect(engine.events.at(-1)?.type).toBe('payment.dispute.lost');
  });

  it('drafts and submits evidence, then the bank decides', () => {
    const { engine, payment } = setup();
    const dispute = engine.raiseDispute(payment.id);
    expect(engine.contestDispute(dispute.id, { summary: 'Delivered with signature' })).toMatchObject({ status: 'open', evidence: { summary: 'Delivered with signature' } });
    expect(engine.contestDispute(dispute.id, { shippingProof: ['doc_1'] }, { submit: true })).toMatchObject({ status: 'under_review', evidence: { summary: 'Delivered with signature', shippingProof: ['doc_1'] } });
    expect(() => engine.contestDispute(dispute.id, {}, { submit: true })).toThrow(expect.objectContaining({ reason: 'dispute_not_open' }) as Error);
    expect(engine.resolveDispute(dispute.id, 'won')).toMatchObject({ status: 'won', amountDeducted: 0 });
    expect(engine.events.map((e) => e.type).slice(-3)).toEqual(['payment.dispute.updated', 'payment.dispute.under_review', 'payment.dispute.won']);
  });

  it('loses open disputes automatically after respond_by', () => {
    const { engine, payment } = setup();
    const dispute = engine.raiseDispute(payment.id, { respondInDays: 2 });
    engine.advanceTime(2 * 86_400_000);
    expect(engine.getDispute(dispute.id)).toMatchObject({ status: 'lost', amountDeducted: 100000 });
    expect(() => engine.resolveDispute(dispute.id, 'won')).toThrow(expect.objectContaining({ reason: 'dispute_not_open' }) as Error);
    expect(engine.listDisputes({ paymentId: payment.id })).toHaveLength(1);
  });
});
