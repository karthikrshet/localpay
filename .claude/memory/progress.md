# Progress
Phase: 6 — Ecosystem — provider plug-in API done. All phases are code-complete; the
remaining gates and launch steps need the maintainer (see Blockers).

## Done
- 2026-10-18 Phase 0: skeleton, agent docs, tooling, CI, Node + Python SDK spikes, ADRs 0001–0003
- 2026-10-19 Phase 1: core engine (ids, clock, event log, state machines, orders/payments/refunds), Razorpay API, auth, Node shim, fixture tooling, contract harness, property tests
- 2026-10-19 Phase 2: signatures, webhook dispatcher (SSRF guard, retries, replay, faults), checkout API + checkout.js, Express example, offline browser gate
- 2026-10-19 Phase 3: dashboard (light, blue #2563EB) behind token + CSRF + CSP, CLI, bundled `localpay` package + smoke test, Starlight docs, Changesets + release workflow, README with screenshots
- 2026-10-19 Phase 4: customers, payment links (hosted page, signed callback), YAML scenarios + gallery, Docker image, GitHub Action, nightly SDK/drift CI, FastAPI example
- 2026-10-19 Phase 5: plans/subscriptions with clock-driven renewals, disputes, T+N settlements, record-and-replay, dashboard screens for all of them
- 2026-10-20 Phase 6: provider plug-in contract (ADR 0004) with Razorpay as the first plug-in
- 2026-10-20 Extras: late authorization, API fault injection (429/500/latency), redacted request log (--log), Django and Next.js examples, billing property tests
- 2026-10-20 Quality gates: 90% coverage gate (core + provider at 98.7% lines), axe on every dashboard screen, checkout under a strict CSP, OpenSSF Scorecard, Renovate, docs published to GitHub Pages
- 2026-10-20 Verified locally: lint, typecheck, 507 unit/contract tests, coverage gate, 6 Playwright tests, package smoke test (7 checks), secret scan, docs build (18 pages), Python SDK spike, FastAPI/Django/Next.js example tests; all 200 commit messages pass scripts/check-commit-msg.ts
- 2026-10-20 README rewritten to explain the whole repo; 23s README video (docs/assets/localpay-demo.mp4 + GIF preview + poster) with music and sound effects, rebuilt by scripts/render-video.ts

## Next
1. Pushed to github.com/karthikrshet/localpay; all repo URLs point there (the npm scope is still @localpay). Check CI (Docker, Action, docs, examples jobs have only run locally or not at all)
2. Maintainer: record fixtures with `pnpm record-fixtures fixtures/requests/core.json` from your own test account, scrub, review, replace the hand-written stand-ins
3. Maintainer: register the npm scope, add NPM_TOKEN, publish v0.1.0 via the release workflow; run the 5-minute friend test

## Blockers
- GitHub settings (maintainer only): enable Pages with source "GitHub Actions"; allow GitHub Actions to create pull requests (Settings → Actions → General) so the Changesets release PR can open
- Phase 1 gate (recorded fixtures pass) needs the maintainer's own Razorpay test account
- Docker image not built locally (Docker Desktop was not running); first real build is the CI docker job
- PHP, Java, Go SDK base-URL override: unchecked (no PHP/Java/Go on the dev machine); Laravel example not written
- CODE_OF_CONDUCT.md still needs a contact address
- Cashfree/PhonePe/PayU providers: by design, led by community co-maintainers (ADR 0004)
