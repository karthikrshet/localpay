// Wires core, a provider (Razorpay by default), checkout and webhooks into one Fastify app.
import { createEngine, createFileEventStore, createMemoryEventStore, createOffsetClock, createRandom, NO_API_FAULTS, type ApiFaults, type Engine, type Provider, type ProviderContext } from '@localpay/core';
import { razorpayProvider } from '@localpay/provider-razorpay';
import { createDispatcher, type Dispatcher, type Sender, type WebhookTarget } from '@localpay/webhooks';
import Fastify, { type FastifyInstance } from 'fastify';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAdminAuth, type AdminAuth } from './admin/auth.ts';
import { dashboard } from './admin/dashboard.ts';
import { adminApi } from './admin/routes.ts';
import { defaultCheckoutScript, withConfig, type CheckoutScriptLoader } from './checkout-script.ts';
import { resolveConfig, type LocalPayConfig } from './config.ts';
import { attachRequestLog, type LogSink } from './request-log.ts';

export interface LocalPay {
  app: FastifyInstance;
  engine: Engine;
  dispatcher: Dispatcher;
  config: LocalPayConfig;
  /** Live list; edit it to add or remove webhook targets at runtime. */
  webhookTargets: WebhookTarget[];
  /** Session token for the dashboard and the CLI. */
  adminAuth: AdminAuth;
  /** The link to print: opens the dashboard and stores the session cookie. */
  dashboardUrl(baseUrl: string): string;
  /** Starts listening and the scheduler; resolves to the base URL. */
  listen(): Promise<string>;
  /** Runs due engine work and sends due webhooks once (tests use this instead of the timer). */
  tick(): Promise<void>;
  close(): Promise<void>;
}

export interface LocalPayDependencies {
  /** Replaces the HTTP sender for webhooks (tests). */
  send?: Sender;
  checkoutScript?: CheckoutScriptLoader;
  /** Directory with the built dashboard (index.html, assets/). */
  dashboardDir?: string | null;
  /** Fixed dashboard session token, for browser tests. Random when omitted. */
  adminToken?: string;
  /** Directory of gallery scenarios; the scenarios package's own gallery when omitted. */
  galleryDir?: string;
  /** The gateway to emulate. Razorpay when omitted. */
  provider?: Provider<FastifyInstance>;
  /** Where --log lines go; stdout when omitted. */
  log?: LogSink;
}

/** Finds the built dashboard next to the @localpay/dashboard package, if installed and built. */
export function findDashboardDir(): string | null {
  try {
    const dir = join(dirname(fileURLToPath(import.meta.resolve('@localpay/dashboard/package.json'))), 'dist');
    return existsSync(join(dir, 'index.html')) ? dir : null;
  } catch {
    return null;
  }
}

export const INTERNAL_PREFIX = '/_localpay';
const TICK_MS = 1000;

export async function createLocalPay(overrides: Partial<LocalPayConfig> = {}, deps: LocalPayDependencies = {}): Promise<LocalPay> {
  const config = resolveConfig(overrides);
  const engine = createEngine({
    // Real time plus an offset, so `time advance` works on a running server.
    clock: createOffsetClock(),
    random: createRandom(config.seed ?? undefined),
    store: config.persist ? createFileEventStore(config.persist) : createMemoryEventStore(),
    config: {
      autoCapture: config.autoCapture,
      refundDelaySeconds: { normal: config.refundDelaySeconds, optimum: Math.min(1, config.refundDelaySeconds) },
      settlementDays: config.settlementDays,
    },
  });

  // Known once listening; used for payment link short_url values inside webhooks.
  let publicUrl = `http://${config.host}:${config.port}`;
  const webhookTargets: WebhookTarget[] = config.webhooks.map((w, i) => ({ id: `wh_${i + 1}`, url: w.url, secret: w.secret, events: w.events ?? null }));
  const provider = deps.provider ?? razorpayProvider;
  const apiFaults: ApiFaults = { ...NO_API_FAULTS, ...config.apiFaults };
  const providerContext: ProviderContext = {
    engine,
    keys: config.keys,
    accountId: config.accountId,
    publicUrl: () => publicUrl,
    allowedOrigins: config.allowedOrigins,
    apiFaults: () => apiFaults,
    random: createRandom(config.seed === null ? undefined : `${config.seed}:api`),
  };
  const dispatcher = createDispatcher({
    format: provider.webhookFormat(providerContext),
    targets: () => webhookTargets,
    clock: engine.clock,
    random: createRandom(config.seed === null ? undefined : `${config.seed}:webhooks`),
    newId: (prefix) => engine.newId(prefix),
    faults: config.faults,
    ...(deps.send && { send: deps.send }),
  });

  const tick = async (): Promise<void> => {
    engine.tick();
    await dispatcher.tick();
  };
  engine.subscribe((event) => {
    if (dispatcher.enqueue(event).length > 0) void dispatcher.tick();
  });
  engine.onReset(() => dispatcher.clear());

  // No request logging by default: requests carry keys, and users run this on their laptops.
  const app = Fastify({ logger: false });
  if (config.log) attachRequestLog(app, deps.log ?? ((line) => process.stdout.write(`${line}\n`)));
  await provider.register(app, providerContext);

  let checkoutScript: Promise<string> | null = null;
  const loadScript = deps.checkoutScript ?? defaultCheckoutScript;
  app.get('/v1/checkout.js', async (_request, reply) => {
    checkoutScript ??= loadScript().then((code) => withConfig(code, config.allowedOrigins));
    return reply.type('application/javascript; charset=utf-8').header('cache-control', 'no-store').send(await checkoutScript);
  });

  const adminAuth = createAdminAuth(config.dashboardPassword, deps.adminToken);
  await app.register(adminApi, { prefix: `${INTERNAL_PREFIX}/api`, engine, dispatcher, webhookTargets, auth: adminAuth, accountId: config.accountId, keys: config.keys, apiFaults, ...(deps.galleryDir && { galleryDir: deps.galleryDir }) });
  await app.register(dashboard, { auth: adminAuth, dashboardDir: deps.dashboardDir === undefined ? findDashboardDir() : deps.dashboardDir });

  app.get(`${INTERNAL_PREFIX}/health`, (_request, reply) => reply.send({ ok: true, name: 'LocalPay', time: engine.now() }));

  let timer: NodeJS.Timeout | null = null;
  app.addHook('onClose', (_instance, done) => {
    if (timer) clearInterval(timer);
    timer = null;
    done();
  });

  return {
    app,
    engine,
    dispatcher,
    config,
    webhookTargets,
    adminAuth,
    dashboardUrl: (baseUrl) => `${baseUrl}/?token=${adminAuth.token}`,
    tick,
    async listen() {
      const address = await app.listen({ port: config.port, host: config.host });
      publicUrl = address.replace('[::1]', 'localhost');
      timer = setInterval(() => void tick(), TICK_MS);
      timer.unref();
      return address.replace('[::1]', 'localhost');
    },
    close: () => app.close(),
  };
}
