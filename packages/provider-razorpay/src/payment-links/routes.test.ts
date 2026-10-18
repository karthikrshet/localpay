import { describe, expect, it } from 'vitest';
import { TEST_KEY, buildTestApp } from '../test-helpers.ts';
import { paymentLinkRoutes } from './routes.ts';
import { callbackParams, paymentLinkSignature, verifyPaymentLinkSignature } from './serializer.ts';

const setup = () => buildTestApp([paymentLinkRoutes], { seed: 'plinks' });

describe('payment links API', () => {
  it('creates a link with a short_url on this server', async () => {
    const { call } = await setup();
    const { status, body } = await call('POST', '/v1/payment_links', {
      amount: 100000, description: 'Invoice 42', reference_id: 'INV-42', customer: { name: 'Asha', email: 'a@example.com' },
      notify: { sms: true }, callback_url: 'http://localhost:3000/paid', callback_method: 'get', notes: { k: 'v' },
    });
    expect(status).toBe(200);
    expect(body).toMatchObject({
      entity: 'payment_link', amount: 100000, amount_paid: 0, status: 'created', reference_id: 'INV-42', description: 'Invoice 42',
      customer: { name: 'Asha', email: 'a@example.com', contact: null }, notify: { sms: true, email: false }, payments: null,
      callback_url: 'http://localhost:3000/paid', callback_method: 'get', expire_by: 0, upi_link: false,
    });
    expect(body.short_url).toBe(`http://localhost:80/l/${String(body.id)}`);
  });

  it('fetches, lists by reference, updates and cancels', async () => {
    const { call } = await setup();
    const created = await call('POST', '/v1/payment_links', { amount: 5000, reference_id: 'R-1' });
    const id = String(created.body.id);
    expect((await call('GET', `/v1/payment_links/${id}`)).body).toMatchObject({ id, status: 'created' });
    expect((await call('GET', '/v1/payment_links?reference_id=R-1')).body).toMatchObject({ payment_links: [{ id }] });
    expect((await call('PATCH', `/v1/payment_links/${id}`, { notes: { a: 'b' }, reference_id: 'R-2' })).body).toMatchObject({ notes: { a: 'b' }, reference_id: 'R-2' });
    expect((await call('POST', `/v1/payment_links/${id}/cancel`)).body).toMatchObject({ status: 'cancelled' });
    expect((await call('POST', `/v1/payment_links/${id}/cancel`)).body).toMatchObject({ error: { reason: 'payment_link_inactive' } });
  });

  it('shows payments once the link is paid', async () => {
    const { call, engine } = await setup();
    const created = await call('POST', '/v1/payment_links', { amount: 5000 });
    const link = engine.getPaymentLink(String(created.body.id));
    const payment = engine.attemptPayment({ orderId: link.orderId, method: 'upi', outcome: { kind: 'success' } });
    expect((await call('GET', `/v1/payment_links/${link.id}`)).body).toMatchObject({ status: 'paid', amount_paid: 5000, payments: [{ payment_id: payment.id, plink_id: link.id, status: 'captured' }] });
    expect((await call('GET', `/v1/payment_links?payment_id=${payment.id}`)).body).toMatchObject({ payment_links: [{ id: link.id }] });
  });

  it('validates input', async () => {
    const { call } = await setup();
    expect((await call('POST', '/v1/payment_links', { amount: 50 })).body).toMatchObject({ error: { field: 'amount' } });
    expect((await call('POST', '/v1/payment_links', { amount: 500, upi_link: true })).body).toMatchObject({ error: { field: 'upi_link' } });
    expect((await call('POST', '/v1/payment_links', { amount: 500, callback_method: 'get' })).body).toMatchObject({ error: { field: 'callback_url' } });
    await call('POST', '/v1/payment_links', { amount: 500, reference_id: 'X' });
    expect((await call('POST', '/v1/payment_links', { amount: 500, reference_id: 'X' })).body).toMatchObject({ error: { reason: 'duplicate_reference_id' } });
  });
});

describe('payment link signature', () => {
  it('signs link_id|reference_id|status|payment_id and verifies', () => {
    const input = { paymentLinkId: 'plink_1', referenceId: 'INV-1', status: 'paid', paymentId: 'pay_1' };
    const params = callbackParams(input, TEST_KEY.keySecret);
    expect(params).toMatchObject({ razorpay_payment_id: 'pay_1', razorpay_payment_link_id: 'plink_1', razorpay_payment_link_reference_id: 'INV-1', razorpay_payment_link_status: 'paid' });
    expect(params.razorpay_signature).toBe(paymentLinkSignature(input, TEST_KEY.keySecret));
    expect(verifyPaymentLinkSignature({ ...input, signature: params.razorpay_signature ?? '' }, TEST_KEY.keySecret)).toBe(true);
    expect(verifyPaymentLinkSignature({ ...input, status: 'created', signature: params.razorpay_signature ?? '' }, TEST_KEY.keySecret)).toBe(false);
  });

  it('uses an empty reference id when there is none', () => {
    expect(paymentLinkSignature({ paymentLinkId: 'p', referenceId: null, status: 'paid', paymentId: 'x' }, 's')).toBe(paymentLinkSignature({ paymentLinkId: 'p', referenceId: '', status: 'paid', paymentId: 'x' }, 's'));
  });
});
