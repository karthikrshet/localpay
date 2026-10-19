---
title: Scenarios
description: Script whole payment stories in YAML and run them in CI.
---

A scenario is a YAML file of steps plus expectations. Run it against a running LocalPay:

```bash
npx localpay scenario run checkout-flaky.yaml    # exit code 1 if it fails
npx localpay scenario run 08-busy-day            # a gallery scenario
npx localpay scenario list
```

or from the **Scenarios** screen in the dashboard. Scenarios create real orders and
payments in that server and send webhooks to your targets, so they exercise your app.

```yaml
name: A busy day with flaky webhooks
seed: busy-day            # same seed, same outcomes
steps:
  - webhook_faults: { duplicate: 0.2, out_of_order: 0.2 }
  - repeat:
      times: 10
      steps:
        - order: { amount: 39900 }
        - pay: { order: last, outcomes: { success: 0.7, upi_timeout: 0.3 } }
expect:
  orders: { paid: 7, attempted: 3 }
```

## Steps

| Step | Fields |
| --- | --- |
| `order` | `amount` (paise), `currency`, `receipt`, `notes`, `partial`, `auto_capture`, `as` |
| `pay` | `order` or `link`, `method` (`upi` default, `card`, `netbanking`, `wallet`), `scenario` **or** weighted `outcomes`, `amount`, `vpa`, `as` |
| `capture` | `payment` |
| `refund` | `payment`, `amount`, `speed` (`normal`, `optimum`), `as` |
| `process_refund` / `fail_refund` | `refund` |
| `link` | `amount`, `reference_id`, `description`, `accept_partial`, `expire_in` (e.g. `1d`), `as` |
| `cancel_link` | `link` |
| `customer` | `name`, `email`, `contact`, `as` |
| `plan` | `name`, `amount`, `period` (`daily`, `weekly`, `monthly`, `yearly`), `interval`, `as` |
| `subscription` | `plan`, `total_count`, `quantity`, `start_in` (e.g. `1d`), `as` |
| `authenticate` | `subscription`, `scenario` (default `success`), `method` (default `card`) |
| `cancel_subscription` | `subscription`, `at_cycle_end` |
| `dispute` | `payment`, `amount`, `reason`, `respond_in_days`, `as` (raised as the bank would) |
| `accept_dispute` | `dispute` |
| `contest_dispute` | `dispute`, `summary`, `submit` (default true) |
| `resolve_dispute` | `dispute`, `outcome` (`won`, `lost`) |
| `advance` | a duration: `30s`, `2h`, `3d`, `1w` |
| `webhook_faults` | `duplicate`, `out_of_order`, `unsigned` (0–1), `delay` (ms) |
| `repeat` | `times`, `steps` |

`as` names an entity; later steps refer to it by that name or by `last`. Payment
scenarios are the checkout buttons: `success`, `insufficient_funds`, `bank_down`,
`upi_timeout`, `authorize_only`. [Magic values](/guides/test-values/) still apply.

## Expectations

| Key | Meaning |
| --- | --- |
| `events` | the exact sequence of event types the run produced |
| `events_include` | these event types, in this order, with others allowed in between |
| `orders`, `payments`, `refunds`, `payment_links`, `subscriptions`, `disputes` | counts by status, for entities this run created |

A run stops at the first step LocalPay rejects (for example, paying a paid order) and
reports why.

## Gallery

| Id | Situation |
| --- | --- |
| `01-happy-path` | Order paid by UPI and captured at once |
| `02-upi-timeout-then-retry` | First UPI request expires, the retry succeeds |
| `03-authorize-without-capture` | Payment authorized only; the server captures it |
| `04-partial-then-full-refund` | Two refunds turn the payment fully refunded |
| `05-refund-fails` | A refund fails at the bank |
| `06-insufficient-funds` | Every card attempt is declined |
| `07-bank-down-switch-method` | Netbanking fails, UPI succeeds |
| `08-busy-day` | Ten orders, about 30% timeouts, duplicate and reordered webhooks |
| `09-payment-link-paid-in-parts` | An invoice link paid in two parts |
| `10-payment-link-expires` | A link expires unpaid after time travel |
| `11-subscription-renewals` | A three-month subscription renews to completion |
| `12-subscription-halts` | Renewals fail until the subscription halts |
| `13-dispute-won` | A chargeback contested with evidence and won |
| `14-dispute-deadline-missed` | A chargeback lost by missing respond_by |
