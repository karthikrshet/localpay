# Progress
Phase: 2 — Checkout and webhooks — gate passed (browser purchase test, offline)

## Done
- 2026-10-18 Phase 0: skeleton, agent docs, tooling, CI, Node + Python SDK spikes, ADRs 0001–0003
- 2026-10-19 core: seeded random, ids, injectable clock with time travel, money/fees, entities, state machines, event log (memory + JSONL), engine (orders, payments, capture, refunds, tick)
- 2026-10-19 Property tests (fast-check) over random API sequences; found and fixed an overpay bug
- 2026-10-19 provider-razorpay: error envelope, Zod schemas, wire serializers, Basic auth (live keys refused), orders/payments/refunds routes
- 2026-10-19 server: config with loopback/test-key guards, createLocalPay; shim-node with end-to-end SDK tests
- 2026-10-19 Fixture tooling: scrubber, secret check (CI), recorder, contract harness with 12 hand-written fixtures
- 2026-10-19 Phase 2: signatures, webhook format, dispatcher (SSRF guard, retries, replay, fault injection), checkout API + scenarios + magic values, checkout.js (Preact, 9.7 KB gz, axe-clean), server wiring, Express example with Node and Playwright tests

## Next
1. Phase 3: dashboard, CLI (`localpay start --webhook ...` is already referenced by examples/express/README.md), docs site, release setup
2. Phase 4: customers, payment links, scenario engine, Docker, GitHub Action
3. Replace hand-written fixtures with recorded ones (maintainer)

## Blockers
- Phase 1 gate ("all recorded fixtures pass") needs real recordings from the maintainer's test account: run `pnpm record-fixtures fixtures/requests/core.json` with RZP_KEY_ID/RZP_KEY_SECRET, then scrub and review
- npm scope @localpay must be registered by the maintainer; unscoped `localpay` was free on 2026-10-18
- PHP, Java, Go SDK base-URL override: unchecked
