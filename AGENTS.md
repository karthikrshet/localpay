# AGENTS.md — LocalPay

LocalPay is a local, offline emulator of the Razorpay API for testing.
It never moves money, never calls Razorpay, and never accepts live keys.

## Before you start
1. Read .claude/memory/progress.md and decisions.md.
2. Check docs/compat.md for the endpoint you are touching.
3. The full build plan is docs/PLAN.md. Do not start a phase until the previous
   phase's gate has passed.

## Commands
- pnpm install · pnpm lint · pnpm typecheck · pnpm test
- pnpm test:compat — contract tests: replay fixtures/requests/core.json against LocalPay
- pnpm check-secrets · pnpm scrub-fixtures <path> · pnpm record-fixtures <spec> (maintainer only)
- pnpm spike — Phase 0 SDK base-URL spike (scripts/spike)
- Not wired yet: pnpm dev · pnpm build

## Architecture rules
- packages/core has zero imports from other packages.
- Wire format lives only in packages/provider-razorpay.
- All time comes from core/clock; never call Date.now() directly.
- All IDs come from core/ids; never generate IDs inline.
- Every state change emits an event through core/events first (engine `emit()`).
- Events carry full snapshots of every entity they change; state is a fold of the log.
- Time-driven work (pending refunds, renewals) is derived from state in `tick()`,
  never from in-memory timers, so it survives restarts and time travel.
- The import and Date.now() rules are enforced by ESLint (eslint.config.js).

## Conventions
- TypeScript strict, no `any`. Zod schema for every request body.
- Amounts are integers in paise. Never use floats for money.
- Errors use the Razorpay error envelope via provider-razorpay/errors.
- Tests: unit next to source (*.test.ts); contract tests in fixtures/.
- Relative imports use the .ts extension (Node type stripping + rewriteRelativeImportExtensions).
- Only erasable TypeScript syntax: no enums, no namespaces, no constructor parameter properties.
- Conventional Commits; one changeset per user-visible change.
- Node 22+ (Node 20 is end-of-life). CI runs Node 22 and 24.

## Never
- Never add Razorpay logos, colours or the word "Razorpay" to UI branding.
- Never accept keys starting rzp_live_.
- Never log secrets or full request headers.
- Never commit fixtures that have not passed scripts/scrub-fixtures.
- Never copy text from Razorpay's documentation into this repo.

## Definition of done
Tests pass · compat.md updated · changeset added · docs page updated ·
progress.md updated.
