---
title: Writing a provider
description: Add another payment gateway to LocalPay as a plug-in.
---

LocalPay's engine knows orders, payments, refunds, links, subscriptions, disputes and
settlements. A **provider** maps them to one gateway's wire format. Razorpay is the first;
Cashfree, PhonePe and PayU are planned with community maintainers.

```ts
import type { Provider } from '@localpay/core';
import type { FastifyInstance } from 'fastify';

export const cashfreeProvider: Provider<FastifyInstance> = {
  name: 'cashfree',
  // Refuse anything that is not a test credential.
  isTestKeyId: (keyId) => keyId.startsWith('TEST'),
  async register(app, { engine, keys }) {
    // The gateway's REST API: authenticate, validate, call the engine, serialise.
    app.post('/pg/orders', async (request, reply) => {
      const order = engine.createOrder({ amount: /* rupees → paise */ 0 });
      return reply.send({ order_id: order.id /* … the gateway's fields … */ });
    });
  },
  webhookFormat: ({ accountId }) => ({
    events: ['PAYMENT_SUCCESS_WEBHOOK'],
    format: (event) => (event.type === 'payment.captured' ? { name: 'PAYMENT_SUCCESS_WEBHOOK', payload: { /* … */ } } : null),
    headers: (rawBody, secret, eventId) => ({ /* the gateway's signature headers */ }),
  }),
};
```

Run it with `createLocalPay(config, { provider: cashfreeProvider })`.

## Rules

- Depend only on `@localpay/core` inside this repo (add an ESLint import rule like the one
  for `provider-razorpay`).
- Never call the real gateway, and refuse live credentials in `isTestKeyId`.
- Use the engine for every state change; never keep your own copy of entities.
- Map engine errors (`EngineError.reason`) to the gateway's error format in one place.
- Record fixtures from your own sandbox account, scrub them, and add contract tests, as
  the `record-fixture` skill describes.
- Keep the gateway's name and colours out of the UI; LocalPay must never look official.

See ADR 0004 (`docs/adr/0004-provider-plugins.md`) for the design and its current limits.
