# 0004 — Providers are plug-ins

- Status: accepted
- Date: 2026-10-19

## Context

The plan's Phase 6 adds Cashfree, PhonePe and PayU, led by contributors. If gateway
details leak into the engine or the server, each new provider means touching shared code
that every other provider depends on.

## Decision

`@localpay/core` defines a `Provider` interface (`packages/core/src/provider`):

- `isTestKeyId(keyId)` — which key ids count as test keys; live keys must be refused.
- `register(app, context)` — mounts every HTTP route the gateway needs: its REST API,
  its checkout API and any hosted pages.
- `webhookFormat(context)` — how domain events become that gateway's webhooks (names,
  payload, signature headers).

The context gives the provider the engine, the configured keys, the account id, the
server's public URL and the allowed checkout origins. `createLocalPay(config, { provider })`
emulates whichever provider it is given; `razorpayProvider` is the default.

Core stays gateway-neutral: domain entities, state machines, events, scheduling,
scenarios and the webhook dispatcher are shared by every provider.

## Consequences

- A new provider is a package that depends only on `@localpay/core`, like
  `@localpay/provider-razorpay`. The ESLint import rule should get a matching entry.
- The dashboard and the scenario runner show domain entities; the dashboard's wire JSON
  panels and SDK snippets are Razorpay-specific today and need a provider hook when a
  second provider lands.
- `/v1/checkout.js` is still served by the server and implements Razorpay's checkout
  contract. A second provider brings its own client script through `register`.
- One provider per server process. Running two gateways means two LocalPay processes.
