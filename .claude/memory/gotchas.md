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
- 2026-10-18 · razorpay-python 2.0.1 supports `razorpay.Client(auth=(id, secret), base_url='http://127.0.0.1:4010')` officially. Host only; resource paths already start with /v1. Seen: razorpay/client.py.
- 2026-10-18 · razorpay-python picks its exception class from `error.code` (BAD_REQUEST_ERROR → BadRequestError, GATEWAY_ERROR → GatewayError, SERVER_ERROR → ServerError). LocalPay's codes must match these strings exactly. Seen: razorpay/client.py.
- 2026-10-19 · Fastify: never `return reply` from a callback-style hook. Reply is thenable, so Fastify treats the hook as async and the request hangs. Send, then `return;`. Seen: provider-razorpay plugin auth hook.
- 2026-10-19 · Two payments can be authorized on one order; capturing the second after the first settled the order overpaid it. LocalPay now rejects that capture (`order_already_paid`). Real Razorpay may auto-refund instead — unverified. Found by the property test.
- 2026-10-19 · Under ~30 parallel Vitest workers, cold Fastify/Zod imports can exceed 5s; timeouts are 20s in vitest.config.ts.
- 2026-10-19 · Error descriptions in provider-razorpay/errors.ts are our wording. Contract tests compare exact descriptions only for fixtures with provenance "recorded".
- 2026-10-19 · esbuild 0.28 refuses target safari14 ("Transforming destructuring … is not supported yet"); checkout.js targets es2020/chrome100/firefox100/safari15. Seen: packages/checkout/build.ts.
- 2026-10-19 · Playwright's loader crashes importing Fastify in the test process on Node 22 ("Unexpected module status 3", require(esm)). Start servers in their own process via playwright.config.ts webServer. Seen: examples/express e2e.
- 2026-10-19 · pnpm 10+ blocks dependency install scripts; esbuild works without its postinstall (binary comes from the optional platform package). pnpm-workspace.yaml sets allowBuilds.esbuild: false.
- 2026-10-19 · A dispatcher tick that only snapshots due deliveries once leaves deliveries enqueued mid-tick waiting for the next timer; tick now loops until nothing is due.
- 2026-10-19 · Astro 7 requires Node >= 22.22; docs/site pins Astro 6.4 + Starlight 0.39 (last pair for Astro 6 without markdown-satteri).
- 2026-10-19 · @fastify/static 10 passes a FastifyReply (not a raw response) to setHeaders: use reply.header().
- 2026-10-19 · Shell gotcha in our own tooling: a `$C ... && \` chain followed by a heredoc and another `$C` line runs the last line even if the chain failed. Use `set -e` in multi-commit shell blocks.
- 2026-10-19 · Bundling `yaml` into the ESM CLI breaks on `require('process')`; packages/cli/build.ts adds a createRequire banner. The package smoke test caught it.
- 2026-10-19 · Our Bash tool rejects some large heredoc blocks containing apostrophes with "unexpected EOF"; write patch scripts to the scratchpad with the file tool and run them instead.
- 2026-10-19 · In this agent's Bash tool, `set -e` did not stop a multi-line block after a failed python patch, and a later commit ran with a wrong message. Chain steps with `|| exit 1` instead. The commit helper now unstages on failed checks and commits only the given paths.
- 2026-10-20 · next build lints with the nearest ESLint flat config; the monorepo's type-aware config cannot resolve the standalone Next.js example's types, so examples/nextjs is ignored there (next build still typechecks).
- 2026-10-20 · Chrome Local Network Access: a page Chrome considers public (including one faked with Playwright route.fulfill) cannot load scripts from 127.0.0.1. Serve test pages from a real localhost server (examples/express/e2e-servers.js).
- 2026-10-20 · GitHub READMEs do not play repo-relative MP4s inline; the README shows a silent GIF that links to docs/assets/localpay-demo.mp4. For an inline player with sound, upload the MP4 in GitHub's web editor to get a user-attachments URL. FFmpeg is not on PATH on the dev machine; render-video.ts takes FFMPEG=/path.
- 2026-10-20 · ossf/scorecard-action has no floating `v2` tag (only v2.x.y); check `git ls-remote --tags` before using a major-only action tag. CodeQL js/missing-rate-limiting fires on any Fastify route doing auth/crypto/files until @fastify/rate-limit is registered.
- 2026-10-22 · pnpm 11 silently adds packages younger than its release-age window to minimumReleaseAgeExclude in pnpm-workspace.yaml; pick an older version instead of committing that list. Python CI installs use requirements-ci.txt from `uv pip compile --universal --generate-hashes` (pip-compile only resolves for the current OS).
