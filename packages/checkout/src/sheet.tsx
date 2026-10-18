// The checkout popup. Scenario buttons instead of a card form: no real card data
// can be typed into LocalPay.
import { useEffect, useRef, useState } from 'preact/hooks';
import { isFailure, type CheckoutApi } from './api.ts';
import type { CheckoutError, CheckoutOptions, Method, OrderDetails, Scenario, SuccessResponse } from './types.ts';

const METHODS: { id: Method; label: string }[] = [
  { id: 'upi', label: 'UPI' },
  { id: 'card', label: 'Card' },
  { id: 'netbanking', label: 'Netbanking' },
  { id: 'wallet', label: 'Wallet' },
];

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount / 100);
  } catch {
    return `${currency} ${(amount / 100).toFixed(2)}`;
  }
}

export interface SheetProps {
  options: CheckoutOptions;
  api: CheckoutApi;
  onSuccess: (response: SuccessResponse) => void;
  onFailure: (error: CheckoutError) => void;
  onDismiss: () => void;
}

export function Sheet({ options, api, onSuccess, onFailure, onDismiss }: SheetProps) {
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [method, setMethod] = useState<Method>(options.prefill?.method ?? 'upi');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!options.order_id) {
      setProblem('LocalPay checkout needs an order_id. Create the order on your server with POST /v1/orders.');
      return;
    }
    Promise.all([api.order(options.order_id, options.key), api.scenarios()])
      .then(([details, list]) => {
        setOrder(details);
        setScenarios(list);
      })
      .catch((error: unknown) => setProblem(error instanceof Error ? error.message : 'Could not reach LocalPay.'));
  }, []);

  useEffect(() => {
    sheet.current?.querySelector<HTMLElement>('button')?.focus();
  }, [scenarios.length]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && options.modal?.escape !== false) {
      event.preventDefault();
      onDismiss();
      return;
    }
    if (event.key !== 'Tab' || !sheet.current) return;
    // Keep focus inside the dialog.
    const focusable = [...sheet.current.querySelectorAll<HTMLElement>('button:not([disabled])')];
    const first = focusable[0];
    const last = focusable.at(-1);
    const active = (sheet.current.getRootNode() as ShadowRoot | Document).activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const pay = async (scenario: Scenario) => {
    if (!options.order_id || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const response = await api.pay({
        keyId: options.key,
        orderId: options.order_id,
        method,
        scenario: scenario.id,
        ...(options.prefill?.email && { email: options.prefill.email }),
        ...(options.prefill?.contact && { contact: options.prefill.contact }),
        ...(method === 'upi' && options.prefill?.vpa && { vpa: options.prefill.vpa }),
      });
      if (isFailure(response)) {
        setProblem(`Payment failed: ${response.error.description}`);
        onFailure(response.error);
      } else {
        onSuccess(response);
      }
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Payment request failed.');
    } finally {
      setBusy(false);
    }
  };

  const amount = order ? (options.amount !== undefined ? Number(options.amount) : order.amount_due) : null;
  const copyId = () => {
    if (!options.order_id) return;
    void navigator.clipboard?.writeText(options.order_id).then(() => setCopied(true));
  };

  return (
    <div
      class="lp-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget && options.modal?.backdropclose) onDismiss();
      }}
    >
      <div class="lp-sheet" role="dialog" aria-modal="true" aria-labelledby="lp-title" ref={sheet} onKeyDown={onKeyDown}>
        <div class="lp-banner">TEST MODE · LocalPay · no real money moves</div>
        <div class="lp-header">
          <div>
            <h2 class="lp-title" id="lp-title">{options.name ?? 'Test merchant'}</h2>
            {options.description && <p class="lp-desc">{options.description}</p>}
          </div>
          <button class="lp-close" type="button" aria-label="Close checkout" onClick={onDismiss}>
            ×
          </button>
        </div>
        {amount !== null && order && <div class="lp-amount">{formatMoney(amount, options.currency ?? order.currency)}</div>}
        {options.order_id && (
          <div class="lp-id">
            <span>Order</span>
            <span class="lp-mono">{options.order_id}</span>
            <button class="lp-copy" type="button" onClick={copyId} aria-label="Copy order id">
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}
        <div class="lp-tabs" role="tablist" aria-label="Payment method">
          {METHODS.map((m) => (
            <button key={m.id} class="lp-tab" type="button" role="tab" aria-selected={method === m.id} onClick={() => setMethod(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        <div class="lp-body" role="tabpanel" aria-busy={busy}>
          {problem && (
            <div class="lp-alert" role="alert">
              {problem}
            </div>
          )}
          {scenarios.map((scenario, index) => (
            <button key={scenario.id} type="button" class={`lp-scenario${index === 0 ? ' lp-primary' : ''}`} disabled={busy} onClick={() => void pay(scenario)}>
              <span class="lp-label">{scenario.label}</span>
              <span class="lp-effect">{scenario.effect}</span>
            </button>
          ))}
          <button type="button" class="lp-dismiss" onClick={onDismiss}>
            Close without paying
          </button>
        </div>
        <div class="lp-footer">LocalPay is an independent test tool. It is not affiliated with Razorpay.</div>
      </div>
    </div>
  );
}
