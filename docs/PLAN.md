LocalPay: Razorpay-Compatible Local Emulator — Build Plan
Oct 18, 2026 · @Karthik Rajesh Shet
Vision and positioning
LocalPay is a free, open-source server that behaves like the Razorpay API on your own machine, so developers can build and test payments offline with no account, no keys and no tunnels.
One-line pitch: Test your Razorpay integration offline. No keys, no ngrok, every edge case one click away.
The problem it solves
• Razorpay's test mode needs an account, KYC-linked keys and internet access.
• Webhooks cannot reach localhost without ngrok or a similar tunnel.
• Many cases are hard or impossible to trigger on demand: UPI timeouts, late captures, disputes, partial refunds, duplicate webhooks, out-of-order events.
• CI pipelines cannot run payment tests without secrets and network calls.
Who it is for
1. Indian startup and product engineers integrating Razorpay.
2. Students and bootcamp learners building projects with payments.
3. QA teams who need repeatable payment scenarios in CI.
4. Later: developers on Cashfree, PhonePe and PayU, through plug-in providers.
Name. "LocalPay" is a working name. Never put "Razorpay" in the project name, package name, logo or domain: it is their trademark, and the project must never look official. Check npm, GitHub and domains for clashes before launch.
Success in 12 months: 5,000+ GitHub stars, 50+ contributors, used in at least 20 public repos' CI, and listed in awesome-lists for Indian developer tools.
Scope: what ships when
Ship a narrow, excellent MVP in 6 weeks: orders, payments, refunds, webhooks and a fake checkout. Breadth comes after people use it.
Release
Includes
Target
MVP (v0.1)
Orders, payments (capture, fetch, list), refunds, payment signature verification, signed webhooks, fake checkout popup, dashboard with webhook log and replay, one-command start
Week 6
v0.5
Customers, payment links, scenario engine (YAML), CLI, Docker image, GitHub Action, Node + Python SDK compatibility tests
Week 10
v1.0
Subscriptions and plans, disputes, settlements, Smart Collect-style virtual accounts, time travel (fast-forward days), record-and-replay
Week 16
Later
Provider plug-ins for Cashfree, PhonePe, PayU; Postman collection; VS Code extension; hosted playground
After v1
Non-goals (say these in the README)
• Not a real payment gateway. It never moves money and never talks to a bank or NPCI.
• Not a production proxy. It refuses to run on a public network by default.
• Not a replacement for testing against Razorpay's real test mode before going live.
• Not a clone of Razorpay's dashboard or brand.
Architecture and stack
One Node.js process, started with npx localpay, serves four things on localhost: the fake API, the fake checkout script, a dashboard, and a webhook dispatcher that calls your app.
Every request lands in the core engine, which records an event; the dashboard, the SQLite store and the webhook dispatcher all work from those events.
How a developer's code reaches LocalPay. This is the riskiest assumption, so Phase 0 proves it before anything else is built.
1. Base-URL override. Point the official SDK at http://127.0.0.1:4010/v1. Verify, per SDK (Node, Python, PHP, Java, Go), whether it accepts a custom host; document the exact line for each.
2. Thin shims. Where an SDK hard-codes the host, publish tiny wrappers (for example localpay-razorpay-node) that construct the official client and swap the base URL. No forks of Razorpay's code.
3. Plain HTTP. Anyone calling the REST API directly just changes the base URL.
4. Checkout. The frontend swaps one script tag (checkout.js from localhost). It exposes the same new Razorpay(options).open() contract and calls the same handler with razorpay_payment_id, razorpay_order_id and razorpay_signature.
Avoid a man-in-the-middle proxy with a trusted local root certificate as a default. It is powerful but teaches users to install root CAs, which is a security smell. Offer it later only as an opt-in, clearly warned mode.
Stack
Layer
Choice
Why
Language
TypeScript 5, strict
One language end to end; typed entity models catch contract drift
Runtime
Node.js 20 LTS+
npx install path; every Razorpay user already has Node
HTTP server
Fastify
Fast, JSON-schema validation built in, good plugin model
Validation
Zod schemas, exported to JSON Schema
One source of truth for request rules and docs
Storage
SQLite (better-sqlite3) with in-memory default; Drizzle ORM
Zero setup; --persist writes a file; fast reset between tests
Dashboard
React + Vite + Tailwind, served by the same process
Single binary feel; fast to build
Checkout UI
Preact, bundled to one small checkout.js
Tiny, no framework leaks into the merchant page
Monorepo
pnpm workspaces + Turborepo
Core, CLI, dashboard, shims and docs versioned together
Tests
Vitest, Playwright, contract tests against recorded fixtures
Unit, browser and compatibility layers
Docs
Astro Starlight
Fast static docs with search
Release
Changesets + GitHub Actions + npm provenance
Signed, repeatable releases
Core design rules
• Deterministic by default. A seed controls IDs and timing, so a test run replays identically.
• Injectable clock. Every timestamp comes from one clock service, which makes "fast-forward 3 days" possible for settlements and subscriptions.
• Event-sourced state. Every state change writes an event first; webhooks, the dashboard log and replay all read from that one stream.
• Providers as plug-ins. The core knows orders, payments and events; a provider package maps them to Razorpay's (later Cashfree's) wire format.
API compatibility surface
Fidelity is the product: if a request works on LocalPay, it must work on Razorpay test mode, and the reverse. Every detail below is from memory of Razorpay's public behaviour, so Phase 0 re-checks each one against the current official docs and a real test account before code depends on it.
Entities in the MVP and v1
Entity
ID prefix
Key fields
Statuses
Release
Order
order_
amount (paise), currency, receipt, notes, amount_paid, amount_due, attempts
created, attempted, paid
MVP
Payment
pay_
order_id, method (upi, card, netbanking, wallet), amount, fee, tax, captured, error_code, error_reason
created, authorized, captured, failed, refunded
MVP
Refund
rfnd_
payment_id, amount, speed, notes
pending, processed, failed
MVP
Customer
cust_
name, email, contact
(none)
v0.5
Payment link
plink_
amount, reference_id, short_url, expire_by
created, partially_paid, paid, expired, cancelled
v0.5
Plan / Subscription
plan_ / sub_
period, interval, total_count, current_start
created, authenticated, active, pending, halted, cancelled, completed
v1
Dispute
disp_
payment_id, amount, reason_code, respond_by
open, under_review, won, lost, closed
v1
Settlement
setl_
amount, fees, tax, utr
created, processed, failed
v1
Wire-format rules to copy exactly
• IDs: prefix + 14 alphanumeric characters. Amounts are integers in paise. Timestamps are Unix seconds.
• Lists return { "entity": "collection", "count": n, "items": [...] } with count, skip, from, to query parameters.
• Auth is HTTP Basic with key_id:key_secret. Accept only keys starting rzp_test_; see Security.
• Errors return { "error": { "code", "description", "source", "step", "reason", "metadata", "field" } } with matching HTTP status (400, 401, 404, 429, 500).
• notes holds up to 15 key-value pairs; enforce the same limits so bugs show up locally.
Signatures (the part developers most often get wrong)
• Checkout success: razorpay_signature = HMAC-SHA256 of order_id + "|" + payment_id using the key secret, hex encoded.
• Webhooks: header X-Razorpay-Signature = HMAC-SHA256 of the raw request body using the webhook secret; header X-Razorpay-Event-Id for de-duplication.
• Payment links and subscriptions use their own signature strings; confirm each in Phase 0.
Webhook envelope
{ "entity": "event", "account_id": "acc_...", "event": "payment.captured",
  "contains": ["payment"], "payload": { "payment": { "entity": { ... } } },
  "created_at": 1760800000 }
