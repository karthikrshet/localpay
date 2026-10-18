// Same-origin calls to the dashboard API. The session cookie is sent automatically;
// mutations add the CSRF token the server handed out in /session.
import { createContext, useContext, useEffect, useState } from 'react';

let csrfToken = '';
export const setCsrf = (token: string): void => {
  csrfToken = token;
};

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, init: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`/_localpay/api${path}`, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    headers: { 'x-localpay-csrf': csrfToken, ...(init.body !== undefined && { 'content-type': 'application/json' }) },
    ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: { description?: string } };
  if (!response.ok) throw new ApiError(response.status, body.error?.description ?? `HTTP ${response.status}`);
  return body;
}

/** Bumped whenever the server reports a change; views refetch when it moves. */
export const LiveContext = createContext(0);
export const useLiveVersion = (): number => useContext(LiveContext);

export interface ApiState<T> {
  data: T | null;
  error: string | null;
  reload: () => void;
}

export function useApi<T>(path: string | null): ApiState<T> {
  const live = useLiveVersion();
  const [state, setState] = useState<{ data: T | null; error: string | null }>({ data: null, error: null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (path === null) return;
    let cancelled = false;
    api<T>(path)
      .then((data) => !cancelled && setState({ data, error: null }))
      .catch((error: unknown) => !cancelled && setState((s) => ({ data: s.data, error: error instanceof Error ? error.message : String(error) })));
    return () => {
      cancelled = true;
    };
  }, [path, live, nonce]);

  return { ...state, reload: () => setNonce((n) => n + 1) };
}
