---
title: SDK setup
description: The one line to change for each official SDK.
---

The SDKs add `/v1` to every path themselves, so the base URL is the **host only**:
`http://127.0.0.1:4010`. Using `…/v1` would produce `/v1/v1/orders`.

## Node.js (`razorpay`)

The Node SDK hard-codes its host and has no option to change it. `@localpay/shim-node`
sets the base URL on the SDK's HTTP client and turns "server not running" into a clear
error.

```bash
npm install --save-dev @localpay/shim-node
```

```js
import Razorpay from 'razorpay';
import { pointAtLocalPay } from '@localpay/shim-node';

export const razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
if (process.env.LOCALPAY_URL) pointAtLocalPay(razorpay, process.env.LOCALPAY_URL);
```

Without the shim, the same effect is one line, but it relies on an undocumented property
of the SDK:

```js
razorpay.api.rq.defaults.baseURL = 'http://127.0.0.1:4010';
```

Verified with `razorpay` 2.9.8.

## Python (`razorpay`)

The Python SDK has an official `base_url` option:

```python
import os, razorpay

client = razorpay.Client(
    auth=(os.environ["RAZORPAY_KEY_ID"], os.environ["RAZORPAY_KEY_SECRET"]),
    base_url=os.environ.get("LOCALPAY_URL", "https://api.razorpay.com"),
)
```

Verified with `razorpay` 2.0.1.

## PHP, Java, Go

Not verified yet. Until they are, call the REST API directly; every endpoint takes HTTP
Basic auth with `key_id:key_secret`:

```bash
curl -u rzp_test_LocalPayDemo01:localpay_demo_secret \
  -H 'Content-Type: application/json' \
  -d '{"amount": 50000, "currency": "INR"}' \
  http://127.0.0.1:4010/v1/orders
```

## Keys

LocalPay accepts the built-in demo key and any key you pass with `--key id:secret`, as
long as the id starts with `rzp_test_` or `lp_test_`. Keys starting with `rzp_live_` are
always refused with a `401`.
