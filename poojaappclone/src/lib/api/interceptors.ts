import { create, type AxiosAdapter, type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios';

import { parseBlock, type BlockInfo } from './block-signal';
import { ApiError } from './errors';
import { isGateResponse, type GateSignal } from './gate-signal';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Attach the devotee's Firebase ID token and retry once on a 401 (see createHttp). */
    authed?: boolean;
    /** @internal set on the single retry after a 401. */
    _retried?: boolean;
    /** @internal the refreshed token the retry must carry. */
    _token?: string;
  }
}

export type HttpDeps = {
  baseURL: string;
  /** Firebase ID token; `force` refreshes it through the Firebase SDK. null = not signed in. */
  getToken: (force: boolean) => Promise<string | null>;
  /** Build telemetry headers (`X-App-Version`, `X-Device-Id`, …). */
  getHeaders: () => Promise<Record<string, string>>;
  emitGate: (s: GateSignal) => void;
  emitBlock: (b: BlockInfo) => void;
  timeout?: number;
  /** Tests only: replaces the network. */
  adapter?: AxiosAdapter;
};

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Map an error response to the ApiError the screens already understand. */
function toApiError(res: AxiosResponse): ApiError {
  const body = isObject(res.data) ? res.data : {};
  const message = (body.detail || body.error || `${res.status} ${res.statusText}`) as string;
  return new ApiError(res.status, message, body.code as string | undefined, body);
}

/**
 * THE axios instance for our API. Every call goes through it, so:
 *  - the request is host-relative ONLY (an absolute / protocol-relative URL is refused before sending),
 *    which is what guarantees the telemetry headers and the bearer token can never reach another host;
 *  - it carries the build telemetry headers (docs/RELEASES.md §1) and, when `authed`, the Firebase ID token;
 *  - a `426 app_outdated` / `503 maintenance` answer reaches the policy gate and a `403 account_blocked` /
 *    `device_blocked` reaches the blocked screen, from ANY call and whether or not the caller treats the
 *    status as an error (an uncoded 403 is not a block);
 *  - a 401 on an authed call force-refreshes the token ONCE (single-flight across parallel calls) and
 *    retries the call once; a second 401 / failed refresh is an ApiError(401) and the caller signs out;
 *  - every non-2xx becomes an ApiError. Requests that got no response keep their AxiosError
 *    (`isOffline` recognises them). Nothing here logs a token or a header.
 */
export function createHttp(deps: HttpDeps): AxiosInstance {
  const http = create({
    baseURL: deps.baseURL,
    timeout: deps.timeout ?? 10_000,
    allowAbsoluteUrls: false,
    ...(deps.adapter ? { adapter: deps.adapter } : {}),
  });

  http.interceptors.request.use(async (config) => {
    const url = config.url ?? '';
    if (!url.startsWith('/') || url.startsWith('//') || url.startsWith('/\\')) {
      throw new Error('api: request path must be host-relative (start with a single "/")');
    }
    // Telemetry wins over a caller header of the same name; a caller's own Authorization is kept.
    config.headers.set(await deps.getHeaders());
    if (config.authed) {
      const token = config._token ?? (await deps.getToken(false));
      if (!token) throw new ApiError(401, 'not signed in');
      if (!config.headers.has('Content-Type')) config.headers.set('Content-Type', 'application/json');
      config.headers.set('Authorization', `Bearer ${token}`);
    }
    return config;
  });

  /** Signals fire for every response, success or failure, before anything else happens to it. */
  const signal = (res: AxiosResponse) => {
    try {
      if (res.status === 426 || res.status === 503) {
        if (isGateResponse(res.status, res.data)) deps.emitGate({ httpStatus: res.status, body: res.data });
      } else if (res.status === 403) {
        const block = parseBlock(403, res.data);
        if (block) deps.emitBlock(block);
      }
    } catch {
      // a listener must never break the request that triggered it
    }
  };

  // Single flight: N parallel 401s share ONE force refresh.
  let refreshing: Promise<string | null> | null = null;
  const refresh = () =>
    (refreshing ??= deps
      .getToken(true)
      .catch(() => null)
      .finally(() => {
        refreshing = null;
      }));

  const canRefresh = (res: AxiosResponse) => res.status === 401 && !!res.config.authed && !res.config._retried;

  async function retryWithFreshToken(config: AxiosRequestConfig): Promise<AxiosResponse> {
    const token = await refresh();
    if (!token) throw new ApiError(401, 'not signed in');
    return http.request({ ...config, _retried: true, _token: token });
  }

  http.interceptors.response.use(
    (res) => {
      signal(res);
      return canRefresh(res) ? retryWithFreshToken(res.config) : res;
    },
    (err: unknown) => {
      const res = (err as { response?: AxiosResponse } | null)?.response;
      if (!res) throw err; // no response: network / timeout / abort / our own ApiError
      signal(res);
      if (canRefresh(res)) return retryWithFreshToken(res.config);
      throw toApiError(res);
    },
  );

  return http;
}
