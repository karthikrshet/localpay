// `new Razorpay(options).open()` — the same contract, served from localhost.
import { render } from 'preact';
import { createApi, type CheckoutApi } from './api.ts';
import { Sheet } from './sheet.tsx';
import { STYLES } from './styles.ts';
import type { CheckoutError, CheckoutOptions, FailureResponse, SuccessResponse } from './types.ts';

type Listener = (payload: FailureResponse) => void;

export interface CheckoutEnvironment {
  baseUrl: string;
  /** Origins besides localhost where checkout may render. */
  allowedOrigins: readonly string[];
  api?: CheckoutApi;
}

const LOCAL_HOST = /^(?:localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|\[::1\]|::1|[a-z0-9-]+\.localhost)$/i;

export function isAllowedPage(location: Pick<Location, 'hostname' | 'origin'>, allowedOrigins: readonly string[]): boolean {
  return LOCAL_HOST.test(location.hostname) || allowedOrigins.includes(location.origin);
}

/** Posts the result to callback_url like the real checkout does with redirect: true. */
function redirectWith(url: string, fields: Record<string, string>): void {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = url;
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

/**
 * Constructable stylesheets are not blocked by a merchant page's `style-src` CSP, while a
 * <style> element is (without 'unsafe-inline'). Fall back to <style> on older browsers.
 */
export function applyStyles(root: ShadowRoot): void {
  if ('adoptedStyleSheets' in root && typeof CSSStyleSheet === 'function' && 'replaceSync' in CSSStyleSheet.prototype) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(STYLES);
    root.adoptedStyleSheets = [sheet];
    return;
  }
  const style = document.createElement('style');
  style.textContent = STYLES;
  root.appendChild(style);
}

export function createCheckoutClass(env: CheckoutEnvironment) {
  return class LocalPayCheckout {
    readonly options: CheckoutOptions;
    private host: HTMLElement | null = null;
    private readonly listeners = new Map<string, Set<Listener>>();

    constructor(options: CheckoutOptions) {
      if (!options || typeof options.key !== 'string' || !options.key) throw new Error('LocalPay checkout: options.key is required');
      this.options = options;
    }

    on(event: string, listener: Listener): void {
      const set = this.listeners.get(event) ?? new Set<Listener>();
      set.add(listener);
      this.listeners.set(event, set);
    }

    open(): void {
      if (this.host) return;
      if (!isAllowedPage(window.location, env.allowedOrigins)) {
        console.error(`LocalPay checkout refuses to render on ${window.location.origin}. It only runs on localhost unless the origin is listed in allowedOrigins.`);
        return;
      }
      this.host = document.createElement('localpay-checkout');
      document.body.appendChild(this.host);
      const root = this.host.attachShadow({ mode: 'open' });
      applyStyles(root);
      const mount = document.createElement('div');
      root.appendChild(mount);
      render(
        <Sheet
          options={this.options}
          api={env.api ?? createApi(env.baseUrl)}
          onSuccess={(response) => this.succeed(response)}
          onFailure={(error) => this.fail(error)}
          onDismiss={() => this.dismiss()}
        />,
        mount,
      );
    }

    close(): void {
      if (!this.host) return;
      const mount = this.host.shadowRoot?.lastElementChild;
      if (mount) render(null, mount);
      this.host.remove();
      this.host = null;
    }

    private succeed(response: SuccessResponse): void {
      this.close();
      if (this.options.callback_url && this.options.redirect) {
        redirectWith(this.options.callback_url, { ...response });
        return;
      }
      this.options.handler?.(response);
    }

    private fail(error: CheckoutError): void {
      // The sheet stays open so the customer can retry, as in the real checkout.
      for (const listener of this.listeners.get('payment.failed') ?? []) listener({ error });
    }

    private dismiss(): void {
      this.close();
      this.options.modal?.ondismiss?.();
    }
  };
}
