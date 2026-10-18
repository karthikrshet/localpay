# Progress
Phase: 0 — Prove it can work (week 1). Do not start Phase 1 until the Phase 0 gate and the open items below are done.

## Done
- 2026-10-18 Monorepo skeleton per docs/PLAN.md "Repository structure" (9 placeholder packages under packages/)
- 2026-10-18 AGENTS.md, CLAUDE.md, memory files, 5 skills in .claude/skills/
- 2026-10-18 pnpm workspaces, TypeScript 5.9 strict, Vitest, ESLint (with architecture import rules), CI (lint + typecheck + test on Node 22 and 24), CodeQL
- 2026-10-18 LICENSE (Apache-2.0), README, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, GOVERNANCE, issue and PR templates, docs/compat.md
- 2026-10-18 Node SDK spike (scripts/spike): razorpay 2.9.8 creates an order against a local server via `client.api.rq.defaults.baseURL`. **Phase 0 gate for Node: passed** (spike.test.ts runs in CI)

## Next
1. Remaining Phase 0 items: Python SDK spike; ADRs 0001 (Fastify), 0002 (SQLite), 0003 (SDK connection strategy)
2. Maintainer-only: create a Razorpay test account, record ~20 real responses, write scripts/scrub-fixtures and scrub them
3. Check the name "LocalPay" on npm, GitHub and domains; pick the final name

## Blockers
- Python, PHP, Java, Go SDK base-URL override: unchecked
- Fixture recording needs the maintainer's own test account and keys (an agent must not handle them)
- Not yet a GitHub repo, so CI has not run remotely; nothing committed yet
