---
title: CLI
description: Every localpay command and flag.
---

```text
localpay [start] [options]        start the server (default command)
localpay status [--port N]        show what a running server holds
localpay reset [--port N]         delete all data in a running server
localpay time [--port N]          show emulator time
localpay time advance <duration>  fast-forward, e.g. 1h, 3d, 1w
localpay scenario list            list the built-in scenario gallery
localpay scenario run <file|id>   run a YAML scenario; exit code 1 if it fails
localpay help | --version
```

## `start` options

| Flag | Default | Meaning |
| --- | --- | --- |
| `-p, --port <n>` | `4010` | Port. `0` picks a free one. |
| `--host <addr>` | `127.0.0.1` | Bind address. Anything but loopback needs `--allow-public`. |
| `--allow-public` | off | Allow a public `--host`. Requires `--dashboard-password`. |
| `--dashboard-password <p>` | none | Password login for the dashboard. |
| `--key <id:secret>` | demo key | API key, repeatable. Id must start `rzp_test_` or `lp_test_`. |
| `--webhook <url>` | none | Webhook target, repeatable. |
| `--webhook-secret <s>` | `localpay_webhook_secret` | Secret for `X-Razorpay-Signature`. |
| `--webhook-events <a,b>` | all | Only send these events. |
| `--fault <name=value>` | none | `duplicate`, `out-of-order`, `unsigned` (0–1) or `delay` (ms). Repeatable. |
| `--no-auto-capture` | capture on | Stop successful payments at `authorized`. |
| `--refund-delay <s>` | `5` | Seconds a refund stays `pending`. |
| `--settlement-days <n>` | `2` | Days from capture to settlement (T+N). |
| `--persist <file>` | memory | Keep data in a JSONL event log between runs. |
| `--seed <value>` | random | Deterministic ids. |
| `--allowed-origin <url>` | localhost only | Let checkout run on another origin, repeatable. |
| `--config <file>` | `./localpay.config.json` | JSON config file. |
| `--open` | off | Open the dashboard in a browser. |

## Environment variables

`LOCALPAY_PORT`, `LOCALPAY_HOST`, `LOCALPAY_SEED`, `LOCALPAY_PERSIST`,
`LOCALPAY_KEY_ID` with `LOCALPAY_KEY_SECRET`, `LOCALPAY_WEBHOOK_URL` with
`LOCALPAY_WEBHOOK_SECRET`, `LOCALPAY_HOME` (where session files live, default
`~/.localpay`), `NO_COLOR`.

Precedence: defaults, then `localpay.config.json`, then environment, then flags.

## Config file

```json
{
  "port": 4010,
  "keys": [{ "keyId": "rzp_test_LocalPayDemo01", "keySecret": "localpay_demo_secret" }],
  "webhooks": [{ "url": "http://127.0.0.1:3000/webhooks", "secret": "my_secret", "events": ["payment.captured"] }],
  "faults": { "duplicateRate": 0.2 },
  "autoCapture": true,
  "refundDelaySeconds": 5
}
```
