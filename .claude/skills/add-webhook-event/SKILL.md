---
name: add-webhook-event
description: Add a new webhook event type (e.g. refund.processed) to LocalPay, from state machine to dashboard.
---
1. Confirm the event name and payload shape from a recorded webhook in fixtures/
   (record one with the record-fixture skill if none exists). Never from memory.
2. Define the event type in core/events: name, which entities it contains, and
   the state transition that produces it.
3. Emit it from the state machine in core at the transition, before any side
   effect. Never emit from a route handler.
4. Map it to the wire envelope in provider-razorpay (entity "event", account_id,
   event, contains, payload.<entity>.entity, created_at from core/clock).
5. Tests:
   - envelope test: the built body matches the recorded fixture field for field;
   - signature test: X-Razorpay-Signature equals HMAC-SHA256(raw body, webhook
     secret), hex, and verification uses constant-time comparison;
   - X-Razorpay-Event-Id is set and stable across retries of the same delivery.
6. Add the event to the dashboard's label map and filter list.
7. Add the event to the "Webhook events" table in docs/compat.md and the docs page.
8. pnpm lint && pnpm test && pnpm test:compat must pass.
9. Add a changeset; update .claude/memory/progress.md.
