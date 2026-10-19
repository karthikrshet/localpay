import { describe, expect, it } from 'vitest';
import { createEngine } from './index.ts';

const DAY = 86_400_000;
const setup = () => createEngine({ seed: 'settle', config: { refundDelaySeconds: { normal: 0, optimum: 0 } } });
const pay = (engine: ReturnType<typeof setup>, amount: number) => {
  const order = engine.createOrder({ amount });
  return engine.attemptPayment({ orderId: order.id, method: 'upi', outcome: { kind: 'success' } });
};

describe('settlements', () => {
  it('settles captured payments T+2 days later, net of fees', () => {
    const engine = setup();
    const a = pay(engine, 100000);
    const b = pay(engine, 50000);
    engine.advanceTime(DAY);
    expect(engine.listSettlements()).toEqual([]);
    engine.advanceTime(DAY);
    const [settlement] = engine.listSettlements();
    expect(settlement).toMatchObject({ amount: 150000 - (a.fee ?? 0) - (b.fee ?? 0), fees: 2360 + 1180, tax: 360 + 180, status: 'processed', paymentIds: [a.id, b.id] });
    expect(settlement?.utr).toMatch(/^[A-Z0-9]{16}$/);
    expect(engine.events.map((e) => e.type)).toContain('settlement.processed');
  });

  it('never settles a payment twice and deducts refunds and lost disputes', () => {
    const engine = setup();
    const first = pay(engine, 100000);
    engine.advanceTime(2 * DAY);
    expect(engine.listSettlements()).toHaveLength(1);
    engine.createRefund(first.id, { amount: 10000 });
    const second = pay(engine, 200000);
    const dispute = engine.raiseDispute(second.id, { amount: 5000 });
    engine.acceptDispute(dispute.id);
    engine.advanceTime(2 * DAY);
    const latest = engine.listSettlements()[0];
    expect(latest?.paymentIds).toEqual([second.id]);
    expect(latest?.amount).toBe(200000 - (second.fee ?? 0) - 10000 - 5000);
    expect(latest?.refundIds).toHaveLength(1);
    expect(latest?.disputeIds).toEqual([dispute.id]);
    engine.advanceTime(5 * DAY);
    expect(engine.listSettlements()).toHaveLength(2);
  });

  it('honours a custom settlement delay and skips non-positive balances', () => {
    const engine = createEngine({ seed: 'settle-t0', config: { settlementDays: 0, refundDelaySeconds: { normal: 0, optimum: 0 } } });
    const p = pay(engine, 1000);
    engine.createRefund(p.id);
    engine.tick();
    expect(engine.listSettlements()).toEqual([]);
  });
});
