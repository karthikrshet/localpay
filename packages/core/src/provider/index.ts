// The provider plug-in contract. Core knows orders, payments and events; a provider maps
// them to one gateway's wire format (routes, errors, signatures, webhooks, checkout).
// Generic over the HTTP app type so core does not depend on Fastify.
import type { Engine } from '../engine/index.ts';
import type { WebhookFormat } from '../webhooks/index.ts';

export interface ProviderKey {
  keyId: string;
  keySecret: string;
}

export interface ProviderContext {
  engine: Engine;
  /** API keys the server was started with (already checked by isTestKeyId). */
  keys: readonly ProviderKey[];
  /** account_id (or equivalent) to put in webhook payloads. */
  accountId: string;
  /** The server's base URL, known once it is listening. */
  publicUrl: () => string;
  /** Origins besides localhost allowed to use the provider's checkout. */
  allowedOrigins: readonly string[];
}

export interface Provider<App = unknown> {
  /** Short id, e.g. "razorpay". */
  readonly name: string;
  /** Only test-mode key ids may be configured; live keys must be refused. */
  isTestKeyId(keyId: string): boolean;
  /** Registers every HTTP route the provider serves (API, checkout API, hosted pages). */
  register(app: App, context: ProviderContext): Promise<void>;
  /** How domain events become this gateway's webhooks. */
  webhookFormat(context: ProviderContext): WebhookFormat;
}
