// Loads checkout.js: the prebuilt bundle when it exists, otherwise an in-memory build
// (development checkouts of this repo, where dist/ has not been built yet).
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export type CheckoutScriptLoader = () => Promise<string>;

export const defaultCheckoutScript: CheckoutScriptLoader = async () => {
  try {
    return await readFile(fileURLToPath(import.meta.resolve('@localpay/checkout/dist/checkout.js')), 'utf8');
  } catch {
    const { buildCheckout } = (await import('@localpay/checkout/build')) as { buildCheckout: () => Promise<string> };
    return buildCheckout();
  }
};

/** Prepends page config so the client-side origin guard knows extra allowed origins. */
export function withConfig(script: string, allowedOrigins: readonly string[]): string {
  if (allowedOrigins.length === 0) return script;
  const config = JSON.stringify({ allowedOrigins });
  return `window.LocalPayCheckoutConfig=window.LocalPayCheckoutConfig||${config};\n${script}`;
}
