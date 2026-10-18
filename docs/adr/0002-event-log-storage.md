# 0002 — The event log is the store; SQLite deferred

- Status: accepted (supersedes the plan's "SQLite + Drizzle" storage line)
- Date: 2026-10-18

## Context

The plan chose SQLite (better-sqlite3) with Drizzle, in-memory by default and a
file with `--persist`. It also requires event-sourced state: every change writes
an event first, and webhooks, the dashboard and replay read that one stream.

better-sqlite3 is a native module. `npx localpay` must work on Windows, macOS,
Linux, Alpine and a distroless Docker image without a compiler, and pnpm 10+ blocks
dependency build scripts by default. Node's built-in `node:sqlite` avoids the
native build but is still experimental on Node 22.

## Decision

The append-only event log is the store.

- State is a pure fold of events (`core/state`), held in memory.
- Default: in-memory log; `reset` clears it.
- `--persist <file>` appends each event as one JSON line and replays the file
  on start-up.
- Reads (fetch, list, filters) run against the in-memory projection. The data set
  of a test session is small (thousands of rows), so this is fast enough.

## Consequences

- Zero native dependencies; install is a plain download.
- Replay, time travel and record-and-replay come from the same mechanism.
- If large persisted sessions get slow, add a SQLite projection behind the same
  `EventStore` interface; this ADR can be superseded without touching routes.
