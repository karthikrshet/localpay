---
'localpay': patch
'@localpay/shim-node': patch
---

Rate-limit every client to 6,000 requests a minute (answered with Razorpay's `429` error) and the dashboard login to 10 attempts a minute. Trailing slashes in base URLs are trimmed without a regex that could be slow on long inputs.
