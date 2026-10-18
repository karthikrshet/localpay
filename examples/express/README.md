# Express example

A one-file shop (`server.js`) that takes test payments through LocalPay.

```bash
npx localpay --webhook http://127.0.0.1:3000/webhooks   # terminal 1
LOCALPAY_URL=http://127.0.0.1:4010 pnpm start            # terminal 2
```

Open http://127.0.0.1:3000, press **Buy**, then pick a scenario in the checkout popup.

What it shows:

- Orders are created on the server; the browser never decides the amount.
- The checkout signature is verified with a constant-time comparison.
- Webhooks are verified over the **raw** body and de-duplicated by `X-Razorpay-Event-Id`.
- Goods are released only on `payment.captured` / `order.paid`. `payment.authorized`
  means the money is blocked, not received; try the **Authorize only** scenario.

Unset `LOCALPAY_URL` and set `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` /
`RAZORPAY_WEBHOOK_SECRET` to run the same code against Razorpay test mode.
