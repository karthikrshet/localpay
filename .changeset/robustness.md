---
'localpay': minor
'@localpay/shim-node': minor
---

Late authorization (a failed UPI payment the bank confirms later); API fault injection for 429, 500 and latency (`--fault rate-limit=…`, `server-error=…`, `api-delay=…`); an opt-in `--log` that never prints secrets; webhook deliveries and pending retries kept across restarts with `--persist`; checkout.js now keeps its styles on pages with a strict `style-src` CSP; dashboard tables label their action columns for screen readers.
