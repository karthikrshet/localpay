# Progress
Phase: 4 — Daily-driver features — code complete; gate (3 external projects using LocalPay in CI) needs a public release

## Done
- 2026-10-18 Phase 0: skeleton, agent docs, tooling, CI, Node + Python SDK spikes, ADRs 0001–0003
- 2026-10-19 core: seeded random, ids, injectable clock with time travel, money/fees, entities, state machines, event log (memory + JSONL), engine (orders, payments, capture, refunds, tick)
- 2026-10-19 Property tests (fast-check) over random API sequences; found and fixed an overpay bug
- 2026-10-19 provider-razorpay: error envelope, Zod schemas, wire serializers, Basic auth (live keys refused), orders/payments/refunds routes
- 2026-10-19 server: config with loopback/test-key guards, createLocalPay; shim-node with end-to-end SDK tests
- 2026-10-19 Fixture tooling: scrubber, secret check (CI), recorder, contract harness with 12 hand-written fixtures
- 2026-10-19 Phase 2: signatures, webhook format, dispatcher (SSRF guard, retries, replay, fault injection), checkout API + scenarios + magic values, checkout.js (Preact, 9.7 KB gz, axe-clean), server wiring, Express example with Node and Playwright tests
- 2026-10-19 Phase 3: admin API (session token cookie, CSRF, CSP), React dashboard (light, blue #2563EB), CLI (start/status/reset/time), bundled `localpay` package + smoke test, Starlight docs, Changesets + release workflow, README with screenshots, 10 good first issues, dashboard browser test
- 2026-10-19 Phase 4: customers, payment links (+ hosted page, callback signature, webhooks), YAML scenario engine + 10-scenario gallery (CLI, API, dashboard), container-safe CLI, Dockerfile (CI-tested; not built locally), GitHub Action (simulated locally), nightly SDK + upstream drift workflow, FastAPI example

## Next
1. Phase 5: subscriptions and plans, disputes, settlements, record-and-replay
2. Examples still missing: Next.js, Django, Laravel (no PHP on the dev machine); PHP/Java/Go SDK spikes
3. Maintainer: create the GitHub repo (URLs assume github.com/localpay/localpay), NPM_TOKEN secret, publish v0.1.0, record fixtures, the README GIF, the 5-minute friend test

## Blockers
- Phase 1 gate ("all recorded fixtures pass") needs real recordings from the maintainer's test account: run `pnpm record-fixtures fixtures/requests/core.json` with RZP_KEY_ID/RZP_KEY_SECRET, then scrub and review
- npm scope @localpay must be registered by the maintainer; unscoped `localpay` was free on 2026-10-18
- PHP, Java, Go SDK base-URL override: unchecked
