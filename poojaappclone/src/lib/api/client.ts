import type { AxiosRequestConfig } from 'axios';

import { API_URL } from '@/constants/config';
import { appHeaders } from '@/lib/app-info';
import { getIdToken } from '@/lib/firebase-auth';

import { emitBlockSignal } from './block-signal';
import { ApiError, isOffline } from './errors';
import { emitGateSignal } from './gate-signal';
import { createHttp } from './interceptors';

export { ApiError, isOffline };

/**
 * THE axios instance for our API (see `createHttp` in ./interceptors for what the interceptors do).
 * Paths are host-relative, so the telemetry headers and the bearer token can never reach another host.
 */
export const http = createHttp({
  baseURL: API_URL,
  getToken: getIdToken,
  getHeaders: appHeaders,
  emitGate: emitGateSignal,
  emitBlock: emitBlockSignal,
});

export type ApiResult<T = unknown> = {
  status: number;
  statusText: string;
  ok: boolean;
  /** Parsed JSON; '' for an empty body, the raw text if the body was not JSON. */
  data: T;
  /** Lower-cased header names. */
  headers: Record<string, string | undefined>;
};

/**
 * A raw call for best-effort reads (flags, content, policy, …) that do their own status handling:
 * NO status is an error, so a 4xx/5xx comes back as `{ ok: false, status }` instead of throwing. A call that
 * never got a response (offline / timeout / abort) still rejects — see `isOffline`. The gate and block signals
 * still fire. Not authed: pass your own `Authorization` header if you need one.
 */
export async function apiRequest<T = unknown>(
  path: string,
  config: Pick<AxiosRequestConfig, 'method' | 'data' | 'headers' | 'signal' | 'timeout'> = {},
): Promise<ApiResult<T>> {
  const res = await http.request<T>({ ...config, url: path, validateStatus: () => true });
  return {
    status: res.status,
    statusText: res.statusText,
    ok: res.status >= 200 && res.status < 300,
    data: res.data,
    headers: (res.headers as { toJSON?: () => Record<string, string> }).toJSON?.() ?? {},
  };
}

/**
 * Call the admin backend with the devotee's Firebase ID token attached.
 *
 * On a 401 the interceptor force-refreshes the token once (shared by parallel calls) and retries once, which
 * covers a token that expired while the app was backgrounded. A second 401 is real — the caller should sign out.
 *
 * Unlike the flags/content fetches, these calls are NOT best-effort: a failure here means the account did not
 * sync, and swallowing it is how you end up with a devotee signed into an app the backend has never heard of.
 * Returns the parsed JSON, or null for 204 No Content (e.g. leaving an event). Throws ApiError.
 */
export async function authedFetch(path: string, init: RequestInit = {}, timeoutMs = 10_000) {
  const res = await http.request({
    url: path,
    method: init.method ?? 'GET',
    // A JSON string is sent as-is (Content-Type: application/json is set by the interceptor).
    data: init.body ?? undefined,
    headers: init.headers as Record<string, string> | undefined,
    signal: (init.signal ?? undefined) as AxiosRequestConfig['signal'],
    timeout: timeoutMs,
    authed: true,
  });
  if (res.status === 204) return null;
  return res.data;
}

/**
 * Public, read-only calls (coin packs, chadhava offerings) need no token, so they skip the authed path — a
 * devotee must be able to see the price list before the token is ready, and a 401 retry makes no sense for them.
 */
export async function publicFetch<T>(path: string, timeoutMs = 10_000): Promise<T> {
  return (await http.get<T>(path, { timeout: timeoutMs })).data;
}

/** Read-only, no session — the list is public. */
export async function publicGet<T>(path: string, timeoutMs = 8_000): Promise<T> {
  return (await http.get<T>(path, { timeout: timeoutMs })).data;
}

export const post = (path: string, body?: unknown) =>
  authedFetch(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
