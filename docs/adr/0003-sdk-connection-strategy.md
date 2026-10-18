# 0003 — How SDKs reach LocalPay

- Status: accepted
- Date: 2026-10-18

## Context

Developers must point the official Razorpay SDKs at LocalPay without forking
them and without a man-in-the-middle proxy. The Phase 0 spikes (scripts/spike)
checked the two most used SDKs.

| SDK | Host option | Evidence |
| --- | --- | --- |
| razorpay (Node) 2.9.8 | none: `https://api.razorpay.com` is fixed in the constructor | `client.api.rq` is an axios instance; setting `defaults.baseURL` works |
| razorpay (Python) 2.0.1 | `base_url` constructor option | `razorpay.Client(auth=..., base_url=...)` works |

Both SDKs add `/v1` themselves, so the base URL is the host only:
`http://127.0.0.1:4010`.

## Decision

1. **Official option first.** Where an SDK has one (Python), the docs show that one line.
2. **Thin shim where it does not.** `@localpay/shim-node` builds the official
   client and sets `api.rq.defaults.baseURL`. It also turns the SDK's opaque
   "cannot read properties of undefined" crash, raised when the server is down,
   into a clear "is LocalPay running?" error. The package name does not contain
   "razorpay" (trademark rule in AGENTS.md).
3. **Plain HTTP.** Direct REST callers change the base URL.
4. **Checkout.** Swap the script tag for `http://127.0.0.1:4010/v1/checkout.js`.
5. **No MITM proxy** with a local root CA by default.

## Consequences

- The Node shim relies on an undocumented property. The spike test runs in CI
  against the pinned SDK version and must be re-run on every SDK upgrade.
- PHP, Java and Go are still unchecked; they get the same spike before docs claim support.
