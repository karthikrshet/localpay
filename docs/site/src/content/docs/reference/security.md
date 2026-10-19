---
title: Security model
description: How LocalPay stays safe when people are careless with it.
---

LocalPay never touches real money or real keys, never listens on the internet unless
forced, and can never be mistaken for a real payment page.

| Risk | What LocalPay does |
| --- | --- |
| Exposed on a server | Binds `127.0.0.1` only. A public `--host` needs `--allow-public` **and** a dashboard password, and prints a red warning. Map Docker ports as `127.0.0.1:4010:4010`. |
| Live keys pasted in | Key ids must start `rzp_test_` or `lp_test_`; `rzp_live_` gets a `401` that says why, both at start-up and per request. No request logging, so keys never land in logs. |
| Real card numbers | There is no card form. The checkout only has scenario buttons. |
| Reused as a phishing page | Own name and colours, a permanent "TEST MODE" banner, a "not affiliated" footer, and checkout.js refuses to render outside localhost unless the origin is allowed. |
| Webhook SSRF | Targets must be configured. Metadata, link-local and multicast addresses are blocked at DNS-lookup time; 5 s timeout; redirects are not followed. |
| Dashboard attacks | A random session token printed at start-up becomes an HttpOnly, SameSite=Strict cookie. Every change needs a CSRF token and a same-origin request. Strict Content-Security-Policy, `frame-ancestors 'none'`, and all data rendered as text. |
| Floods and password guessing | Every client gets 6,000 requests a minute (a Razorpay-shaped `429` after that), far above any test suite. The dashboard login allows 10 guesses a minute. |
| Leaky fixtures | Recorded fixtures pass a scrubber, and CI fails on anything that looks like a key, email, phone or card number. |

No telemetry. Report vulnerabilities privately through GitHub's
"Report a vulnerability" button; see `SECURITY.md`.
