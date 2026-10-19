---
title: Quickstart
description: From zero to a captured test payment in five minutes.
---

You need Node.js 22 or newer.

## 1. Start LocalPay

```bash
npx localpay --webhook http://127.0.0.1:3000/webhooks
```

It prints the API URL, a demo key pair and a dashboard link:

```text
● LocalPay — test mode, no real money moves

  API        http://127.0.0.1:4010/v1
  Checkout   http://127.0.0.1:4010/v1/checkout.js
  Dashboard  http://127.0.0.1:4010/?token=…
  Key        rzp_test_LocalPayDemo01  secret localpay_demo_secret
  Webhook    http://127.0.0.1:3000/webhooks  all events
```

The dashboard link contains a one-time session token. Open that exact link.

## 2. Point your server at it

**Node** — the SDK has no host option, so use the tiny shim:

```js
import Razorpay from 'razorpay';
import { pointAtLocalPay } from '@localpay/shim-node';

const razorpay = new Razorpay({ key_id: 'rzp_test_LocalPayDemo01', key_secret: 'localpay_demo_secret' });
if (process.env.LOCALPAY_URL) pointAtLocalPay(razorpay, process.env.LOCALPAY_URL);

const order = await razorpay.orders.create({ amount: 49900, currency: 'INR', receipt: 'order-1' });
```

**Python** — the SDK has an official option:

```python
client = razorpay.Client(auth=("rzp_test_LocalPayDemo01", "localpay_demo_secret"), base_url="http://127.0.0.1:4010")
```

Other languages: see [SDK setup](../guides/sdk-setup/).

## 3. Swap the checkout script

```html
<!-- before -->
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<!-- after -->
<script src="http://127.0.0.1:4010/v1/checkout.js"></script>
```

Your `new Razorpay(options).open()` code stays the same. Press **Pay successfully** and
your `handler` receives `razorpay_payment_id`, `razorpay_order_id` and `razorpay_signature`.

## 4. Watch the webhooks

`payment.authorized`, `payment.captured` and `order.paid` arrive at your webhook URL,
signed with `X-Razorpay-Signature` (secret `localpay_webhook_secret` unless you pass
`--webhook-secret`). The **Webhooks** screen in the dashboard shows every delivery and can
replay it.

A complete example app lives in
[`examples/express`](https://github.com/karthikrshet/localpay/tree/main/examples/express).
