# Contributing to LocalPay

Thanks for helping. LocalPay is early (Phase 0), so the most useful contribution right
now is opening issues about the Razorpay behaviour you rely on.

## Setup

Requires Node 22+ and pnpm (the version is pinned in package.json).

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
git config core.hooksPath .githooks   # checks commit messages locally
```

## Rules

Read [AGENTS.md](AGENTS.md). It is the rulebook for humans and AI coding agents alike:
architecture rules, conventions and the never-do list.

## Pull requests

- One change per PR, with tests. Update docs/compat.md if you touch an endpoint, field or event.
- Conventional Commits (`feat:`, `fix:`, `docs:` ...). CI rejects PRs whose commits do not match;
  scripts/check-commit-msg.ts has the exact rules.
- Sign off every commit (Developer Certificate of Origin): `git commit -s`. There is no CLA.
- Never paste text from Razorpay's documentation, and never commit real keys or customer data.

Every issue and PR gets a first response within 48 hours.
