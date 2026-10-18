// @vitest-environment happy-dom
// @vitest-environment-options { "url": "http://localhost:3000/shop" }
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CheckoutApi } from './api.ts';
import { createCheckoutClass, isAllowedPage } from './checkout.tsx';
import { formatMoney } from './sheet.tsx';
import type { CheckoutOptions, FailureResponse, SuccessResponse } from './types.ts';

const SUCCESS: SuccessResponse = { razorpay_payment_id: 'pay_1', razorpay_order_id: 'order_1', razorpay_signature: 'sig' };
const FAILURE: FailureResponse = {
  error: { code: 'GATEWAY_ERROR', description: 'Bank is down.', source: 'bank', step: 'payment_authorization', reason: 'bank_technical_error', metadata: { order_id: 'order_1', payment_id: 'pay_2' } },
};

const fakeApi = (): CheckoutApi & { calls: Parameters<CheckoutApi['pay']>[0][] } => {
  const calls: Parameters<CheckoutApi['pay']>[0][] = [];
  return {
    calls,
    order: () => Promise.resolve({ id: 'order_1', amount: 50000, amount_due: 50000, currency: 'INR', status: 'created' }),
    scenarios: () =>
      Promise.resolve([
        { id: 'success', label: 'Pay successfully', effect: 'fires payment.captured' },
        { id: 'bank_down', label: 'Fail: bank down', effect: 'fires payment.failed' },
      ]),
    subscription: () => Promise.resolve({ id: 'sub_1', amount: 29900, amount_due: 29900, currency: 'INR', status: 'created' }),
    pay: (input) => {
      calls.push(input);
      return Promise.resolve(input.scenario === 'success' ? SUCCESS : FAILURE);
    },
  };
};

const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};
const root = () => document.querySelector('localpay-checkout')?.shadowRoot ?? null;
const button = (label: string) => [...(root()?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.includes(label));

const open = async (options: Partial<CheckoutOptions> = {}, allowedOrigins: string[] = []) => {
  const api = fakeApi();
  const Checkout = createCheckoutClass({ baseUrl: 'http://127.0.0.1:4010', allowedOrigins, api });
  const checkout = new Checkout({ key: 'rzp_test_LocalPayDemo01', order_id: 'order_1', name: 'Acme', ...options });
  checkout.open();
  await flush();
  return { api, checkout };
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('checkout.js', () => {
  it('requires a key', () => {
    const Checkout = createCheckoutClass({ baseUrl: 'x', allowedOrigins: [], api: fakeApi() });
    expect(() => new Checkout({} as CheckoutOptions)).toThrow(/options.key is required/);
  });

  it('renders the test-mode banner, merchant, amount, order id and scenarios', async () => {
    await open();
    const text = root()?.textContent ?? '';
    expect(text).toContain('TEST MODE · LocalPay · no real money moves');
    expect(text).toContain('Acme');
    expect(text).toContain('₹500.00');
    expect(text).toContain('order_1');
    expect(text).toContain('fires payment.captured');
    expect(root()?.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');
  });

  it('calls handler with the signed response and closes on success', async () => {
    const handler = vi.fn();
    const { api } = await open({ handler, prefill: { email: 'a@example.com', vpa: 'x@upi' } });
    button('Pay successfully')?.click();
    await flush();
    expect(handler).toHaveBeenCalledWith(SUCCESS);
    expect(api.calls[0]).toMatchObject({ keyId: 'rzp_test_LocalPayDemo01', orderId: 'order_1', method: 'upi', scenario: 'success', email: 'a@example.com', vpa: 'x@upi' });
    expect(root()).toBeNull();
  });

  it('records the selected method tab', async () => {
    const { api } = await open();
    button('Netbanking')?.click();
    await flush();
    button('Pay successfully')?.click();
    await flush();
    expect(api.calls[0]?.method).toBe('netbanking');
  });

  it('emits payment.failed, shows the error and stays open for a retry', async () => {
    const { checkout } = await open();
    const failed = vi.fn();
    checkout.on('payment.failed', failed);
    button('Fail: bank down')?.click();
    await flush();
    expect(failed).toHaveBeenCalledWith(FAILURE);
    expect(root()?.querySelector('[role="alert"]')?.textContent).toContain('Bank is down.');
    expect(button('Pay successfully')).toBeDefined();
  });

  it('calls ondismiss when closed without paying, or with Escape', async () => {
    const ondismiss = vi.fn();
    await open({ modal: { ondismiss } });
    button('Close without paying')?.click();
    expect(ondismiss).toHaveBeenCalledTimes(1);
    expect(root()).toBeNull();

    await open({ modal: { ondismiss } });
    root()?.querySelector('[role="dialog"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(ondismiss).toHaveBeenCalledTimes(2);
  });

  it('posts to callback_url when redirect is set', async () => {
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => undefined);
    await open({ callback_url: 'http://localhost:3000/paid', redirect: true });
    button('Pay successfully')?.click();
    await flush();
    const form = document.querySelector('form');
    expect(form?.action).toBe('http://localhost:3000/paid');
    expect(new FormData(form ?? undefined).get('razorpay_signature')).toBe('sig');
    expect(submit).toHaveBeenCalled();
  });

  it('authenticates subscriptions with subscription_id', async () => {
    const handler = vi.fn();
    const { api } = await open({ order_id: undefined, subscription_id: 'sub_1', handler });
    expect(root()?.textContent).toContain('₹299.00');
    expect(root()?.textContent).toContain('Subscription');
    button('Pay successfully')?.click();
    await flush();
    expect(api.calls[0]).toMatchObject({ subscriptionId: 'sub_1' });
    expect(api.calls[0]).not.toHaveProperty('orderId');
  });

  it('explains a missing order_id instead of failing silently', async () => {
    await open({ order_id: undefined });
    expect(root()?.querySelector('[role="alert"]')?.textContent).toContain('needs an order_id');
  });
});

describe('origin guard', () => {
  it('allows localhost pages and listed origins only', () => {
    expect(isAllowedPage({ hostname: 'localhost', origin: 'http://localhost:3000' }, [])).toBe(true);
    expect(isAllowedPage({ hostname: '127.0.0.1', origin: 'http://127.0.0.1' }, [])).toBe(true);
    expect(isAllowedPage({ hostname: 'shop.example', origin: 'https://shop.example' }, [])).toBe(false);
    expect(isAllowedPage({ hostname: 'shop.example', origin: 'https://shop.example' }, ['https://shop.example'])).toBe(true);
  });
});

describe('formatMoney', () => {
  it('formats paise as Indian currency', () => {
    expect(formatMoney(10013, 'INR')).toBe('₹100.13');
    expect(formatMoney(123456789, 'INR')).toBe('₹12,34,567.89');
  });
});
