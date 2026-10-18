---
name: add-scenario
description: Add a YAML test scenario to LocalPay with its expected event sequence and a gallery entry.
---
1. Write the scenario as packages/scenarios/gallery/<name>.yaml. Give it a
   seed so IDs and timing are deterministic, and describe one situation a
   developer actually hits (e.g. "UPI timeout then late success").
2. Use only behaviour LocalPay already supports; if a step needs a missing
   endpoint or event, add that first (add-endpoint / add-webhook-event).
3. Write the expected event sequence next to it (<name>.expected.json):
   ordered event names, entity statuses after each step, and webhook
   deliveries including deliberate duplicates or reordering.
4. Add a test that runs the scenario with the runner and compares the
   recorded events to the expected sequence exactly.
5. Run it twice with the same seed; the outputs must be identical.
6. Add it to the scenario gallery in the docs with a one-line "use this when".
7. pnpm lint && pnpm test must pass.
8. Add a changeset; update .claude/memory/progress.md.
