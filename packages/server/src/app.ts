// Wires core and providers into one Fastify app.
import { createEngine, createFileEventStore, createMemoryEventStore, createOffsetClock, createRandom, type Engine } from '@localpay/core';
import { allRoutes, razorpayApi } from '@localpay/provider-razorpay';
import Fastify, { type FastifyInstance } from 'fastify';
import { resolveConfig, type LocalPayConfig } from './config.ts';

export interface LocalPay {
  app: FastifyInstance;
  engine: Engine;
  config: LocalPayConfig;
  /** Starts listening and the scheduler; resolves to the base URL. */
  listen(): Promise<string>;
  close(): Promise<void>;
}

export const INTERNAL_PREFIX = '/_localpay';
const TICK_MS = 1000;

export async function createLocalPay(overrides: Partial<LocalPayConfig> = {}): Promise<LocalPay> {
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

  // No request logging by default: requests carry keys, and users run this on their laptops.
  const app = Fastify({ logger: false });
  await app.register(razorpayApi, { prefix: '/v1', engine, keys: config.keys, routes: allRoutes });
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
    config,
    async listen() {
      const address = await app.listen({ port: config.port, host: config.host });
      timer = setInterval(() => engine.tick(), TICK_MS);
      timer.unref();
      return address.replace('[::1]', 'localhost');
    },
    close: () => app.close(),
  };
}
