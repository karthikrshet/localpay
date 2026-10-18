// Sends one webhook HTTP request: guarded DNS, 5s timeout, redirects not followed,
// response body truncated for the delivery log.
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { guardedLookup, validateTargetUrl } from './ssrf.ts';

export interface SendRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
  timeoutMs?: number;
}

export interface SendResult {
  statusCode: number;
  responseBody: string;
  latencyMs: number;
}

export type Sender = (request: SendRequest) => Promise<SendResult>;

export const DEFAULT_TIMEOUT_MS = 5000;
export const MAX_LOGGED_RESPONSE = 4096;

export const httpSender: Sender = (input) =>
  new Promise((resolve, reject) => {
    const url = validateTargetUrl(input.url);
    const started = performance.now();
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
      url,
      {
        method: 'POST',
        headers: { ...input.headers, 'content-length': String(Buffer.byteLength(input.body)) },
        lookup: guardedLookup,
        timeout: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          if (size < MAX_LOGGED_RESPONSE) chunks.push(chunk);
          size += chunk.length;
        });
        response.on('end', () => {
          resolve({
            statusCode: response.statusCode ?? 0,
            responseBody: Buffer.concat(chunks).toString('utf8').slice(0, MAX_LOGGED_RESPONSE),
            latencyMs: Math.round(performance.now() - started),
          });
        });
        response.on('error', reject);
      },
    );
    request.on('timeout', () => request.destroy(new Error(`timed out after ${input.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`)));
    request.on('error', reject);
    request.end(input.body);
  });

/** 2xx is success. Redirects are not followed and count as failures, like the gateway. */
export const isSuccess = (statusCode: number): boolean => statusCode >= 200 && statusCode < 300;
