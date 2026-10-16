import { buildQuery, isPartial } from './places.overpass.js';

const MAX_BREAK_MS = 5 * 60_000;

/**
 * Politely calls the Overpass instances: in order, a per-instance circuit breaker (429 / 5xx / timeout / unusable body opens it for
 * `breakerMs`), and at most `perSecond` upstream calls per second across the whole service (calls are spaced, not dropped).
 *
 * @returns {(cell:{lat:number,lng:number,radius:number}) => Promise<object[]>}  the raw Overpass `elements`; throws when every instance failed
 */
export function createUpstream({ urls, userAgent, timeoutMs, totalMs, breakerMs, perSecond }, { fetchImpl = fetch, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), logger } = {}) {
  const openUntil = new Map(); // url -> epoch ms
  const gap = Math.ceil(1000 / Math.max(0.01, perSecond));
  let nextSlot = 0;

  async function slot() {
    const at = Math.max(now(), nextSlot);
    nextSlot = at + gap;
    if (at > now()) await sleep(at - now());
  }

  async function one(url, body, timeout) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeout);
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': userAgent, accept: 'application/json' },
        body: new URLSearchParams({ data: body }).toString(),
        signal: ac.signal,
      });
      if (!res.ok) {
        const ra = Number(res.headers?.get?.('retry-after'));
        const err = new Error(`HTTP ${res.status}`);
        err.retryAfterMs = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 0;
        throw err;
      }
      let json;
      try { json = JSON.parse(await res.text()); } catch { throw new Error('not JSON'); }
      if (!Array.isArray(json?.elements)) throw new Error('no elements');
      if (isPartial(json)) throw new Error('partial result');
      return json.elements;
    } catch (e) {
      throw ac.signal.aborted ? new Error('timeout') : e;
    } finally {
      clearTimeout(timer);
    }
  }

  return async function fetchElements(cell) {
    const query = buildQuery(cell, Math.ceil(timeoutMs / 1000));
    const deadline = now() + totalMs;
    const errors = [];
    for (const url of urls) {
      if ((openUntil.get(url) ?? 0) > now()) { errors.push(`${new URL(url).host}: breaker open`); continue; }
      if (now() >= deadline) break;
      await slot();
      try {
        const out = await one(url, query, Math.min(timeoutMs + Math.min(3000, Math.round(timeoutMs / 5)), Math.max(1, deadline - now())));
        openUntil.delete(url);
        return out;
      } catch (e) {
        openUntil.set(url, now() + Math.min(MAX_BREAK_MS, Math.max(breakerMs, e.retryAfterMs || 0)));
        errors.push(`${new URL(url).host}: ${e.message}`);
        logger?.warn?.(`places: overpass ${new URL(url).host} failed (${e.message}); skipped for ${Math.round(breakerMs / 1000)}s`);
      }
    }
    const err = new Error(`all Overpass instances failed (${errors.join('; ')})`);
    err.code = 'upstream_failed';
    throw err;
  };
}
