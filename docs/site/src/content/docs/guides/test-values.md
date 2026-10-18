---
title: Magic test values
description: Inputs that force an outcome, whichever button is pressed.
---

Magic values win over the scenario button the customer presses, so automated tests can
force an outcome without a browser.

| Input | Outcome | Origin |
| --- | --- | --- |
| UPI with VPA `success@razorpay` | Success | Razorpay test mode |
| UPI with VPA `failure@razorpay` | Fails with `insufficient_funds` | Razorpay test mode |
| Order amount whose paise end in `13` (₹100.13, ₹2,499.13) | Fails with `GATEWAY_ERROR` / `bank_timeout` | LocalPay only |

Values marked "Razorpay test mode" behave the same in real test mode, so tests written
against LocalPay keep working there. LocalPay-only values do not.

## Without a browser

The checkout popup calls one endpoint, which tests can call directly:

```bash
curl -X POST http://127.0.0.1:4010/_localpay/checkout/pay \
  -H 'Content-Type: application/json' \
  -d '{"key_id":"rzp_test_LocalPayDemo01","order_id":"order_…","method":"upi","scenario":"success"}'
```

`scenario` is one of `success`, `insufficient_funds`, `bank_down`, `upi_timeout`,
`authorize_only`. The response is exactly what checkout's `handler` would receive, or an
`error` object like checkout's `payment.failed` event.
