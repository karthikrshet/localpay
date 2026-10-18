// The hosted page behind a payment link's short_url (/l/<id>). It opens the test
// checkout for the link's order, then redirects to callback_url with signed params.
import type { Engine, PaymentLink } from '@localpay/core';
import type { FastifyPluginCallback, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { ApiKey } from '../auth.ts';
import { badRequest } from '../errors.ts';
import { toApiError } from '../plugin.ts';
import { parseWith } from '../schemas.ts';
import { callbackParams } from './serializer.ts';

export interface PaymentLinkPageOptions {
  engine: Engine;
  keys: readonly ApiKey[];
}

export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

const PAGE_CSP = "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";

const STATUS_TEXT: Record<string, string> = {
  paid: 'This link has been paid. Thank you.',
  expired: 'This payment link has expired.',
  cancelled: 'This payment link was cancelled.',
};

function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount / 100);
  } catch {
    return `${currency} ${(amount / 100).toFixed(2)}`;
  }
}

export function renderLinkPage(link: PaymentLink, keyId: string): string {
  const due = link.amount - link.amountPaid;
  const closed = STATUS_TEXT[link.status];
  const attr = (name: string, value: string) => ` data-${name}="${escapeHtml(value)}"`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment link · LocalPay</title>
<style>
body{margin:0;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#0F172A;background:#F8FAFC}
.banner{background:#FEF3C7;color:#78350F;font-weight:600;font-size:13px;text-align:center;padding:8px}
main{max-width:420px;margin:40px auto;padding:24px;background:#fff;border:1px solid #E2E8F0;border-radius:12px}
h1{font-size:18px;margin:0 0 4px}.amount{font-size:30px;font-weight:700;margin:12px 0}.muted{color:#475569;font-size:14px}
button{width:100%;font:inherit;font-weight:600;padding:12px;border:0;border-radius:8px;background:#2563EB;color:#fff;cursor:pointer}
button:hover{background:#1D4ED8}#status{min-height:1.5em;margin-top:12px}
</style></head>
<body><div class="banner">TEST MODE · LocalPay · no real money moves</div>
<main id="plink"${attr('id', link.id)}${attr('key', keyId)}${attr('order', link.orderId)}${attr('description', link.description ?? '')}>
<h1>${escapeHtml(link.description ?? 'Payment request')}</h1>
<p class="muted">${link.customer.name ? `For ${escapeHtml(link.customer.name)} · ` : ''}Ref ${escapeHtml(link.referenceId ?? link.id)}</p>
<div class="amount">${escapeHtml(formatAmount(due, link.currency))}</div>
${closed ? `<p role="status">${closed}</p>` : `<button id="pay" type="button">Pay ${escapeHtml(formatAmount(due, link.currency))}</button><p id="status" role="status"></p>`}
<p class="muted">LocalPay is an independent test tool, not affiliated with Razorpay.</p>
</main>
${closed ? '' : '<script src="/v1/checkout.js"></script><script src="/_localpay/checkout/plink.js"></script>'}
</body></html>`;
}

/** Served as a file so the page needs no inline script. */
export const LINK_PAGE_SCRIPT = `(() => {
  const el = document.getElementById('plink');
  const button = document.getElementById('pay');
  const status = document.getElementById('status');
  if (!el || !button) return;
  button.addEventListener('click', () => {
    const rzp = new window.Razorpay({
      key: el.dataset.key,
      order_id: el.dataset.order,
      description: el.dataset.description,
      handler: async (response) => {
        const result = await (await fetch(location.pathname + '/complete', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ razorpay_payment_id: response.razorpay_payment_id }),
        })).json();
        if (result.redirect) { location.href = result.redirect; return; }
        status.textContent = 'Payment received. Link status: ' + result.status;
        button.remove();
      },
    });
    rzp.on('payment.failed', (response) => { status.textContent = 'Payment failed: ' + response.error.description; });
    rzp.open();
  });
})();
`;

export const paymentLinkPages: FastifyPluginCallback<PaymentLinkPageOptions> = (app, { engine, keys }, done) => {
  const keyFor = (link: PaymentLink): ApiKey => {
    const key = keys.find((k) => k.keyId === link.keyId) ?? keys[0];
    if (!key) throw badRequest('LocalPay has no API key configured.');
    return key;
  };
  const html = (reply: FastifyReply, status: number, body: string) =>
    reply.code(status).headers({ 'content-security-policy': PAGE_CSP, 'x-frame-options': 'DENY', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' }).type('text/html; charset=utf-8').send(body);

  app.get('/_localpay/checkout/plink.js', (_request, reply) => reply.type('application/javascript; charset=utf-8').header('cache-control', 'no-store').send(LINK_PAGE_SCRIPT));

  app.get<{ Params: { id: string } }>('/l/:id', (request, reply) => {
    const link = engine.findPaymentLink(request.params.id);
    if (!link) return html(reply, 404, '<!doctype html><title>Not found</title><p>This payment link does not exist.</p>');
    return html(reply, 200, renderLinkPage(link, keyFor(link).keyId));
  });

  app.post<{ Params: { id: string } }>('/l/:id/complete', (request, reply) => {
    try {
      const { razorpay_payment_id: paymentId } = parseWith(z.object({ razorpay_payment_id: z.string() }), request.body);
      const link = engine.getPaymentLink(request.params.id);
      const payment = engine.getPayment(paymentId);
      if (payment.orderId !== link.orderId) throw badRequest('The payment does not belong to this payment link.', { field: 'razorpay_payment_id' });
      const params = callbackParams({ paymentLinkId: link.id, referenceId: link.referenceId, status: link.status, paymentId }, keyFor(link).keySecret);
      const redirect = link.callbackUrl ? `${link.callbackUrl}${link.callbackUrl.includes('?') ? '&' : '?'}${new URLSearchParams(params).toString()}` : null;
      return reply.send({ status: link.status, redirect });
    } catch (error) {
      const apiError = toApiError(error);
      return reply.code(apiError.status).send(apiError.toJSON());
    }
  });

  done();
};
