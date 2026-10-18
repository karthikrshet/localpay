# Good first issues

Ten ready-to-file issues for new contributors. Each names the files to touch. File them
with the `good first issue` label when the GitHub repository is created.

1. **Show the order's notes in the dashboard detail view.**
   `packages/dashboard/src/pages/Orders.tsx`. Notes are in the JSON panel only; add a
   key/value list under the summary. Add a case to `dashboard.test.tsx`.

2. **`localpay status --json`.** `packages/cli/src/cli.ts`. Print the same information as
   JSON for scripts. Test in `cli.test.ts`.

3. **Validate `first_payment_min_amount`.** `packages/provider-razorpay/src/schemas.ts`
   and `packages/core/src/engine/payments.ts`. The field is accepted but not enforced for
   partial payments. Update `docs/compat.md`.

4. **Copy-as-curl for webhook deliveries.** `packages/dashboard/src/pages/Webhooks.tsx`.
   A button that copies a curl command reproducing the delivery (body and headers).

5. **Python webhook verification example.** `docs/site/src/content/docs/guides/webhooks.md`.
   Add a Flask or FastAPI snippet using `hmac.compare_digest` on the raw body.

6. **Filter deliveries by status.** `packages/dashboard/src/pages/Webhooks.tsx`. Chips for
   all / delivered / retrying / failed.

7. **Reject `currency` values the gateway does not support.**
   `packages/provider-razorpay/src/schemas.ts`. Today any 3-letter code is accepted.
   Needs a recorded fixture to confirm the error text; see the record-fixture skill.

8. **`--refund-delay` per speed.** `packages/cli/src/options.ts`,
   `packages/server/src/config.ts`. Allow `--refund-delay normal=432000,optimum=0`.

9. **Keyboard shortcut to close the dashboard detail views.**
   `packages/dashboard/src/pages/*`. Escape returns to the list.

10. **Check the PHP SDK's base-URL override.** Add a spike like
    `scripts/spike/python.test.ts` for `razorpay/razorpay` (PHP), document the result in
    `docs/compat.md` and `docs/site/src/content/docs/guides/sdk-setup.md`.
