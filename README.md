# LocalPay

**Test your Razorpay integration offline. No keys, no ngrok, every edge case one click away.**

[![CI](https://github.com/localpay/localpay/actions/workflows/ci.yml/badge.svg)](https://github.com/localpay/localpay/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/localpay)](https://www.npmjs.com/package/localpay)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

LocalPay is a free, open-source server that behaves like the Razorpay API on your own
machine: orders, payments, captures, refunds, a checkout popup and signed webhooks, with
no account, no keys and no tunnels.

<img src="docs/assets/checkout.png" alt="The LocalPay checkout popup with a TEST MODE banner and scenario buttons" width="720">

## Quickstart

```bash
npx localpay --webhook http://127.0.0.1:3000/webhooks
```

Then change one line in your server and one script tag in your page:

```js
// Node: the SDK has no host option, so use the tiny shim
import { pointAtLocalPay } from '@localpay/shim-node';
pointAtLocalPay(razorpay, 'http://127.0.0.1:4010');
```

```python
# Python: the SDK has an official option
client = razorpay.Client(auth=(key_id, key_secret), base_url="http://127.0.0.1:4010")
```

```html
<script src="http://127.0.0.1:4010/v1/checkout.js"></script>
```

Use the demo key `rzp_test_LocalPayDemo01` / `localpay_demo_secret` printed at start-up.
The [quickstart](docs/site/src/content/docs/quickstart.md) walks through a whole payment.

## Why

| | Razorpay test mode | LocalPay |
| --- | --- | --- |
| Account and keys | Needed | Not needed |
| Internet | Needed | Not needed |
| Webhooks to localhost | Needs ngrok | Direct |
| UPI timeout, bank down, authorize-only | Hard to trigger | One button each |
| Duplicate / out-of-order webhooks | Not on demand | Built in |
| Fast-forward days | No | `localpay time advance 3d` |
| CI without secrets | No | Yes |

## Features

- **REST API** — orders, payments, capture, refunds, notes, list pagination, the error
  envelope and test-key-only auth. [Compatibility matrix](docs/compat.md)
- **Checkout** — `new Razorpay(options).open()` with scenario buttons instead of a card
  form; `handler`, `payment.failed`, `ondismiss`, `callback_url`. [Guide](docs/site/src/content/docs/guides/checkout.md)
- **Signatures** — checkout and webhook HMACs, verified the way your app should verify them.
- **Webhooks** — signed deliveries, retries, replay, send-twice, and fault injection for
  duplicates, reordering, delays and missing signatures. [Guide](docs/site/src/content/docs/guides/webhooks.md)
- **Dashboard** — orders, payments, event timelines, the webhook log with replay, time
  travel and settings.
- **Deterministic** — seeded ids, an injectable clock and an event log you can persist.
- **Magic values** — `failure@razorpay`, or amounts ending in paise `13` to force a bank
  timeout. [Table](docs/site/src/content/docs/guides/test-values.md)

<img src="docs/assets/dashboard-webhooks.png" alt="The LocalPay dashboard's webhook log with a delivery expanded" width="720">

## Status

Pre-1.0. Behaviour is modelled on Razorpay's public API, and the compatibility matrix
marks everything **partial** until contract tests replay responses recorded from a real
test account. Run your integration against Razorpay's real test mode before going live.

## Disclaimer

LocalPay is an independent open-source project. It is **not affiliated with, endorsed by
or sponsored by Razorpay**. "Razorpay" is used only to describe API compatibility.
LocalPay never moves money and must never be used in production.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md). Security reports:
[SECURITY.md](SECURITY.md). Code of conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
New here? Start with [docs/good-first-issues.md](docs/good-first-issues.md).

## License

[Apache-2.0](LICENSE)
