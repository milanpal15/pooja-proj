/**
 * HTTP client for calling another service.
 *
 *  - base URL per client, per-call timeout (default 5 s)
 *  - signs a fresh service JWT per call (`iss` = this service)
 *  - propagates `x-request-id`
 *  - ONE retry, only for idempotent GETs, only on connection errors / 502 / 503 / 504
 *  - tiny circuit breaker: opens after 5 consecutive failures, half-open (one probe) after 10 s
 *  - non-2xx replies become a typed ServiceError carrying the upstream `{error, code, ...}` body
 *
 * "Failure" for the breaker means connection error, timeout, or 502/503/504 — a 4xx is the
 * caller's mistake or a business answer (402 insufficient_coins), never a sick service.
 */
import { ServiceError } from './errors.js';
import { signServiceToken } from './jwt.js';

const RETRYABLE_STATUS = new Set([502, 503, 504]);
/** The `code`s that mean "this service (or a proxy in front of it) is sick", as opposed to a business answer that happens to be a 503. */
const INFRA_CODES = new Set(['upstream_unavailable', 'upstream_timeout', 'circuit_open', 'service_unavailable', 'internal']);

export class CircuitBreaker {
  constructor({ threshold = 5, cooldownMs = 10_000, now = () => Date.now() } = {}) {
    this.threshold = threshold;
    this.cooldownMs = cooldownMs;
    this.now = now;
    this.failures = 0;
    this.openedAt = 0;
    this.probing = false;
  }

  get state() {
    if (this.failures < this.threshold) return 'closed';
    return this.now() - this.openedAt >= this.cooldownMs ? 'half-open' : 'open';
  }

  /** True when a call may go ahead. In half-open exactly one probe is let through. */
  allow() {
    const s = this.state;
    if (s === 'closed') return true;
    if (s === 'open') return false;
    if (this.probing) return false;
    this.probing = true;
    return true;
  }

  success() {
    this.failures = 0;
    this.probing = false;
  }

  failure() {
    this.failures += 1;
    this.probing = false;
    if (this.failures >= this.threshold) this.openedAt = this.now();
  }
}

/**
 * @param {object} o
 * @param {string} o.service   name of the callee (for errors/logs)
 * @param {string} o.baseUrl
 * @param {string} o.iss       name of THIS service (JWT issuer)
 * @param {string} o.secret    INTERNAL_JWT_SECRET
 * @param {number} [o.timeoutMs]
 * @param {boolean} [o.codedErrorsAreAnswers]  a 502/503/504 whose body carries a business `code` (orders answering `503 wallet_unavailable`
 *        because ITS dependency is down) is an ANSWER: not retried, not counted against the breaker. Without it every 502/503/504 is a sick service.
 */
export function createServiceClient({ service, baseUrl, iss, secret, timeoutMs = 5000, breaker, fetchImpl = fetch, codedErrorsAreAnswers = false }) {
  const base = baseUrl.replace(/\/+$/, '');
  const cb = breaker || new CircuitBreaker();

  async function attempt(url, init, timeout) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeout);
    try {
      const res = await fetchImpl(url, { ...init, signal: ac.signal });
      const text = await res.text();
      let data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = { error: text.slice(0, 200) };
        }
      }
      const auditDetail = res.headers?.get?.('x-audit-detail');
      return { status: res.status, data, ...(auditDetail ? { auditDetail } : {}) };
    } catch (e) {
      if (ac.signal.aborted) {
        throw new ServiceError(504, { error: 'upstream_timeout', code: 'upstream_timeout' }, service);
      }
      throw new ServiceError(502, { error: 'upstream_unavailable', code: 'upstream_unavailable' }, service);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * @param {string} method
   * @param {string} path  e.g. `/internal/wallet/debit`
   * @param {object} [opts]
   * @param {object} [opts.query]
   * @param {*}      [opts.body]   JSON-serialisable
   * @param {string} [opts.reqId]
   * @param {{sub?:string, role?:string, perms?:string[]}} [opts.as]  claims to forward
   * @param {number} [opts.timeoutMs]
   * @param {boolean} [opts.full]  resolve `{ status, data, auditDetail }` instead of just `data` - for a caller that must relay a 201 vs a 200 (`auditDetail`: the reply's `x-audit-detail` header, if any)
   */
  async function request(method, path, opts = {}) {
    if (!cb.allow()) {
      throw new ServiceError(503, { error: 'service_unavailable', code: 'circuit_open' }, service);
    }
    const qs = opts.query ? new URLSearchParams(opts.query).toString() : '';
    const url = `${base}${path}${qs ? `?${qs}` : ''}`;
    const m = method.toUpperCase();
    const maxAttempts = m === 'GET' ? 2 : 1;
    let last;

    for (let i = 0; i < maxAttempts; i++) {
      const token = signServiceToken({ iss, ...(opts.as || {}), reqId: opts.reqId }, { secret });
      const headers = { authorization: `Bearer ${token}`, accept: 'application/json' };
      if (opts.reqId) headers['x-request-id'] = opts.reqId;
      if (opts.body !== undefined) headers['content-type'] = 'application/json';
      try {
        const out = await attempt(
          url,
          { method: m, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined },
          opts.timeoutMs ?? timeoutMs,
        );
        const answering = codedErrorsAreAnswers && typeof out.data?.code === 'string' && !INFRA_CODES.has(out.data.code);
        if (RETRYABLE_STATUS.has(out.status) && !answering) {
          last = new ServiceError(out.status, out.data || { error: 'upstream_unavailable' }, service);
          continue;
        }
        cb.success();
        if (out.status >= 400) throw new ServiceError(out.status, out.data || { error: 'Service error.' }, service);
        return opts.full ? { status: out.status, data: out.data, ...(out.auditDetail ? { auditDetail: out.auditDetail } : {}) } : out.data;
      } catch (e) {
        if (!(e instanceof ServiceError)) throw e;
        if (e.status === 502 || e.status === 504) {
          last = e;
          continue; // connection error / timeout: retry if GET and attempts remain
        }
        throw e; // a real 4xx/5xx answer (breaker already marked healthy)
      }
    }
    cb.failure();
    throw last;
  }

  return {
    service,
    breaker: cb,
    request,
    get: (path, o) => request('GET', path, o),
    post: (path, body, o) => request('POST', path, { ...o, body }),
    put: (path, body, o) => request('PUT', path, { ...o, body }),
    patch: (path, body, o) => request('PATCH', path, { ...o, body }),
    delete: (path, o) => request('DELETE', path, o),
  };
}
