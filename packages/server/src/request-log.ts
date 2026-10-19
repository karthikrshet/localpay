// Optional one-line-per-request log. It never prints secrets, headers or bodies:
// only method, path (without query), status, duration and a truncated key id.
import { parseBasicAuth, redactKeyId } from '@localpay/provider-razorpay';
import type { FastifyInstance } from 'fastify';

export type LogSink = (line: string) => void;

export function formatRequestLine(input: { method: string; url: string; status: number; ms: number; authorization?: string | undefined }): string {
  const path = input.url.split('?')[0] ?? input.url;
  const keyId = parseBasicAuth(input.authorization)?.user;
  return `${input.method.padEnd(6)} ${path} ${input.status} ${Math.round(input.ms)}ms${keyId ? ` key=${redactKeyId(keyId)}` : ''}`;
}

export function attachRequestLog(app: FastifyInstance, sink: LogSink): void {
  app.addHook('onResponse', (request, reply, done) => {
    sink(formatRequestLine({ method: request.method, url: request.url, status: reply.statusCode, ms: reply.elapsedTime, authorization: request.headers.authorization }));
    done();
  });
}
