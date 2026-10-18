---
title: Verifying signatures
description: The checkout signature and how to check it safely.
---

After a successful payment, checkout gives your page three values. Your **server** must
check that `razorpay_signature` is the HMAC-SHA256 (hex) of
`razorpay_order_id + "|" + razorpay_payment_id`, keyed with your key secret.

Always compare in constant time. A plain `===` leaks timing information.

## Node.js

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyCheckout({ razorpay_order_id, razorpay_payment_id, razorpay_signature }, keySecret) {
  const expected = createHmac('sha256', keySecret).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(razorpay_signature));
  return a.length === b.length && timingSafeEqual(a, b);
}
```

## Python

```python
import hashlib, hmac

def verify_checkout(order_id: str, payment_id: str, signature: str, key_secret: str) -> bool:
    expected = hmac.new(key_secret.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
```

## Then what?

A valid signature means the payment was authorized for that order. It does **not** mean
the money is yours: with manual capture, a payment can sit in `authorized` and be released
back to the customer. Release goods on `payment.captured` or `order.paid` webhooks, or after
fetching the payment and seeing `status: "captured"`.
