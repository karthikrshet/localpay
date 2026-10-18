---
name: add-scenario
description: Add a YAML test scenario to LocalPay's gallery with its expectations, and keep it deterministic.
---
1. Write packages/scenarios/gallery/NN-short-name.yaml. Give it a `seed` so ids and
   weighted outcomes are deterministic, and a `description` (one or two sentences: the
   situation a developer hits and what their app should do).
2. Use only step types the schema supports (packages/scenarios/src/schema.ts). If the
   scenario needs a missing endpoint or event, add that first (add-endpoint /
   add-webhook-event).
3. Add an `expect:` block: `events_include` for the events that matter, in order, and
   status counts (`orders`, `payments`, `refunds`, `payment_links`). Use exact `events`
   only when the full sequence is the point of the scenario.
4. pnpm vitest run packages/scenarios — gallery.test.ts runs every file twice and fails
   if expectations fail or the two runs differ. Update its count if it checks one.
5. Add the scenario to the gallery table in docs/site/src/content/docs/guides/scenarios.md.
6. pnpm lint && pnpm test must pass.
7. Add a changeset; update .claude/memory/progress.md.