MVP events: payment.authorized, payment.captured, payment.failed, order.paid, refund.created, refund.processed, refund.failed.
Magic test values. Honour Razorpay's published test card numbers and test UPI IDs so code written for LocalPay behaves the same in real test mode. Add LocalPay-only magic values (for example amounts ending in .13 (for example ₹100.13) to force a bank timeout) and document them in one table.
The emulator must enforce these transitions exactly, because the most common real bug is shipping goods on payment.authorized and losing money when the payment is never captured.
How fidelity is protected. A compatibility matrix in docs/compat.md lists every endpoint, field and event with status: supported, partial or missing. Contract fixtures are recorded from your own Razorpay test account, scrubbed of keys and personal data, and replayed in CI against LocalPay. A nightly job re-records to catch upstream drift.
Security model
LocalPay must be safe by default even when a user is careless: it never touches real money or real keys, never listens on the public internet unless forced, and can never be mistaken for a real Razorpay page.
Threat
What could go wrong
Control
Accidental public exposure
Someone runs it on a VPS and the dashboard is open to the world
Bind 127.0.0.1 only. Binding 0.0.0.0 needs --host 0.0.0.0 --allow-public, prints a red warning, and requires a dashboard password. Docker docs map the port as 127.0.0.1:4010:4010.
Real keys used
A developer pastes rzp_live_ keys into config
Reject any key not starting rzp_test_ or lp_test_ with 401 and a clear message. Redact secrets in every log line.
Real card data
A user types a real card number
The checkout has no card form by default, only scenario buttons. Optional card mode accepts only published test numbers and rejects, never stores, any other Luhn-valid number.
Phishing reuse
The fake checkout is reused to look like real Razorpay
Own name, logo and palette; a permanent "TEST MODE · LocalPay · no real money" banner; checkout.js refuses to render on non-localhost origins unless listed in config.
Webhook SSRF
The dispatcher is pointed at cloud metadata or internal services
Webhook targets must be configured explicitly; block 169.254.169.254, link-local and metadata hosts; 5-second timeout; no redirects followed.
Dashboard attacks
XSS through notes, or CSRF from another tab
Strict Content-Security-Policy, all user data escaped, a random session token printed at start-up, SameSite cookies, CSRF tokens on actions.
Supply chain
A malicious dependency or hijacked release
Few dependencies, locked; Renovate; CodeQL and OpenSSF Scorecard in CI; npm 2FA and provenance; signed Git tags; branch protection with required review.
Data leakage
Recorded fixtures contain real keys or customer data
A scrubber runs before any fixture is committed; a CI check fails on anything resembling a key, phone number or email.
Defaults that matter
• No telemetry. If added later, it is opt-in, anonymous and documented.
• The Docker image is distroless, runs as a non-root user, and has a read-only root filesystem.
• Example code always verifies signatures with constant-time comparison (crypto.timingSafeEqual, hmac.compare_digest), because people copy examples.
• SECURITY.md gives a private reporting channel (GitHub private vulnerability reporting), a 72-hour acknowledgement target and a 90-day disclosure window.
Design system
Use LocalPay's own palette, not Razorpay's navy-and-blue. Copying their colours on a payment popup makes it look official, invites phishing reuse and a trademark complaint, and would get the repo reported. A distinct palette is also better branding: people remember the project, not a copy.
Colour tokens (light theme; dark theme mirrors them)
Token
Hex
Use
--lp-primary
#0E7C7B (deep teal)
Primary buttons, links, active nav
--lp-primary-hover
#0A6463
Hover and pressed states
--lp-accent
#F59E0B (saffron)
Highlights, the logo mark, charts
--lp-ink
#0F172A
Headings and body text
--lp-muted
#64748B
Secondary text, timestamps
--lp-surface
#FFFFFF
Cards and the checkout sheet
--lp-canvas
#F6F8FA
Page background
--lp-border
#E2E8F0
Dividers, input borders
--lp-success
#16A34A
Captured, processed, delivered
--lp-warning
#D97706
Pending, retrying, test-mode banner
--lp-danger
#DC2626
Failed, rejected, signature mismatch
Check every text/background pair for WCAG AA contrast (4.5:1) before shipping; adjust shades, not the hue family.
Type. Inter for interface text (14 px base, 600 for headings), JetBrains Mono for IDs, JSON and signatures. IDs are always monospace with a one-click copy button.
Checkout popup (what the merchant's customer sees in testing)
1. Amber banner across the top: "TEST MODE · LocalPay · no real money moves".
2. Merchant name, order amount in ₹, order ID in monospace.
3. Method tabs: UPI, Card, Netbanking, Wallet (each only changes the method field recorded).
4. Scenario buttons: Pay successfully, Fail: insufficient funds, Fail: bank down, UPI timeout, Authorize only (no capture), Close without paying.
5. A small "what will happen" line under each button, for example "fires payment.failed with BAD_REQUEST_ERROR".
6. Keyboard and screen-reader accessible; works at 360 px width.
Dashboard screens
1. Home: server URL, test keys with copy buttons, SDK snippet for Node, Python, PHP and Java.
2. Orders and payments: searchable table; click a row to see the full JSON and its event timeline.
3. Webhooks: every delivery with status code, latency, request and response bodies; buttons to replay, send twice, or send out of order.
4. Scenarios: run a saved YAML scenario and watch it play.
5. Time: current emulator time and a "fast-forward" control for settlements and subscriptions.
6. Settings: webhook URLs, secrets, failure injection rates, reset data.
Repository structure
One monorepo, with the engine separate from the Razorpay wire format so other providers can plug in later.
localpay/
├── AGENTS.md                  # rules for any AI coding agent (see next section)
├── CLAUDE.md                  # Claude-specific pointer to AGENTS.md + memory
├── README.md
├── CONTRIBUTING.md
├── SECURITY.md
├── CODE_OF_CONDUCT.md
├── GOVERNANCE.md
├── LICENSE                    # Apache-2.0
├── CHANGELOG.md               # generated by Changesets
├── .claude/
│   ├── memory/                # living project memory (decisions, progress, gotchas)
│   └── skills/                # task playbooks for AI agents
├── .github/
│   ├── workflows/             # ci.yml, release.yml, compat-nightly.yml, codeql.yml
│   ├── ISSUE_TEMPLATE/        # bug, feature, compat-gap
│   └── PULL_REQUEST_TEMPLATE.md
├── docs/
│   ├── adr/                   # 0001-fastify.md, 0002-sqlite.md, ...
│   ├── compat.md              # endpoint/field/event support matrix
│   └── site/                  # Astro Starlight docs website
├── packages/
│   ├── core/                  # engine: entities, state machines, event store, clock, ids
│   ├── provider-razorpay/     # Razorpay routes, wire format, signatures, error mapping
│   ├── server/                # Fastify app wiring core + providers
│   ├── webhooks/              # dispatcher: queue, retries, replay, SSRF guard
│   ├── checkout/              # checkout.js (Preact), built to one file
│   ├── dashboard/             # React + Vite admin UI
│   ├── scenarios/             # YAML scenario parser and runner
│   ├── cli/                   # `localpay` binary: start, reset, scenario run, record
│   └── shims/                 # thin SDK base-URL wrappers (node, python later)
├── fixtures/                  # scrubbed recorded responses for contract tests
├── examples/                  # express, nextjs, fastapi, django, laravel apps
├── scripts/                   # scrub-fixtures, check-secrets, release helpers
└── docker/                    # Dockerfile (distroless, non-root)
Dependency rule: core depends on nothing in the repo. provider-razorpay depends only on core. server wires them. A lint rule (dependency-cruiser) fails CI if this direction breaks.
AI agent memory files and skills
Write these files on day one, before code. They let you, contributors and AI coding agents (Claude Code, Cursor, Codex) work on the repo with the same rules, and they keep decisions from being re-argued every session.
File
Purpose
Updated when
AGENTS.md
The rulebook: architecture, commands, conventions, never-do list
Any rule changes
CLAUDE.md
Short pointer: read AGENTS.md, then memory files
Rarely
.claude/memory/decisions.md
One line per decision with date and ADR link
Every decision
.claude/memory/progress.md
Current phase, done, next 3 tasks, blockers
End of every work session
.claude/memory/gotchas.md
Razorpay quirks and traps found in testing
Every surprise
.claude/memory/glossary.md
Terms: authorize vs capture, UTR, paise, scenario, fixture
New term
.claude/skills/*/SKILL.md
Step-by-step playbooks for repeated tasks
When a task repeats twice
AGENTS.md template
# AGENTS.md — LocalPay

LocalPay is a local, offline emulator of the Razorpay API for testing.
It never moves money, never calls Razorpay, and never accepts live keys.

## Before you start
1. Read .claude/memory/progress.md and decisions.md.
2. Check docs/compat.md for the endpoint you are touching.

## Commands
- pnpm install · pnpm dev · pnpm test · pnpm test:compat · pnpm lint · pnpm build

## Architecture rules
- packages/core has zero imports from other packages.
- Wire format lives only in packages/provider-razorpay.
- All time comes from core/clock; never call Date.now() directly.
- All IDs come from core/ids; never generate IDs inline.
- Every state change emits an event through core/events first.

## Conventions
- TypeScript strict, no `any`. Zod schema for every request body.
- Amounts are integers in paise. Never use floats for money.
- Errors use the Razorpay error envelope via provider-razorpay/errors.
- Tests: unit next to source (*.test.ts); contract tests in fixtures/.
- Conventional Commits; one changeset per user-visible change.

## Never
- Never add Razorpay logos, colours or the word "Razorpay" to UI branding.
- Never accept keys starting rzp_live_.
- Never log secrets or full request headers.
- Never commit fixtures that have not passed scripts/scrub-fixtures.
- Never copy text from Razorpay's documentation into this repo.

## Definition of done
Tests pass · compat.md updated · changeset added · docs page updated ·
progress.md updated.
CLAUDE.md template
# CLAUDE.md
Read AGENTS.md first; it is the source of truth.
Then read .claude/memory/progress.md, decisions.md and gotchas.md.
At the end of a session, update progress.md (done / next / blockers)
and add any new decision or gotcha as one dated line.
For repeated tasks, use the skills in .claude/skills/.
progress.md template
# Progress
Phase: 1 — Core engine (week 2 of 6)
## Done
- 2026-10-25 Order create/fetch/list with contract tests
## Next
1. Payment state machine (authorize, capture, fail)
2. Checkout signature generation
3. payment.captured webhook
## Blockers
- Python SDK base-URL override: unconfirmed (see gotchas)
Skills to write (each a folder with a SKILL.md)
1. add-endpoint — add schema, route, state transition, error cases, contract fixture, compat.md row, docs page.
2. add-webhook-event — define event, emit from state machine, envelope test, signature test, dashboard label.
3. record-fixture — record from your own test account, run the scrubber, review the diff, commit.
4. add-scenario — write YAML, add expected event sequence, add to the scenario gallery.
5. release — changeset check, version, tag, publish with provenance, Docker push, announce.
Example SKILL.md (add-endpoint)
---
name: add-endpoint
description: Add a Razorpay-compatible REST endpoint to LocalPay end to end.
---
1. Confirm the endpoint's request/response shape from your own test-account
   recording in fixtures/, not from memory.
2. Add the Zod request schema in provider-razorpay/schemas.
3. Add or extend the state machine in core; emit events, never mutate silently.
4. Add the route in provider-razorpay/routes; map errors to the envelope.
5. Write unit tests (happy path + every documented error).
6. Add a contract test replaying the fixture.
7. Update docs/compat.md and the docs site page.
8. pnpm lint && pnpm test && pnpm test:compat must pass.
9. Add a changeset; update .claude/memory/progress.md.
Open-source files and governance
A repo earns stars in the first 30 seconds of the README and keeps contributors through CONTRIBUTING and fast reviews. Write both before launch.
README order (top to bottom)
1. Logo, name, one-line pitch, badges (CI, npm version, license, Discord).
2. A 15-second GIF: npx localpay → checkout popup → "Pay successfully" → webhook arrives in the terminal.
3. Quickstart in 3 commands, then the one line to change in your SDK setup.
4. "Why" table: Razorpay test mode vs LocalPay (account needed, internet, ngrok, edge cases, CI-friendly).
5. Feature list with links to docs.
6. Scenario examples (YAML snippet).
7. Compatibility matrix link.
8. Disclaimer: independent project, not affiliated with or endorsed by Razorpay; never use in production.
9. Contributing, community links, license.
Governance choices
Decision
Choice
Reason
License
Apache-2.0
Permissive like MIT, plus an explicit patent grant companies' lawyers like
Contributor sign-off
DCO (git commit -s), no CLA
Lowest friction; CLAs scare first-time contributors
Code of conduct
Contributor Covenant 2.1
Standard and recognised
Decision making
Maintainer-led (BDFL) until 3+ regular maintainers, then documented lazy consensus
Speed early, fairness later
Big changes
RFC as a GitHub Discussion + ADR in docs/adr/
Decisions stay searchable
Versioning
SemVer; 0.x may break with notice in CHANGELOG
Honest about early stage
Contributor funnel
• Labels: good first issue, help wanted, compat-gap, provider:cashfree, needs-repro.
• Keep 10+ open good first issue tickets at all times, each with the exact files to touch.
• Issue templates: bug, feature, compat-gap (endpoint, field, expected vs actual JSON).
• PR template: what changed, tests added, compat.md updated, screenshots for UI.
• First response to every issue and PR within 48 hours. This matters more than any feature.
• A CONTRIBUTORS section in the README generated by all-contributors.
Testing and quality
A testing tool that is itself flaky dies fast, so the bar is: every endpoint has contract tests, every state transition has a unit test, and CI is green before any merge.
Layer
Tool
What it proves
Runs
Unit
Vitest
State machines, signature maths, ID format, error mapping
Every push
Property-based
fast-check
No sequence of API calls reaches an impossible state; refunds never exceed captured amount
Every push
Contract
Vitest + recorded fixtures
LocalPay responses match real Razorpay test-mode shapes field for field
Every push
SDK compatibility
Real official SDKs (Node, Python, PHP, Java) in Docker
The documented one-line setup works with each SDK version
Every push (Node), nightly (others)
Browser
Playwright
Checkout popup flow, handler callback, dashboard replay, accessibility (axe)
Every push
Upstream drift
Nightly job re-recording against your own test account
Razorpay changed something; opens an issue automatically
Nightly
Security
CodeQL, npm audit, secret scan, OpenSSF Scorecard
No known-vulnerable deps or leaked keys
Every push + weekly
Quality gates on every PR: lint (ESLint + Prettier), type check, all tests, coverage of core and provider-razorpay at 90%+ lines, bundle size check on checkout.js (under 30 KB gzipped), and one maintainer review.
Dogfooding: the examples/ apps (Express, Next.js, FastAPI, Django, Laravel) run their own payment tests against LocalPay in CI. If an example breaks, the release is blocked.
Roadmap: phase by phase
Six weeks to a public v0.1, sixteen weeks to v1.0, assuming one builder at about 20 focused hours a week. Each phase ends at a gate; do not start the next phase until its gate passes.
Phase 3 is the one to protect: launch only when a stranger can get from zero to a captured test payment in under 5 minutes.
Phase 0 — Prove it can work (week 1)
[ ] Check name availability on npm, GitHub and a domain; pick the final name.
[ ] Spike: point the official Node SDK at a 10-line local server; confirm the base-URL override. Repeat for Python.
[ ] Create your own Razorpay test account; record 20 real responses (order, payment, refund, errors, webhooks).
[ ] Write a one-page scrubber and scrub those recordings.
[ ] Create the repo: monorepo skeleton, AGENTS.md, CLAUDE.md, memory files, LICENSE, CI running lint + test.
[ ] Write ADR 0001 (Fastify), 0002 (SQLite), 0003 (SDK connection strategy).
• Gate: the Node SDK creates an order against localhost and gets back a correctly shaped object.
Phase 1 — Core engine (weeks 2–3)
[ ] core/ids, core/clock (injectable, seedable), core/events (append-only store).
[ ] Auth middleware: Basic auth, reject live keys, error envelope.
[ ] Orders: create, fetch, list, fetch payments of an order.
[ ] Payments: state machine (created → authorized → captured, or failed), capture endpoint, fetch, list.
[ ] Refunds: full and partial, normal speed; refund state machine.
[ ] Contract tests for every endpoint against the recorded fixtures.
• Gate: all recorded order/payment/refund fixtures pass; property tests find no impossible states.
Phase 2 — Checkout and webhooks (weeks 4–5)
[ ] checkout.js: same constructor and handler contract, scenario buttons, test-mode banner, origin guard.
[ ] Checkout signature generation and a verification helper in the docs.
[ ] Webhook dispatcher: signed deliveries, retries with backoff, SSRF guard, delivery log.
[ ] Failure injection: duplicate delivery, out-of-order delivery, delay, missing signature.
[ ] Example Express app that completes a full purchase flow against LocalPay.
• Gate: the example app's end-to-end Playwright test passes in CI with no network access.
Phase 3 — Dashboard, CLI and launch prep (week 6)
[ ] Dashboard: home, payments, webhooks (with replay), settings.
[ ] CLI: localpay start, reset, --persist, --seed, --port.
[ ] Docs site: quickstart, SDK setup per language, signatures, webhooks, compat matrix.
[ ] README with the 15-second GIF; 10 good first issue tickets written.
[ ] Release v0.1.0 to npm with provenance.
• Gate: a friend who has never seen the project goes from zero to a captured test payment in under 5 minutes.
Phase 4 — v0.5: daily-driver features (weeks 7–10)
[ ] Customers and payment links (with their signature).
[ ] Scenario engine: YAML scenarios ("10 orders, 30% UPI timeout, 2 duplicate webhooks") and a gallery of 10 ready scenarios.
[ ] Docker image (distroless, non-root) and a GitHub Action uses: localpay/action@v0.
[ ] SDK compatibility matrix in CI: Node, Python, PHP, Java; examples for Next.js, FastAPI, Django, Laravel.
• Gate: at least 3 external projects use LocalPay in their CI.
Phase 5 — v1.0: hard cases (weeks 11–16)
[ ] Plans and subscriptions with renewals driven by the clock.
[ ] Disputes and settlements, including T+N settlement timing and fees.
[ ] Time travel in the dashboard and CLI (localpay time advance 3d).
[ ] Record-and-replay: capture a session, replay it in CI.
[ ] Nightly upstream drift job.
• Gate: compat matrix shows every MVP and v1 entity as supported; zero open P0 bugs.
Phase 6 — Ecosystem (after v1)
[ ] Provider plug-in API documented; Cashfree provider built with a community co-maintainer.
[ ] PhonePe and PayU providers led by contributors.
[ ] VS Code extension showing webhook deliveries inline; hosted read-only playground.
Launch and community growth
Launch once, loudly, when v0.1 passes its gate, then keep momentum with a visible release every two weeks.
Launch week
1. Day 1: Show HN post ("Show HN: LocalPay – test Razorpay payments offline, no keys or ngrok"), with the GIF and a short story of the pain.
2. Day 1: X/Twitter and LinkedIn thread: problem → GIF → 3-command quickstart → repo link. Tag Indian developer communities, not Razorpay's brand account in a way that implies endorsement.
3. Day 2: Reddit r/developersIndia and r/node, written as "I built this, feedback welcome", not an ad.
4. Day 3: dev.to / Hashnode tutorial: "Testing Razorpay webhooks in CI without secrets".
5. Day 4–5: Post in college coding clubs, hackathon Discords and bootcamp groups, where students integrate Razorpay most.
6. Day 7: Submit to relevant awesome-lists on GitHub (mock servers, payments, Indian developer tools); check each list exists and is active.
After launch
• A Discord or GitHub Discussions space; answer every question within a day.
• A public roadmap (GitHub Projects) and a monthly "what shipped" post.
• Livestream building one feature a month; recordings become tutorials.
• Hacktoberfest topic and a pinned issue of beginner tasks every October.
• Talks at local meetups (JSFoo, React Bangalore, PyCon India lightning talks).
• Once stable, reach out to Razorpay's developer-relations team politely: an emulator that reduces their support load is something they might link to.
Metrics to watch weekly: stars, npm weekly downloads, Docker pulls, number of public repos with localpay in CI, time to first response on issues, and returning contributors.
Skills the builder needs
You need solid backend TypeScript and a deep understanding of how payments flow; everything else can be learned during the phases where it is first used.
Skill
Level needed
Where it is used
How to learn fast
TypeScript (strict), Node.js
Strong
Everywhere
Build Phase 1 without any; read the Fastify source for patterns
HTTP and REST design
Strong
API surface, errors, pagination
Study real responses from your recorded fixtures
Payments domain: authorize vs capture, refunds, settlements, UPI flows, disputes
Strong
State machines, scenarios
Razorpay's public docs and your own test account; write glossary.md as you learn
Cryptography basics: HMAC-SHA256, constant-time compare, secrets handling
Solid
Signatures, webhooks
Implement and test both signature types from scratch
State machines and event sourcing
Solid
core
Model each entity on paper first; property tests reveal gaps
SQLite and a light ORM
Working
Storage, persistence
Drizzle docs; keep the schema small
Testing: Vitest, Playwright, property-based testing
Solid
Quality gates
Write tests before each endpoint
React + Vite, accessibility basics
Working
Dashboard, checkout
Build the checkout first; run axe on every screen
Web security: CSP, CSRF, SSRF, XSS
Solid
Security model
OWASP cheat sheets for each threat in the table
Docker, GitHub Actions, npm publishing
Working
Release, CI, the GitHub Action
Ship v0.1 manually once, then automate
Technical writing
Strong
README, docs, launch posts
Rewrite the README until a stranger succeeds in 5 minutes
Open-source maintenance: triage, reviews, saying no
Grows over time
After launch
Read GOVERNANCE.md files of projects you admire
Working with AI coding agents
Working
Daily development
Keep AGENTS.md and memory files current; review every diff yourself
Risks, legal notes and open questions
The biggest risk is not code; it is drifting out of sync with Razorpay or looking like an official product. Both are managed from day one.
Risk
Likelihood
Impact
Mitigation
An official SDK cannot be pointed at localhost
Medium
High
Phase 0 spike; thin shims; direct-HTTP docs
Razorpay changes its API and LocalPay drifts
High over time
Medium
Nightly drift job, compat matrix, compat-gap issue label
Trademark or brand complaint
Low if careful
High
Own name, logo and colours; "not affiliated" disclaimer; no copied docs text
Misuse as a phishing kit
Low
High
Test-mode banner, origin guard, localhost-only default, no card form
Razorpay ships its own official emulator
Low–medium
Medium
Stay multi-provider (Cashfree, PhonePe, PayU) and scenario-rich; offer to collaborate
Builder burnout after launch
Medium
High
Narrow scope, recruit 2 co-maintainers by v0.5, say no to off-roadmap features
Legal notes (not legal advice; get a lawyer's view before any commercial version)
• Re-implementing an API's behaviour from public observation is common practice (Stripe's own stripe-mock, LocalStack for AWS), but do not copy documentation text, logos, screenshots or code from Razorpay.
• Every page, the README and the npm description state: independent open-source project, not affiliated with or endorsed by Razorpay; "Razorpay" is used only to describe compatibility.
• Recorded fixtures come from your own test account only, scrubbed, and must not include any data you are not entitled to publish.
Open questions to settle in Phase 0
• Final project name and domain.
• Exact base-URL override method for each official SDK.
• Exact signature strings for payment links and subscriptions.
• Whether to support Razorpay's Route (split payments) in v1 or later.