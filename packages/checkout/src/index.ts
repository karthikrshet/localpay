// checkout.js entry: installs window.Razorpay. The API base URL is the origin this
// script was loaded from, e.g. <script src="http://127.0.0.1:4010/v1/checkout.js">.
import { createCheckoutClass } from './checkout.tsx';

declare global {
  interface Window {
    Razorpay?: unknown;
    /** Optional page-level config, set before loading checkout.js. */
    LocalPayCheckoutConfig?: { allowedOrigins?: string[] };
  }
}

const script = document.currentScript as HTMLScriptElement | null;
const baseUrl = script?.src ? new URL(script.src).origin : 'http://127.0.0.1:4010';

window.Razorpay = createCheckoutClass({ baseUrl, allowedOrigins: window.LocalPayCheckoutConfig?.allowedOrigins ?? [] });
