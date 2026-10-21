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
 * True when the request never reached the server (no signal, DNS, timeout, aborted).
 * axios reports those as an AxiosError WITHOUT a `response` (`ERR_NETWORK`, `ECONNABORTED`/`ETIMEDOUT`,
 * `ERR_CANCELED`); the old fetch-era shapes (TypeError, AbortError) still count. An HTTP error status
 * is an ApiError instead and is NOT offline. Duck-typed so this module needs no axios import.
 */
export function isOffline(e: unknown): boolean {
  if (e instanceof ApiError) return false;
  const x = e as { name?: string; isAxiosError?: boolean; response?: unknown } | null;
  if (x && x.isAxiosError === true) return !x.response;
  return e instanceof TypeError || x?.name === 'AbortError';
}
