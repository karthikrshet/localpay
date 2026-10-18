---
title: Payment links and customers
description: Create links, pay them on a hosted test page, and verify the callback.
---

## Payment links

```bash
curl -u rzp_test_LocalPayDemo01:localpay_demo_secret -H 'Content-Type: application/json' \
  -d '{"amount": 50000, "reference_id": "INV-42", "description": "Invoice 42",
       "callback_url": "http://127.0.0.1:3000/paid", "callback_method": "get"}' \
  http://127.0.0.1:4010/v1/payment_links
```

The response's `short_url` (`http://127.0.0.1:4010/l/plink_…`) opens a hosted test page
with a **Pay** button that runs the test checkout. After a successful payment, the browser
is sent to `callback_url` with:

| Parameter | Value |
| --- | --- |
| `razorpay_payment_id` | the payment |
| `razorpay_payment_link_id` | the link |
| `razorpay_payment_link_reference_id` | your `reference_id` (empty if none) |
| `razorpay_payment_link_status` | `paid` or `partially_paid` |
| `razorpay_signature` | HMAC-SHA256 (hex) of `link_id\|reference_id\|status\|payment_id` with your key secret |

Verify it like the checkout signature, in constant time. The link moves to `paid` only when
a payment is **captured**; with auto-capture off, it stays `created` until you capture.

Supported: `accept_partial` (each capture adds to `amount_paid`; the link becomes
`partially_paid`, then `paid`), `expire_by` (the link expires on the scheduler, and time
travel makes it immediate), update with `PATCH`, and `POST /v1/payment_links/:id/cancel`.
Webhooks: `payment_link.paid`, `payment_link.partially_paid`, `payment_link.expired`,
`payment_link.cancelled`. Not supported: UPI links (`upi_link: true`), reminders and
SMS or email sending.

## Customers

`POST /v1/customers`, `GET /v1/customers`, `GET /v1/customers/:id`,
`PUT /v1/customers/:id`. A second customer with the same email and contact fails with
"Customer already exists for the merchant", unless you send `fail_existing: "0"`, which
returns the existing customer.
