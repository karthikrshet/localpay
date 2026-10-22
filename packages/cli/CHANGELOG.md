# localpay

## 0.1.0

### Minor Changes

- [`e6ce913`](https://github.com/karthikrshet/localpay/commit/e6ce9131de995c02e8ab2d67f55cd0fb776d660c) Thanks [@karthikrshet](https://github.com/karthikrshet)! - Customers and payment links (with a hosted payment page, signed callbacks and `payment_link.*` webhooks); a YAML scenario engine with a gallery, `localpay scenario run` and a Scenarios screen; a distroless Docker image; a GitHub Action; container-safe start-up (generated dashboard password, read-only filesystems).

- [`09eb92f`](https://github.com/karthikrshet/localpay/commit/09eb92f311beef3dadf1731f36c75abb5f2c6ded) Thanks [@karthikrshet](https://github.com/karthikrshet)! - First release: Razorpay-compatible orders, payments, captures and refunds; a test checkout popup with scenario buttons; signed webhooks with retries, replay and fault injection; a dashboard; the `localpay` CLI with time travel; and a Node SDK shim.

- [`e6ce913`](https://github.com/karthikrshet/localpay/commit/e6ce9131de995c02e8ab2d67f55cd0fb776d660c) Thanks [@karthikrshet](https://github.com/karthikrshet)! - Plans and subscriptions with clock-driven renewals, retries and halting; checkout with `subscription_id`; disputes (raise, accept, contest, resolve, automatic loss at `respond_by`); T+N settlements with UTRs; record-and-replay (`--record`, `localpay replay`); provider plug-ins (`createLocalPay(config, { provider })`); dashboard screens for links, subscriptions, settlements and disputes; `--settlement-days`.

- [`0499245`](https://github.com/karthikrshet/localpay/commit/04992459dad636abcddff95c7812fd2c34d5f003) Thanks [@karthikrshet](https://github.com/karthikrshet)! - Late authorization (a failed UPI payment the bank confirms later); API fault injection for 429, 500 and latency (`--fault rate-limit=…`, `server-error=…`, `api-delay=…`); an opt-in `--log` that never prints secrets; webhook deliveries and pending retries kept across restarts with `--persist`; checkout.js now keeps its styles on pages with a strict `style-src` CSP; dashboard tables label their action columns for screen readers.

### Patch Changes

- [`337d269`](https://github.com/karthikrshet/localpay/commit/337d269da974379b75a02e6a11655e3e83341b07) Thanks [@karthikrshet](https://github.com/karthikrshet)! - Rate-limit every client to 6,000 requests a minute (answered with Razorpay's `429` error) and the dashboard login to 10 attempts a minute. Trailing slashes in base URLs are trimmed without a regex that could be slow on long inputs.
