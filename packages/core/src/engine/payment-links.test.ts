import { describe, expect, it } from 'vitest';
import { createEngine } from './index.ts';

const setup = () => createEngine({ seed: 'links' });

describe('payment links', () => {
  it('creates a link backed by its own order', () => {
    const engine = setup();
    const link = engine.createPaymentLink({ amount: 100000, description: 'Invoice 42', referenceId: 'INV-42', customer: { name: 'Asha', email: 'a@example.com' }, notes: { k: 'v' } });
    expect(link).toMatchObject({ amount: 100000, amountPaid: 0, status: 'created', referenceId: 'INV-42', customer: { name: 'Asha', email: 'a@example.com', contact: null } });
    expect(link.id).toMatch(/^plink_/);
    expect(engine.getOrder(link.orderId)).toMatchObject({ amount: 100000, receipt: 'INV-42' });
    expect(engine.events.map((e) => e.type)).toEqual(['order.created', 'payment_link.created']);
  });

  it('becomes paid when its order is paid, with a payment_link.paid event', () => {
    const engine = setup();
    const link = engine.createPaymentLink({ amount: 5000 });
    const payment = engine.attemptPayment({ orderId: link.orderId, method: 'upi', outcome: { kind: 'success' } });
    expect(engine.getPaymentLink(link.id)).toMatchObject({ status: 'paid', amountPaid: 5000, paymentIds: [payment.id] });
    const paid = engine.events.find((e) => e.type === 'payment_link.paid');
    expect(paid?.data).toMatchObject({ payment: { id: payment.id }, order: { status: 'paid' } });
    expect(engine.listPaymentLinks({ paymentId: payment.id }).map((l) => l.id)).toEqual([link.id]);
  });

  it('supports partial payments when accept_partial is set', () => {
    const engine = setup();
    const link = engine.createPaymentLink({ amount: 10000, acceptPartial: true });
    engine.attemptPayment({ orderId: link.orderId, method: 'upi', amount: 4000, outcome: { kind: 'success' } });
    expect(engine.getPaymentLink(link.id)).toMatchObject({ status: 'partially_paid', amountPaid: 4000 });
    engine.attemptPayment({ orderId: link.orderId, method: 'upi', outcome: { kind: 'success' } });
    expect(engine.getPaymentLink(link.id)).toMatchObject({ status: 'paid', amountPaid: 10000 });
  });

  it('only advances on capture, not on authorization', () => {
    const engine = setup();
    const link = engine.createPaymentLink({ amount: 100 });
    const payment = engine.attemptPayment({ orderId: link.orderId, method: 'card', outcome: { kind: 'authorize_only' } });
    expect(engine.getPaymentLink(link.id).status).toBe('created');
    engine.capturePayment(payment.id, { amount: 100 });
    expect(engine.getPaymentLink(link.id).status).toBe('paid');
  });

  it('expires on the scheduler tick and then refuses payments', () => {
    const engine = setup();
    const link = engine.createPaymentLink({ amount: 100, expireBy: engine.now() + 60 });
    engine.advanceTime(60_000);
    expect(engine.getPaymentLink(link.id)).toMatchObject({ status: 'expired', expiredAt: engine.now() });
    expect(() => engine.attemptPayment({ orderId: link.orderId, method: 'upi', outcome: { kind: 'success' } })).toThrow(expect.objectContaining({ reason: 'payment_link_inactive' }) as Error);
  });

  it('can be cancelled, updated while open, and rejects bad input', () => {
    const engine = setup();
    const link = engine.createPaymentLink({ amount: 100, referenceId: 'R1' });
    expect(() => engine.createPaymentLink({ amount: 100, referenceId: 'R1' })).toThrow(expect.objectContaining({ reason: 'duplicate_reference_id' }) as Error);
    expect(() => engine.createPaymentLink({ amount: 100, expireBy: engine.now() - 1 })).toThrow(expect.objectContaining({ reason: 'invalid_expiry' }) as Error);
    expect(engine.updatePaymentLink(link.id, { notes: { a: 1 }, referenceId: 'R2' })).toMatchObject({ notes: { a: 1 }, referenceId: 'R2' });
    expect(engine.cancelPaymentLink(link.id).status).toBe('cancelled');
    expect(() => engine.cancelPaymentLink(link.id)).toThrow(expect.objectContaining({ reason: 'payment_link_inactive' }) as Error);
    expect(() => engine.updatePaymentLink(link.id, { notes: {} })).toThrow(expect.objectContaining({ reason: 'payment_link_inactive' }) as Error);
  });
});
