---
name: add-endpoint
description: Add a Razorpay-compatible REST endpoint to LocalPay end to end.
---
1. Confirm the endpoint's request/response shape from your own test-account
   recording in fixtures/, not from memory.
2. Add the Zod request schema in provider-razorpay/schemas.
3. Add or extend the state machine in core; emit events, never mutate silently.
4. Add the route in provider-razorpay/routes; map errors to the envelope.
5. Write unit tests (happy path + every documented error).
6. Add a contract test replaying the fixture.
7. Update docs/compat.md and the docs site page.
8. pnpm lint && pnpm test && pnpm test:compat must pass.
9. Add a changeset; update .claude/memory/progress.md.
