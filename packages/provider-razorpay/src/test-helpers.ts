// Shared test setup: a Fastify app with the API mounted on /v1 and a demo key.
import { createEngine, type EngineOptions } from '@localpay/core';
import Fastify from 'fastify';
import { razorpayApi, type RazorpayApiOptions } from './plugin.ts';

export const TEST_KEY = { keyId: 'rzp_test_LocalPayDemo01', keySecret: 'demo_secret' };
export const AUTH = `Basic ${Buffer.from(`${TEST_KEY.keyId}:${TEST_KEY.keySecret}`).toString('base64')}`;

export async function buildTestApp(routes: RazorpayApiOptions['routes'] = [], engineOptions: EngineOptions = { seed: 'test' }) {
  const engine = createEngine(engineOptions);
  const app = Fastify();
  await app.register(razorpayApi, { prefix: '/v1', engine, keys: [TEST_KEY], routes });
  await app.ready();
  const call = async (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) => {
    const response = await app.inject({ method, url, headers: { authorization: AUTH }, ...(payload !== undefined && { payload: payload as object }) });
    return { status: response.statusCode, body: response.json<Record<string, unknown>>() };
  };
  return { app, engine, call };
}
