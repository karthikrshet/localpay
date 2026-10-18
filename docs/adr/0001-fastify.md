# 0001 — Fastify as the HTTP server

- Status: accepted
- Date: 2026-10-18

## Context

LocalPay serves four things from one local process: the emulated REST API, the
checkout script, the dashboard and its internal API. It needs routing with path
parameters, a content-type parser that can keep raw bodies (for signature work),
hooks for authentication on a route prefix, static file serving, and fast
in-process testing without opening sockets.

## Decision

Use Fastify 5.

- `app.inject()` gives in-process HTTP tests, which keeps the unit and contract
  suites fast and free of port clashes.
- Encapsulated plugins let the Razorpay provider register its routes and its
  Basic-auth hook under `/v1` without affecting the dashboard routes.
- `@fastify/static` covers checkout.js and the built dashboard.

Request validation uses Zod in the provider (one source of truth for rules and
docs), not Fastify's JSON-schema validator, so that error messages can be mapped
to the Razorpay error envelope in one place.

## Consequences

- Fastify is a runtime dependency of `server` and `provider-razorpay`; `core`
  stays framework-free.
- Fastify's default error responses must be replaced with the Razorpay envelope
  (404s, malformed JSON) by the provider's error handler.
