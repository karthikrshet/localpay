# Glossary

Terms as LocalPay uses them. Add a line when a new term appears.

- **Paise** — 1/100 of a rupee. Every amount is an integer in paise (₹500.00 = 50000).
- **Order** — what the merchant creates server-side before checkout; holds amount, currency, receipt. Status created → attempted → paid.
- **Authorize** — the customer's bank approves and blocks the money. Nothing is settled yet.
- **Capture** — the merchant claims an authorized payment. Only captured payments settle. Shipping goods on `payment.authorized` alone is the classic bug.
- **Refund** — money returned for a captured payment, full or partial; never more than the captured amount.
- **Settlement** — the gateway's payout of captured funds, minus fees and tax, to the merchant's bank, usually T+N days.
- **UTR** — Unique Transaction Reference: the bank-side reference number for a transfer or settlement.
- **Webhook** — a signed HTTP POST from the gateway to the merchant's server when an event happens.
- **Event** — one recorded state change (e.g. `payment.captured`). In LocalPay every change writes an event first.
- **Signature** — HMAC-SHA256 proving a checkout result or webhook came from the gateway. Always compare in constant time.
- **Key id / key secret** — the API credentials. LocalPay accepts only `rzp_test_` or `lp_test_` keys.
- **Scenario** — a YAML script describing orders, outcomes and webhook misbehaviour for LocalPay to play.
- **Fixture** — a scrubbed recording of a real Razorpay test-mode response, used in contract tests.
- **Shim** — a tiny wrapper that builds the official SDK client and points it at LocalPay.
- **Compat matrix** — docs/compat.md: every endpoint, field and event marked supported, partial or missing.
