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

## Behaviour

| Behaviour | Status | Notes |
| --- | --- | --- |
| Basic auth with test keys | partial | `rzp_test_` and `lp_test_`; `rzp_live_` always 401 |
| Error envelope | partial | Shape matches; exact descriptions unverified |
| Unknown body fields rejected | partial | "… is/are not required and should not be sent" |
| Empty notes rendered as `[]` | partial | |
| Auto-capture | partial | On by default; per order with `payment_capture` |
| Fees | partial | 2% + 18% tax on the fee, set on capture |
| Capturing a second payment on a paid order | partial | Rejected with `order_already_paid`; real behaviour unverified |

## Webhook events

| Event | Status | Notes |
| --- | --- | --- |
| payment.authorized | missing | Phase 2 |
| payment.captured | missing | Phase 2 |
| payment.failed | missing | Phase 2 |
| order.paid | missing | Phase 2 |
| refund.created | missing | Phase 2 |
| refund.processed | missing | Phase 2 |
| refund.failed | missing | Phase 2 |

## SDK connection

| SDK | Status | How |
| --- | --- | --- |
| Node (razorpay 2.9.8) | supported | No host option; use `@localpay/shim-node`, or set `client.api.rq.defaults.baseURL = 'http://127.0.0.1:4010'`. End-to-end tests in packages/shims. |
| Python (razorpay 2.0.1) | supported | Official option: `razorpay.Client(auth=(...), base_url="http://127.0.0.1:4010")`. Proven by scripts/spike/python.test.ts. |
| PHP | missing | Not checked yet |
| Java | missing | Not checked yet |
| Go | missing | Not checked yet |
