// The contract between the webhook dispatcher and a provider: which domain events
// become webhooks, what the payload looks like, and which headers sign it.
import type { AnyEvent } from '../events/types.ts';

export interface WebhookMessage {
  /** Gateway event name, e.g. payment.captured. */
  name: string;
  /** JSON body to send. Serialised once so the signature covers the exact bytes. */
  payload: unknown;
}

export interface WebhookFormat {
  /** Every event name this provider can send, for filters and the dashboard. */
  readonly events: readonly string[];
  /** Returns null for domain events that are not delivered as webhooks. */
  format(event: AnyEvent): WebhookMessage | null;
  /** Headers for one delivery. `signed: false` is used by failure injection. */
  headers(rawBody: string, secret: string, eventId: string, options?: { signed?: boolean }): Record<string, string>;
}
