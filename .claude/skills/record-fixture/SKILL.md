---
name: record-fixture
description: Record a real Razorpay test-mode response from your own account, scrub it, and commit it as a contract fixture.
---
Only a human maintainer with their own Razorpay test account runs the recording
step. An AI agent must never handle the keys; it may prepare the request and
review the scrubbed output.

1. Use your own test account and rzp_test_ keys only. Keys live in your shell
   environment, never in a file in this repo.
2. Record the request and the full response (status, headers you need, body)
   into a scratch folder outside the repo.
3. Run scripts/scrub-fixtures on it. It replaces key ids, secrets, emails, phone
   numbers, names, card details, VPAs, IP addresses and account ids with fixed
   placeholders, and keeps field names, types and ID formats.
4. Review the diff by eye. Anything that looks like a real person, key, phone
   number, email or account id must not remain. If in doubt, leave it out.
5. Run scripts/check-secrets; it must pass.
6. Move the fixture into fixtures/<entity>/<scenario>.json with a short note
   (endpoint, date recorded, SDK/API version if known).
7. Add or update the contract test that replays it.
8. Note any surprise in .claude/memory/gotchas.md as one dated line.
9. Commit the fixture on its own (Conventional Commit: "test(fixtures): ...").
