// Wires core, the Razorpay provider, checkout and webhooks into one Fastify app.
import { createEngine, createFileEventStore, createMemoryEventStore, createOffsetClock, createRandom, type Engine } from '@localpay/core';
import { allRoutes, checkoutApi, razorpayApi, razorpayWebhookFormat } from '@localpay/provider-razorpay';
import { createDispatcher, type Dispatcher, type Sender, type WebhookTarget } from '@localpay/webhooks';
import Fastify, { type FastifyInstance } from 'fastify';
import { defaultCheckoutScript, withConfig, type CheckoutScriptLoader } from './checkout-script.ts';
import { resolveConfig, type LocalPayConfig } from './config.ts';

export interface LocalPay {
  app: FastifyInstance;
  engine: Engine;
  dispatcher: Dispatcher;
  config: LocalPayConfig;
  /** Live list; edit it to add or remove webhook targets at runtime. */
  webhookTargets: WebhookTarget[];
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
    },
  });

  const webhookTargets: WebhookTarget[] = config.webhooks.map((w, i) => ({ id: `wh_${i + 1}`, url: w.url, secret: w.secret, events: w.events ?? null }));
  const dispatcher = createDispatcher({
    format: razorpayWebhookFormat(config.accountId),
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
  await app.register(razorpayApi, { prefix: '/v1', engine, keys: config.keys, routes: allRoutes });
  await app.register(checkoutApi, { prefix: `${INTERNAL_PREFIX}/checkout`, engine, keys: config.keys, allowedOrigins: config.allowedOrigins });

  let checkoutScript: Promise<string> | null = null;
  const loadScript = deps.checkoutScript ?? defaultCheckoutScript;
  app.get('/v1/checkout.js', async (_request, reply) => {
    checkoutScript ??= loadScript().then((code) => withConfig(code, config.allowedOrigins));
    return reply.type('application/javascript; charset=utf-8').header('cache-control', 'no-store').send(await checkoutScript);
  });

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
    tick,
    async listen() {
      const address = await app.listen({ port: config.port, host: config.host });
      timer = setInterval(() => void tick(), TICK_MS);
      timer.unref();
      return address.replace('[::1]', 'localhost');
    },
    close: () => app.close(),
  };
}
