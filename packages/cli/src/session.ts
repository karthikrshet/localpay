// `localpay start` writes ~/.localpay/session-<port>.json (owner-only) so later
// commands (`reset`, `time advance`, `scenario run`) can reach the running server.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { UsageError } from './options.ts';

export interface SessionInfo {
  url: string;
  token: string;
  pid: number;
}

export const sessionDir = (env: NodeJS.ProcessEnv): string => env.LOCALPAY_HOME ?? join(homedir(), '.localpay');
export const sessionPath = (port: number, env: NodeJS.ProcessEnv): string => join(sessionDir(env), `session-${port}.json`);

export function writeSession(port: number, info: SessionInfo, env: NodeJS.ProcessEnv): string {
  mkdirSync(sessionDir(env), { recursive: true, mode: 0o700 });
  const path = sessionPath(port, env);
  writeFileSync(path, JSON.stringify(info), { mode: 0o600 });
  return path;
}

export function readSession(port: number, env: NodeJS.ProcessEnv): SessionInfo {
  try {
    return JSON.parse(readFileSync(sessionPath(port, env), 'utf8')) as SessionInfo;
  } catch {
    throw new UsageError(`No LocalPay is running on port ${port}. Start one with: localpay start${port === 4010 ? '' : ` --port ${port}`}`);
  }
}

export function removeSession(port: number, env: NodeJS.ProcessEnv): void {
  try {
    rmSync(sessionPath(port, env), { force: true });
  } catch {
    // Nothing to clean up if the session file could not be written in the first place.
  }
}

/** Calls the dashboard API of a running server with the session token. */
export async function callServer<T>(session: SessionInfo, path: string, init: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${session.url}/_localpay/api${path}`, {
      method: init.method ?? 'GET',
      headers: { authorization: `Bearer ${session.token}`, ...(init.body !== undefined && { 'content-type': 'application/json' }) },
      ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
    });
  } catch {
    throw new UsageError(`Could not reach LocalPay at ${session.url}. Is it still running?`);
  }
  const body = (await response.json().catch(() => ({}))) as T & { error?: { description?: string } };
  if (!response.ok) throw new UsageError(body.error?.description ?? `LocalPay answered HTTP ${response.status}`);
  return body;
}
