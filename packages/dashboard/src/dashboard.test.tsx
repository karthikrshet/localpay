// @vitest-environment happy-dom
// @vitest-environment-options { "url": "http://127.0.0.1:4010/" }
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.tsx';
import { Badge, formatMoney } from './components/ui.tsx';
import { snippet } from './pages/Home.tsx';
import { match, navigate } from './router.tsx';

const SESSION = { csrf: 'csrf-1', accountId: 'acc_LocalPayDemo01', keys: [{ keyId: 'rzp_test_LocalPayDemo01', keySecret: 'localpay_demo_secret' }], time: 1760800000, autoCapture: true, eventCount: 3 };

function mockApi(routes: Record<string, unknown>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    calls.push({ url, ...(init && { init }) });
    const path = url.replace('/_localpay/api', '').split('?')[0] ?? '';
    const body = routes[path] ?? { error: { description: `no mock for ${path}` } };
    return Promise.resolve(new Response(JSON.stringify(body), { status: routes[path] ? 200 : 404, headers: { 'content-type': 'application/json' } }));
  });
  return calls;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('router', () => {
  it('matches patterns with params', () => {
    expect(match('/orders/:id', '/orders/order_1')).toEqual({ id: 'order_1' });
    expect(match('/orders/:id', '/orders')).toBeNull();
    expect(match('/time', '/time')).toEqual({});
  });
});

describe('ui helpers', () => {
  it('formats money and colours statuses', () => {
    expect(formatMoney(49900)).toBe('₹499.00');
    render(<Badge status="failed" />);
    expect(screen.getByText('failed').className).toContain('bg-red-100');
  });

  it('marks unverified SDKs honestly in snippets', () => {
    expect(snippet('python', 'http://x', 'k', 's')).toContain('base_url="http://x"');
    expect(snippet('php', 'http://x', 'k', 's')).toContain('not verified yet');
    expect(snippet('checkout', 'http://x', 'k', 's')).toContain('http://x/v1/checkout.js');
  });
});

describe('App', () => {
  it('loads the session and shows keys and the Node snippet on Home', async () => {
    mockApi({ '/session': SESSION });
    render(<App />);
    expect(await screen.findByText('rzp_test_LocalPayDemo01')).toBeTruthy();
    expect(screen.getByRole('tabpanel').textContent).toContain("pointAtLocalPay");
    expect(screen.queryByText('localpay_demo_secret')).toBeNull();
    fireEvent.click(screen.getByText('Show secrets'));
    expect(screen.getByText('localpay_demo_secret')).toBeTruthy();
  });

  it('navigates to webhooks and replays a delivery with the CSRF header', async () => {
    const delivery = { id: 'whd_1', eventId: 'evt_1', event: 'payment.captured', targetId: 'wh_1', url: 'http://127.0.0.1:3000/webhooks', body: '{"event":"payment.captured"}', signed: true, status: 'delivered', attempts: [{ at: 1, requestHeaders: { 'X-Razorpay-Signature': 'abc' }, statusCode: 200, latencyMs: 4, responseBody: 'ok', error: null }], createdAt: 1, nextAttemptAt: null, notes: [] };
    const calls = mockApi({
      '/session': SESSION,
      '/webhooks/deliveries': { items: [delivery] },
      '/webhooks/targets': { items: [{ id: 'wh_1', url: 'http://127.0.0.1:3000/webhooks', secret: 's', events: null }], events: [] },
      '/webhooks/deliveries/whd_1/replay': { items: [] },
    });
    render(<App />);
    await screen.findByText('rzp_test_LocalPayDemo01');
    act(() => navigate('/webhooks'));
    fireEvent.click(await screen.findByText('payment.captured'));
    fireEvent.click(await screen.findByText('Replay now'));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/replay'))).toBe(true));
    const replay = calls.find((c) => c.url.endsWith('/replay'));
    expect(replay?.init?.method).toBe('POST');
    expect((replay?.init?.headers as Record<string, string>)['x-localpay-csrf']).toBe('csrf-1');
  });

  it('runs a gallery scenario and shows its steps and checks', async () => {
    const calls = mockApi({
      '/session': SESSION,
      '/scenarios': { items: [{ id: '01-happy-path', name: 'Happy path', description: 'A customer pays an order by UPI.', yaml: 'name: Happy path' }] },
      '/scenarios/run': { name: 'Happy path', ok: true, steps: [{ at: '1', step: 'order', ok: true, detail: 'order_1' }], checks: [{ name: 'orders.paid', ok: true, detail: 'expected 1, got 1' }], summary: { orders: { paid: 1 } }, events: [{ seq: 1, id: 'evt_1', type: 'order.created' }] },
    });
    render(<App />);
    await screen.findByText('rzp_test_LocalPayDemo01');
    act(() => navigate('/scenarios'));
    fireEvent.click(await screen.findByRole('button', { name: 'Run' }));
    expect(await screen.findByText('expected 1, got 1')).toBeTruthy();
    expect(screen.getByText('passed')).toBeTruthy();
    expect(JSON.parse(calls.find((c) => c.url.endsWith('/scenarios/run'))?.init?.body as string)).toEqual({ id: '01-happy-path' });
  });

  it('shows the API error when the session is missing', async () => {
    mockApi({});
    render(<App />);
    expect((await screen.findByRole('alert')).textContent).toContain('no mock for /session');
  });
});
