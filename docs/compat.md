# Compatibility matrix

Status of every Razorpay endpoint, field and event in LocalPay.

- **supported** — implemented, and a contract test replays a *recorded* fixture for it.
- **partial** — implemented and tested, but not yet checked against a real recording,
  or some fields/parameters are missing (see notes).
- **missing** — not implemented.

No fixture has been recorded from a real test account yet (see `fixtures/requests/core.json`
and the record-fixture skill), so nothing below is marked supported.

## Endpoints

| Endpoint | Status | Notes |
| --- | --- | --- |
| POST /v1/orders | partial | `first_payment_min_amount` is accepted but not enforced |
| GET /v1/orders/:id | partial | |
| GET /v1/orders | partial | `count`, `skip`, `from`, `to`, `receipt`, `authorized`; `expand[]` ignored |
| PATCH /v1/orders/:id | partial | notes only |
| GET /v1/orders/:id/payments | partial | |
| GET /v1/payments/:id | partial | `expand[]` (card, emi) not supported |
| GET /v1/payments | partial | |
| PATCH /v1/payments/:id | partial | notes only |
| POST /v1/payments/:id/capture | partial | |
| POST /v1/payments/:id/refund | partial | `speed: optimum` is reported as `instant` when processed |
| GET /v1/payments/:id/refunds | partial | |
| GET /v1/payments/:id/refunds/:refund_id | partial | |
| GET /v1/refunds | partial | |
| GET /v1/refunds/:id | partial | |
| PATCH /v1/refunds/:id | partial | notes only |
| POST /v1/customers | partial | `fail_existing` supported; duplicates match on email + contact |
| GET /v1/customers/:id | partial | |
| GET /v1/customers | partial | |
| PUT /v1/customers/:id | partial | |
| POST /v1/payment_links | partial | Hosted page at `short_url`; no UPI links, reminders or notifications |
| GET /v1/payment_links/:id | partial | |
| GET /v1/payment_links | partial | Returns `{ payment_links: [...] }`; filters `payment_id`, `reference_id` |
| PATCH /v1/payment_links/:id | partial | `reference_id`, `expire_by`, `notes`, `accept_partial` |
| POST /v1/payment_links/:id/cancel | partial | |
| POST /v1/plans | partial | |
| GET /v1/plans/:id, GET /v1/plans | partial | Item id is derived from the plan id |
| POST /v1/subscriptions | partial | No add-ons or offers |
| GET /v1/subscriptions/:id, GET /v1/subscriptions | partial | `plan_id` filter |
| POST /v1/subscriptions/:id/cancel | partial | `cancel_at_cycle_end` supported |
| PATCH /v1/subscriptions/:id, pause, resume | missing | |
| GET /v1/disputes, GET /v1/disputes/:id | partial | Disputes are raised from the dashboard, the dashboard API or scenarios |
| POST /v1/disputes/:id/accept | partial | |
| GET /v1/settlements, GET /v1/settlements/:id | partial | One settlement per scheduler tick with everything due; no recon or on-demand settlements |
| PATCH /v1/disputes/:id/contest | partial | `draft` / `submit`; evidence documents are ids only, no uploads |

## Behaviour

| Behaviour | Status | Notes |
| --- | --- | --- |
| Basic auth with test keys | partial | `rzp_test_` and `lp_test_`; `rzp_live_` always 401 |
| Error envelope | partial | Shape matches; exact descriptions unverified |
| 429 rate limiting | partial | Only on demand via `--fault rate-limit=…`; real limits are not emulated |
| Unknown body fields rejected | partial | "… is/are not required and should not be sent" |
| Empty notes rendered as `[]` | partial | |
| Auto-capture | partial | On by default; per order with `payment_capture` |
| Fees | partial | 2% + 18% tax on the fee, set on capture |
| Late authorization (failed → authorized) | partial | Triggered from the dashboard, the dashboard API or a scenario; captured only if the order is still due |
| Capturing a second payment on a paid order | partial | Rejected with `order_already_paid`; real behaviour unverified |
| Checkout `new Razorpay(options).open()` | partial | `handler`, `on('payment.failed')`, `modal.ondismiss`, `modal.escape`, `callback_url` + `redirect`; no card form; `theme` ignored |
| Checkout signature `order_id\|payment_id` | partial | HMAC-SHA256 hex with the key secret |
| Webhook retries | partial | 5 attempts: now, +5s, +30s, +2m, +10m (real gateway retries for longer) |
| Test UPI IDs `success@razorpay` / `failure@razorpay` | partial | Force success / insufficient funds |
| Subscription checkout signature | partial | HMAC of `payment_id\|subscription_id` |
| Payment link callback signature | partial | HMAC of `link_id\|reference_id\|status\|payment_id`; unverified against a recording |

## Webhook events

| Event | Status | Notes |
| --- | --- | --- |
| payment.authorized | partial | Signed with X-Razorpay-Signature; X-Razorpay-Event-Id set |
| payment.captured | partial | Signed with X-Razorpay-Signature; X-Razorpay-Event-Id set |
| payment.failed | partial | Signed with X-Razorpay-Signature; X-Razorpay-Event-Id set |
| order.paid | partial | Signed with X-Razorpay-Signature; X-Razorpay-Event-Id set |
| refund.created | partial | Signed with X-Razorpay-Signature; X-Razorpay-Event-Id set |
| refund.processed | partial | Signed with X-Razorpay-Signature; X-Razorpay-Event-Id set |
| refund.failed | partial | Signed with X-Razorpay-Signature; X-Razorpay-Event-Id set |
| payment_link.paid | partial | Contains payment_link, payment, order |
| payment_link.partially_paid | partial | Contains payment_link, payment, order |
| payment_link.expired | partial | |
| payment_link.cancelled | partial | |
| payment.dispute.created / under_review / won / lost | partial | Contains payment and dispute |
| settlement.processed | partial | |
| subscription.authenticated / activated / charged / pending / halted / cancelled / completed / updated | partial | `charged` contains subscription and payment |

## SDK connection

| SDK | Status | How |
| --- | --- | --- |
| Node (razorpay 2.9.8) | supported | No host option; use `@localpay/shim-node`, or set `client.api.rq.defaults.baseURL = 'http://127.0.0.1:4010'`. End-to-end tests in packages/shims. |
| Python (razorpay 2.0.1) | supported | Official option: `razorpay.Client(auth=(...), base_url="http://127.0.0.1:4010")`. Proven by scripts/spike/python.test.ts. |
| PHP | missing | Not checked yet |
| Java | missing | Not checked yet |
| Go | missing | Not checked yet |
