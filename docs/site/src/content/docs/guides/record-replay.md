---
title: Record and replay
description: Capture a session once, replay its webhooks against your handler in CI.
---

Record a session while you click through your app:

```bash
npx localpay --record session.jsonl
```

(or download it later from **Settings → Download this session**). The file is LocalPay's
event log: one JSON object per line, with every entity snapshot.

Replay its webhooks against your handler, for example in CI:

```bash
npx localpay replay session.jsonl --webhook http://127.0.0.1:3000/webhooks
```

Every webhook from the recording is sent again, in the recorded order, signed with
`--webhook-secret` (default `localpay_webhook_secret`) and with the **original**
`X-Razorpay-Event-Id`, so idempotency logic sees exactly what it saw before. Each delivery
gets one attempt; the command prints the result per event and exits with code 1 if any
delivery fails. `--events payment.captured,order.paid` replays only some events.

Recordings can contain the emails and phone numbers you typed during the session. Do not
commit them to public repositories without checking, or run `pnpm scrub-fixtures` on a copy.
