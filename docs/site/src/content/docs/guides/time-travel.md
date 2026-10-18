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
