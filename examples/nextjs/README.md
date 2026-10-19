# Next.js example

App Router shop: route handlers create orders on the server, verify the checkout
signature, and verify webhooks over the raw body. It installs its own dependencies
with npm (it is not part of the pnpm workspace).

```bash
npm install
npx localpay --webhook http://127.0.0.1:3000/api/webhooks                     # terminal 1
LOCALPAY_URL=http://127.0.0.1:4010 NEXT_PUBLIC_LOCALPAY_URL=http://127.0.0.1:4010 npm run dev   # terminal 2
```

`npm test` calls the route handlers directly against a LocalPay on 127.0.0.1:4010.
Unset both variables to use Razorpay test mode with your own keys.
