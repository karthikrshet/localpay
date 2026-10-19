import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../test-helpers.ts';
import { disputeRoutes } from './disputes.ts';

const setup = async () => {
  const env = await buildTestApp([disputeRoutes], { seed: 'disputes-api' });
  const order = env.engine.createOrder({ amount: 50000 });
  const payment = env.engine.attemptPayment({ orderId: order.id, method: 'card', outcome: { kind: 'success' } });
  const dispute = env.engine.raiseDispute(payment.id, { reasonCode: 'product_not_received' });
  return { ...env, payment, dispute };
};

describe('disputes API', () => {
  it('fetches and lists disputes', async () => {
    const { call, dispute, payment } = await setup();
    const { body } = await call('GET', `/v1/disputes/${dispute.id}`);
    expect(body).toMatchObject({ entity: 'dispute', payment_id: payment.id, amount: 50000, status: 'open', reason_code: 'product_not_received', amount_deducted: 0, evidence: null, phase: 'chargeback' });
    expect((await call('GET', '/v1/disputes')).body).toMatchObject({ entity: 'collection', count: 1 });
  });

  it('contests with a draft, then submits', async () => {
    const { call, dispute } = await setup();
    const draft = await call('PATCH', `/v1/disputes/${dispute.id}/contest`, { summary: 'Delivered', shipping_proof: ['doc_1'] });
    expect(draft.body).toMatchObject({ status: 'open', evidence: { summary: 'Delivered', shipping_proof: ['doc_1'], submitted_at: null } });
    const submitted = await call('PATCH', `/v1/disputes/${dispute.id}/contest`, { action: 'submit' });
    expect(submitted.body).toMatchObject({ status: 'under_review', evidence: { summary: 'Delivered' } });
  });

  it('accepts a dispute', async () => {
    const { call, dispute } = await setup();
    expect((await call('POST', `/v1/disputes/${dispute.id}/accept`)).body).toMatchObject({ status: 'lost', amount_deducted: 50000 });
    expect((await call('POST', `/v1/disputes/${dispute.id}/accept`)).status).toBe(400);
  });
});
