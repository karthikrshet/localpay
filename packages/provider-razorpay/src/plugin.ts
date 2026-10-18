// Mounts the Razorpay-compatible REST API. Register with { prefix: '/v1' }.
import { EngineError, type Engine } from '@localpay/core';
import type { FastifyError, FastifyInstance, FastifyPluginCallback } from 'fastify';
import { authenticate, type ApiKey } from './auth.ts';
import { ApiError, badRequest, fromEngineError, notFoundUrl, serverError } from './errors.ts';

export interface RazorpayApiOptions {
  engine: Engine;
  keys: readonly ApiKey[];
  /** Extra route groups (orders, payments, ...) to mount inside the authenticated scope. */
  routes?: readonly ((app: FastifyInstance, engine: Engine) => void)[];
}

/** Turns anything thrown by a handler into the gateway's error envelope. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof EngineError) return fromEngineError(error);
  const fastifyError = error as Partial<FastifyError>;
  switch (fastifyError.code) {
    case 'FST_ERR_CTP_INVALID_JSON_BODY':
    case 'FST_ERR_CTP_EMPTY_JSON_BODY':
      return badRequest('The request body must be valid JSON.');
    case 'FST_ERR_CTP_INVALID_MEDIA_TYPE':
      return badRequest('The request body must be sent as application/json.');
    case 'FST_ERR_CTP_BODY_TOO_LARGE':
      return badRequest('The request body is too large.');
    default:
      return serverError();
  }
}

export const razorpayApi: FastifyPluginCallback<RazorpayApiOptions> = (app, options, done) => {
  app.setErrorHandler((error, request, reply) => {
    const apiError = toApiError(error);
    if (apiError.status >= 500) request.log.error({ err: error }, 'unhandled error in Razorpay API');
    return reply.code(apiError.status).send(apiError.toJSON());
  });

  app.setNotFoundHandler((_request, reply) => {
    const error = notFoundUrl();
    return reply.code(error.status).send(error.toJSON());
  });

  app.addHook('onRequest', (request, reply, next) => {
    const result = authenticate(request.headers.authorization, options.keys);
    if (result.ok) {
      next();
      return;
    }
    // Do not return `reply` here: it is thenable, and Fastify would treat this callback hook as async.
    void reply.code(result.error.status).send(result.error.toJSON());
  });

  for (const register of options.routes ?? []) register(app, options.engine);
  done();
};
