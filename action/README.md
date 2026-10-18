# LocalPay GitHub Action

Starts [LocalPay](../README.md) in the background so your tests can create orders,
pay them and receive signed webhooks without Razorpay keys or network access.

```yaml
- uses: localpay/localpay/action@v0
  id: localpay
  with:
    webhook: http://127.0.0.1:3000/webhooks
    scenario: 01-happy-path   # optional; fails the step if the scenario fails
- run: npm test
  env:
    LOCALPAY_URL: ${{ steps.localpay.outputs.url }}
    RAZORPAY_KEY_ID: ${{ steps.localpay.outputs.key-id }}
    RAZORPAY_KEY_SECRET: ${{ steps.localpay.outputs.key-secret }}
```

`LOCALPAY_URL` is also exported to later steps. Inputs: `version`, `port`, `webhook`
(one URL per line), `webhook-secret`, `args` (extra `localpay start` flags), `scenario`.
