---
title: Subscriptions
description: Plans, subscriptions, renewals and failures, driven by LocalPay's clock.
---

```bash
# a monthly plan
curl -u rzp_test_LocalPayDemo01:localpay_demo_secret -H 'Content-Type: application/json' \
  -d '{"period":"monthly","interval":1,"item":{"name":"Pro","amount":49900}}' \
  http://127.0.0.1:4010/v1/plans
# a 12-payment subscription on it
curl -u rzp_test_LocalPayDemo01:localpay_demo_secret -H 'Content-Type: application/json' \
  -d '{"plan_id":"plan_…","total_count":12}' \
  http://127.0.0.1:4010/v1/subscriptions
```

The customer authorizes it in checkout with `subscription_id` (or on the hosted page at
the subscription's `short_url`):

```js
new Razorpay({ key, subscription_id: sub.id, handler(response) {
  // { razorpay_payment_id, razorpay_subscription_id, razorpay_signature }
} }).open();
```

Verify `razorpay_signature` as HMAC-SHA256 (hex) of
`razorpay_payment_id + "|" + razorpay_subscription_id` with your key secret.

## Lifecycle

| Situation | What happens |
| --- | --- |
| No `start_at` | The first cycle is charged at checkout: `subscription.authenticated`, `subscription.activated`, `subscription.charged` |
| Future `start_at` | A ₹1 authorization records the mandate and is released at once (`subscription.authenticated`); the first charge happens at `start_at` |
| Renewal due | Charged on the scheduler: `subscription.charged` with the payment |
| Renewal declined | `subscription.pending`, retried daily |
| Third decline in a row | `subscription.halted`; no more retries |
| Last cycle paid | `subscription.completed` |
| `POST /v1/subscriptions/:id/cancel` | `subscription.cancelled` now, or with `cancel_at_cycle_end: 1` at the next charge time |

Renewals follow the emulator clock, so time travel runs them: a monthly plan advanced by
`95d` is charged three more times. Retries are scheduled from the missed charge, so one
long jump runs every retry that would have happened.

To make renewals fail, use a plan amount whose paise end in `13` (for example ₹199.13).

## Not supported yet

Add-ons, offers, plan or quantity updates, pausing and resuming, and UPI AutoPay specifics.
