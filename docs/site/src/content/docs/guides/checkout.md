---
title: Checkout
description: The test checkout popup and the options it honours.
---

Load the script from LocalPay instead of the real CDN:

```html
<script src="http://127.0.0.1:4010/v1/checkout.js"></script>
```

It installs the same `Razorpay` constructor:

```js
const rzp = new Razorpay({
  key: 'rzp_test_LocalPayDemo01',
  order_id: order.id, // required by LocalPay
  name: 'My shop',
  description: 'Test T-shirt',
  prefill: { email: 'customer@example.com', contact: '+919999999999' },
  handler(response) {
    // { razorpay_payment_id, razorpay_order_id, razorpay_signature }
    // Send it to your server and verify the signature there.
  },
  modal: { ondismiss() { /* closed without paying */ } },
});
rzp.on('payment.failed', (response) => console.log(response.error.reason));
rzp.open();
```

## Scenario buttons

There is no card form, so no real card data can be typed into LocalPay. Each button
records the selected method tab (UPI, Card, Netbanking, Wallet) and one outcome:

| Button | What your app sees |
| --- | --- |
| Pay successfully | `handler` called; `payment.authorized`, then `payment.captured` and `order.paid` with auto-capture |
| Fail: insufficient funds | `payment.failed` event in the page and as a webhook, `BAD_REQUEST_ERROR` / `insufficient_funds` |
| Fail: bank down | `payment.failed`, `GATEWAY_ERROR` / `bank_technical_error` |
| UPI timeout | `payment.failed`, reason `payment_timeout` |
| Authorize only (no capture) | `handler` called, but only `payment.authorized`; your server must capture |
| Close without paying | `modal.ondismiss` |

After a failure the popup stays open so the customer can retry, as in the real checkout.

## Supported options

`key`, `order_id`, `amount`, `currency`, `name`, `description`, `prefill` (`email`,
`contact`, `method`, `vpa`), `notes`, `handler`, `modal.ondismiss`, `modal.escape`,
`modal.backdropclose`, `callback_url` with `redirect: true`, and `on('payment.failed')`.
`theme` is accepted but ignored: LocalPay always uses its own colours so it never looks
like a real payment page.

## Where it runs

checkout.js only renders on `localhost`, `127.0.0.1`, `[::1]` and `*.localhost`. To use
another origin (for example `https://shop.test`), start LocalPay with
`--allowed-origin https://shop.test`.

### Pages on other hosts

Chrome's Local Network Access rules can block a page served from a public address (for
example a staging site) from loading `checkout.js` from `127.0.0.1`; Chrome asks the user
for permission or refuses. Serve the page you test from `localhost`, or run LocalPay
where that page can reach it on its own network.

### Strict Content-Security-Policy

checkout.js styles its popup with constructable stylesheets, so it works on pages whose
CSP forbids inline styles. Its own origin must still be allowed in `script-src` and
`connect-src`, for example `script-src 'self' http://127.0.0.1:4010`.
