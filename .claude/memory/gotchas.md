# Gotchas

Razorpay and SDK quirks found in testing. One dated line each, with where it was seen.

- 2026-10-18 · razorpay Node SDK 2.9.8 hard-codes `https://api.razorpay.com` in its constructor; there is no host/baseUrl option. Seen: dist/razorpay.js.
- 2026-10-18 · The override that works is `client.api.rq.defaults.baseURL = 'http://127.0.0.1:4010'`. `api` is typed; `rq` (an axios instance) is not, so TS needs a cast. Undocumented and could break in any SDK release, so pin it with a test. Seen: scripts/spike.
- 2026-10-18 · The SDK adds `/v1` itself (API.getEntityUrl). The base URL is the host only. The plan's `http://127.0.0.1:4010/v1` would produce `/v1/v1/orders`. Seen: dist/api.js.
- 2026-10-18 · The SDK sends only `X-Razorpay-Account` and `Content-Type` from user headers; everything else is dropped (getValidHeaders). Do not rely on custom headers for LocalPay features. Seen: dist/api.js.
- 2026-10-18 · If the server is unreachable, the SDK throws a bare `TypeError: Cannot read properties of undefined (reading 'status')` (normalizeError assumes a response). The shim and docs should turn this into "is LocalPay running?". Seen: spike error probe.
- 2026-10-18 · HTTP errors come back to callers as `{ statusCode, error: <envelope.error> }`, so LocalPay's error envelope must sit under a top-level `error` key. Seen: spike error probe.
- 2026-10-18 · orders.create defaults `currency` to INR client-side, so the server never sees a missing currency from this SDK. Seen: dist/resources/orders.js.
- 2026-10-18 · The OAuth client uses a second hard-coded host, `https://auth.razorpay.com` (out of scope for MVP). Seen: dist/oAuthTokenClient.js.
