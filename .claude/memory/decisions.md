# Decisions

One line per decision: date · decision · why · ADR (if any). Newest last.
Do not re-argue a decision here; write a new ADR that supersedes it.

- 2026-10-18 · Build plan adopted (docs/PLAN.md) · single source for scope and phases · —
- 2026-10-18 · License Apache-2.0, DCO sign-off, no CLA · patent grant, low contributor friction · —
- 2026-10-18 · pnpm workspaces; Turborepo deferred until packages have build steps · nothing to cache yet · —
- 2026-10-18 · TypeScript pinned to ~5.9 (not 7.x) · typescript-eslint 8 supports TS < 6.1 · —
- 2026-10-18 · Node 22+ instead of the plan's Node 20 · Node 20 reached end-of-life in April 2026 · —
- 2026-10-18 · Erasable-only TS, .ts relative imports · scripts run under Node type stripping without a build step · —
- 2026-10-18 · Dependency direction enforced with ESLint no-restricted-imports for now · cheap; dependency-cruiser can follow · —
- 2026-10-18 · Node SDK connects by overriding `client.api.rq.defaults.baseURL` (host only, no /v1); ship it as a shim · SDK hard-codes the host · ADR 0003
- 2026-10-18 · Fastify 5 for HTTP; Zod for request validation · inject() tests, encapsulated plugins · ADR 0001
- 2026-10-18 · Event log is the store (in-memory, --persist appends JSONL); SQLite deferred · no native deps for npx/distroless · ADR 0002
- 2026-10-19 · Core entities are camelCase domain objects; only provider-razorpay knows wire field names · keeps providers pluggable · —
- 2026-10-19 · Events carry full entity snapshots; state = fold(events) · replay, persistence and webhooks need no lookups · ADR 0002
- 2026-10-19 · Scheduled work (refund processing) is derived from state in tick(), not timers · survives restarts and time travel · —
- 2026-10-19 · Node shim package is @localpay/shim-node (no "razorpay" in package names) · trademark rule · ADR 0003
- 2026-10-19 · Contract fixtures: hand-written stand-ins until the maintainer records real ones; hand-written are shape-checked only · honest compat status · —
- 2026-10-19 · Demo key rzp_test_LocalPayDemo01 / localpay_demo_secret is public on purpose · zero-config start; only works against LocalPay · —
- 2026-10-19 · UI palette: primary is blue #2563EB (hover #1D4ED8) on a light-only white theme, replacing the plan's teal and dark mode · maintainer's request; still distinct from Razorpay's navy/sky blue · —
- 2026-10-19 · Providers are plug-ins: core defines Provider (register routes + webhookFormat + isTestKeyId); createLocalPay takes one, Razorpay by default · Phase 6 multi-gateway without touching core · ADR 0004
