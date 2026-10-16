import { ADMIN_API } from '@/constants/config';
import { appHeaders } from '@/lib/app-info';
import { getIdToken } from '@/lib/firebase-auth';

import { emitGateSignal, isGateResponse } from './gate-signal';

/** Raised when the backend rejects the caller; `status` drives what the UI does. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Machine code from the API's `{error, code}` body, e.g. `insufficient_coins`. */
    public code?: string,
    /** The whole error body — carries extras such as `{needed, balance, shortfall}`. */
    public body?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * True when the request never reached the server (no signal, DNS, timeout).
 * `fetch` rejects with a TypeError for those and an AbortError on our timeout;
 * an HTTP error status is an ApiError instead and is NOT offline.
 */
export function isOffline(e: unknown): boolean {
  if (e instanceof ApiError) return false;
  const name = (e as { name?: string } | null)?.name;
  return e instanceof TypeError || name === 'AbortError';
}

/**
 * THE one fetch to our API. Every call to `ADMIN_API` goes through here so it carries the build
 * telemetry headers (`X-App-Version`, …; docs/RELEASES.md §1) and so a `426 app_outdated` /
 * `503 maintenance` answer from ANY endpoint reaches the policy gate. `path` is host-relative, so the
 * headers can never reach another host. The response is returned untouched (its body is still readable).
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${ADMIN_API}${path}`, {
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), ...(await appHeaders()) },
  });
  if (res.status === 426 || res.status === 503) {
    res
      .clone()
      .json()
      .then((body: unknown) => {
        if (isGateResponse(res.status, body)) emitGateSignal({ httpStatus: res.status, body });
      })
      .catch(() => {});
  }
  return res;
}

/**
 * Call the admin backend with the devotee's Firebase ID token attached.
 *
 * On a 401 it retries once with a force-refreshed token, which covers the
 * ordinary case of a token that expired while the app was backgrounded. A
 * second 401 is real — the caller should sign out.
 *
 * Unlike the flags/content fetches, these calls are NOT best-effort: a failure
 * here means the account did not sync, and swallowing it is how you end up
 * with a devotee signed into an app the backend has never heard of.
 */
export async function authedFetch(path: string, init: RequestInit = {}, timeoutMs = 10_000) {
  const send = async (force: boolean) => {
    const token = await getIdToken(force);
    if (!token) throw new ApiError(401, 'not signed in');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await apiFetch(path, {
        ...init,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
          Authorization: `Bearer ${token}`,
        },
      });
    } finally {
      clearTimeout(timer);
    }
  };

  let res = await send(false);
  if (res.status === 401) res = await send(true);

  if (!res.ok) {
    const body = await res
      .json()
      .catch(() => ({}) as { error?: string; detail?: string; code?: string });
    throw new ApiError(
      res.status,
      body.detail || body.error || `${res.status} ${res.statusText}`,
      body.code,
      body,
    );
  }
  // 204 No Content (e.g. leaving an event) has no body to parse.
  if (res.status === 204) return null;
  return res.json();
}

/**
 * Public, read-only calls (coin packs, chadhava offerings) need no token, so
 * they skip `authedFetch` — a devotee must be able to see the price list
 * before the token is ready, and a 401 retry loop makes no sense for them.
 */
export async function publicFetch<T>(path: string, timeoutMs = 10_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await apiFetch(path, { signal: controller.signal });
    if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Read-only, no session — the list is public. */
export async function publicGet<T>(path: string, timeoutMs = 8_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await apiFetch(path, { signal: controller.signal });
    if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export const post = (path: string, body?: unknown) =>
  authedFetch(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
