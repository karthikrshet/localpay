// @localpay/shim-node — build the official Razorpay Node SDK client pointed at LocalPay.
// The SDK has no host option (see docs/adr/0003), so this sets the base URL on its
// internal axios instance and makes "server not running" errors readable.
import type Razorpay from 'razorpay';

export const DEFAULT_URL = 'http://127.0.0.1:4010';
export const DEMO_KEY_ID = 'rzp_test_LocalPayDemo01';
export const DEMO_KEY_SECRET = 'localpay_demo_secret';

interface AxiosLike {
  defaults: { baseURL?: string };
  interceptors: { response: { use(onFulfilled: undefined, onRejected: (error: unknown) => unknown): number } };
}

/** Drops trailing slashes in one pass. A `/\/+$/` regex is quadratic on long runs of slashes. */
function trimTrailingSlashes(text: string): string {
  let end = text.length;
  while (end > 0 && text.charCodeAt(end - 1) === 47) end--;
  return text.slice(0, end);
}

/** The SDK adds /v1 itself, so the base URL must be the host only. */
export function normalizeBaseUrl(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new TypeError(`LocalPay URL must be http(s): ${url}`);
  return `${parsed.origin}${trimTrailingSlashes(trimTrailingSlashes(parsed.pathname).replace(/\/v1$/, ''))}`;
}

function axiosOf(client: Razorpay): AxiosLike {
  const rq = (client as unknown as { api?: { rq?: AxiosLike } }).api?.rq;
  if (!rq?.defaults || !rq.interceptors) {
    throw new Error('This razorpay SDK version is not supported by @localpay/shim-node (no api.rq). Please open an issue with your SDK version.');
  }
  return rq;
}

/** Points an existing SDK client at LocalPay. Returns the same client. */
export function pointAtLocalPay<T extends Razorpay>(client: T, baseUrl: string = DEFAULT_URL): T {
  const rq = axiosOf(client);
  const url = normalizeBaseUrl(baseUrl);
  rq.defaults.baseURL = url;
  rq.interceptors.response.use(undefined, (error: unknown) => {
    const err = error as { response?: unknown; message?: string };
    if (err.response) throw error;
    // The SDK's error handler reads error.response.status/data.error; without a response it
    // crashes with a TypeError. Give it a response so callers get the usual { statusCode, error }.
    throw Object.assign(new Error(`Could not reach LocalPay at ${url}`), {
      response: {
        status: 503,
        data: {
          error: {
            code: 'SERVER_ERROR',
            description: `Could not reach LocalPay at ${url}. Is it running? Start it with: npx localpay (${err.message ?? 'network error'})`,
            source: 'NA',
            step: 'NA',
            reason: 'localpay_unreachable',
            metadata: {},
          },
        },
      },
    });
  });
  return client;
}

export interface LocalPayClientOptions {
  key_id?: string;
  key_secret?: string;
  /** Defaults to $LOCALPAY_URL, then http://127.0.0.1:4010. */
  baseUrl?: string;
}

/** Creates an official SDK client already pointed at LocalPay. */
export function createLocalPayClient(RazorpayClass: typeof Razorpay, options: LocalPayClientOptions = {}): Razorpay {
  const client = new RazorpayClass({
    key_id: options.key_id ?? process.env.LOCALPAY_KEY_ID ?? DEMO_KEY_ID,
    key_secret: options.key_secret ?? process.env.LOCALPAY_KEY_SECRET ?? DEMO_KEY_SECRET,
  });
  return pointAtLocalPay(client, options.baseUrl ?? process.env.LOCALPAY_URL ?? DEFAULT_URL);
}
