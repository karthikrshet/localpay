---
title: Webhooks
description: Signed deliveries, retries, replay and fault injection.
---

Add one or more targets when you start LocalPay, or later in **Settings**:

```bash
npx localpay --webhook http://127.0.0.1:3000/webhooks --webhook-secret my_webhook_secret
```

## What is sent

```json
{
  "entity": "event",
  "account_id": "acc_LocalPayDemo01",
  "event": "payment.captured",
  "contains": ["payment"],
  "payload": { "payment": { "entity": { "id": "pay_…", "status": "captured" } } },
  "created_at": 1760800000
}
```

| Header | Meaning |
| --- | --- |
| `X-Razorpay-Signature` | HMAC-SHA256 (hex) of the **raw** body with the webhook secret |
| `X-Razorpay-Event-Id` | Same for every delivery of one event; use it to de-duplicate |

Events: `payment.authorized`, `payment.captured`, `payment.failed`, `order.paid`
(payment + order), `refund.created`, `refund.processed`, `refund.failed` (refund + payment).

## Verifying a webhook (Node.js, Express)

```js
app.post('/webhooks', express.raw({ type: 'application/json' }), (req, res) => {
  const expected = createHmac('sha256', process.env.WEBHOOK_SECRET).update(req.body).digest('hex');
  const given = Buffer.from(req.get('x-razorpay-signature') ?? '');
  if (given.length !== expected.length || !timingSafeEqual(Buffer.from(expected), given)) return res.sendStatus(400);
  if (seen.has(req.get('x-razorpay-event-id'))) return res.sendStatus(200); // duplicate
  seen.add(req.get('x-razorpay-event-id'));
  const event = JSON.parse(req.body);
  // fulfil on payment.captured / order.paid, never on payment.authorized
  res.sendStatus(200);
});
```

Parse the body **after** verifying: re-serialising JSON changes the bytes and breaks the
signature.

## Retries

A delivery succeeds on any `2xx`. Redirects are not followed and count as failures.
Failed deliveries are retried after 5 s, 30 s, 2 min and 10 min, then marked failed.
With `--persist`, the delivery log and pending retries are kept in `<file>.deliveries.json`
and survive restarts.

## Breaking things on purpose

| Flag | Effect |
| --- | --- |
| `--fault duplicate=0.3` | 30% of deliveries are sent twice with the same event id |
| `--fault out-of-order=0.3` | 30% are held back 3 s so later events arrive first |
| `--fault unsigned=0.1` | 10% arrive without `X-Razorpay-Signature` |
| `--fault delay=2000` | every delivery waits 2 s |

### API failures

| Flag | Effect |
| --- | --- |
| `--fault rate-limit=0.1` | 10% of API requests get `429` with reason `rate_limit_exceeded` |
| `--fault server-error=0.05` | 5% get `500 SERVER_ERROR` |
| `--fault api-delay=300` | every API request waits 300 ms |

The fault is decided before the request does anything, so retrying a faulted request is
always safe. Settings in the dashboard change these while LocalPay runs.

The **Webhooks** screen can also replay any delivery, send it twice, or send it without a
signature. Replaying an older delivery is how to test out-of-order handling by hand.

## Safety

Webhook targets must be configured explicitly. Loopback and private networks are allowed;
cloud metadata addresses (`169.254.169.254` and friends), link-local and multicast
addresses are refused, including when a hostname resolves to one. Requests time out after
5 seconds.
