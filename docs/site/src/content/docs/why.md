---
title: Why LocalPay
description: What LocalPay gives you that test mode alone does not.
---

| | Razorpay test mode | LocalPay |
| --- | --- | --- |
| Account and keys needed | Yes | No (demo key built in) |
| Internet needed | Yes | No |
| Webhooks to `localhost` | Needs a tunnel such as ngrok | Direct |
| UPI timeout, bank down, authorize-only | Hard to trigger | One button each |
| Duplicate or out-of-order webhooks | Not on demand | Built-in fault injection |
| Fast-forward days (refunds, settlements) | No | `localpay time advance 3d` |
| CI without secrets | No | Yes |

## What it is not

- **Not a payment gateway.** It never moves money and never talks to a bank or NPCI.
- **Not a production proxy.** It binds to `127.0.0.1` and refuses public addresses unless forced.
- **Not a replacement for test mode.** Run your integration against Razorpay's real test
  mode before going live. LocalPay's [compatibility matrix](../reference/compatibility/)
  says exactly what has been checked.
- **Not a clone of Razorpay's brand.** Its own name, colours and a permanent test-mode
  banner make it impossible to mistake for the real thing.
