'use client';
import Script from 'next/script';
import { useState } from 'react';

// LocalPay's checkout.js in development; the real one when NEXT_PUBLIC_LOCALPAY_URL is unset.
const CHECKOUT_SRC = process.env.NEXT_PUBLIC_LOCALPAY_URL ? `${process.env.NEXT_PUBLIC_LOCALPAY_URL}/v1/checkout.js` : 'https://checkout.razorpay.com/v1/checkout.js';

interface CheckoutResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open(): void; on(event: string, handler: (response: { error: { description: string } }) => void): void };
  }
}

export default function Page() {
  const [status, setStatus] = useState('');

  async function buy() {
    const order = (await (await fetch('/api/orders', { method: 'POST' })).json()) as { order_id: string; amount: number; currency: string; key: string };
    const checkout = new window.Razorpay({
      key: order.key,
      order_id: order.order_id,
      amount: order.amount,
      currency: order.currency,
      name: 'Next.js demo shop',
      handler: async (response: CheckoutResponse) => {
        const result = (await (await fetch('/api/verify', { method: 'POST', body: JSON.stringify(response) })).json()) as { verified: boolean };
        setStatus(result.verified ? 'Payment verified. Waiting for the capture webhook…' : 'Signature check failed');
      },
      modal: { ondismiss: () => setStatus('Checkout closed') },
    });
    checkout.on('payment.failed', (response) => setStatus(`Payment failed: ${response.error.description}`));
    checkout.open();
  }

  return (
    <main>
      <Script src={CHECKOUT_SRC} strategy="afterInteractive" />
      <h1>Demo shop</h1>
      <p>Test T-shirt — ₹499.00</p>
      <button type="button" onClick={() => void buy()}>
        Buy
      </button>
      <p role="status">{status}</p>
    </main>
  );
}
