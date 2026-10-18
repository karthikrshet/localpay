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
- 2026-10-18 · Node SDK connects by overriding `client.api.rq.defaults.baseURL` (host only, no /v1); ship it as a shim · SDK hard-codes the host · ADR 0003 (to write)
- 2026-10-18 · Fastify 5 for HTTP; Zod for request validation · inject() tests, encapsulated plugins · ADR 0001
- 2026-10-18 · Event log is the store (in-memory, --persist appends JSONL); SQLite deferred · no native deps for npx/distroless · ADR 0002
