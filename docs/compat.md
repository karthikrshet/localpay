# Compatibility matrix

Status of every Razorpay endpoint, field and event in LocalPay: **supported**, **partial** or **missing**.
A row may say supported only when a contract test replays a recorded fixture for it.

## Endpoints

| Endpoint | Status | Notes |
| --- | --- | --- |
| POST /v1/orders | missing | Phase 1 |
| GET /v1/orders/:id | missing | Phase 1 |
| GET /v1/orders | missing | Phase 1 |
| GET /v1/orders/:id/payments | missing | Phase 1 |
| GET /v1/payments/:id | missing | Phase 1 |
| GET /v1/payments | missing | Phase 1 |
| POST /v1/payments/:id/capture | missing | Phase 1 |
| POST /v1/payments/:id/refund | missing | Phase 1 |
| GET /v1/refunds/:id | missing | Phase 1 |

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
| Node (razorpay 2.9.8) | partial | No host option. Set `client.api.rq.defaults.baseURL = 'http://127.0.0.1:4010'` (host only; the SDK adds /v1). Proven by scripts/spike. |
| Python | missing | Not checked yet |
| PHP | missing | Not checked yet |
| Java | missing | Not checked yet |
| Go | missing | Not checked yet |
