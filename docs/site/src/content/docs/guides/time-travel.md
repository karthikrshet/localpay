---
title: Time travel
description: Fast-forward the emulator clock.
---

Every timestamp in LocalPay comes from one clock. Moving it forward runs everything that
was scheduled in between, such as processing pending refunds.

```bash
npx localpay time advance 3d     # also 45s, 30m, 2h, 1w, 1d12h
npx localpay time                # show emulator time
```

The **Time** screen in the dashboard does the same. Time only moves forward, so the event
log always stays in order.

Normal-speed refunds stay `pending` for `--refund-delay` seconds (5 by default) before
`refund.processed` fires. Start with `--refund-delay 432000` to make them take five days,
then use time travel to get there instantly.

## What runs on the clock

| What | When |
| --- | --- |
| Pending refunds → `refund.processed` | after `--refund-delay` seconds |
| Payment links → `payment_link.expired` | at `expire_by` |
| Subscription renewals and retries | at each `charge_at` |
| Open disputes → `payment.dispute.lost` | at `respond_by` |
| Settlements → `settlement.processed` | `--settlement-days` (default 2) after capture |

Settlements pay out captured amounts minus fees, less processed refunds and lost disputes
that were not settled before, with a 16-character UTR. `GET /v1/settlements` lists them.
