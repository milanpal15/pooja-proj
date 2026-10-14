import crypto from 'node:crypto';

/**
 * Who is this operator? Transitional (phase 1): the session cookie is still issued and verified by the
 * monolith, so the admin BFF asks it - `GET /api/admin/session` with the forwarded cookie - and takes
 * { role, permissions } from the answer. Identity is extracted in a later phase; this module is the seam.
 *
 * Authenticated answers are cached 30 s, keyed by a SHA-256 of the cookie header (the cookie itself is never
 * kept as a key or logged). Consequence, accepted: a demotion or sign-out reaches the routes served here up to
 * 30 s late (the monolith applies it on the very next request). Failures are never cached.
 */
export const SESSION_TTL_MS = 30_000;

export function createSessionResolver({ monolithUrl, timeoutMs = 5000, ttlMs = SESSION_TTL_MS, fetchImpl = fetch, now = () => Date.now() }) {
  const cache = new Map(); // hash -> { at, operator }
  const target = new URL('/api/admin/session', monolithUrl).toString();

  const prune = () => {
    if (cache.size < 500) return;
    for (const [k, v] of cache) if (now() - v.at >= ttlMs) cache.delete(k);
    if (cache.size >= 500) cache.clear();
  };

  /**
   * @returns {Promise<{ok:true, operator:{username:string|null, role:string, permissions:string[]}} | {ok:false, status:number, body:object}>}
   */
  async function resolve(req) {
    const cookie = req.headers.cookie || '';
    const key = crypto.createHash('sha256').update(cookie).digest('hex');
    const hit = cache.get(key);
    if (hit && now() - hit.at < ttlMs) return { ok: true, operator: hit.operator };

    let res;
    try {
      res = await fetchImpl(target, {
        headers: { accept: 'application/json', ...(cookie ? { cookie } : {}), 'x-forwarded-for': req.ip || '' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      return { ok: false, status: 502, body: { error: 'upstream_unavailable', code: 'upstream_unavailable' } };
    }
    if (!res.ok) return { ok: false, status: 502, body: { error: 'upstream_unavailable', code: 'upstream_unavailable' } };
    const s = await res.json().catch(() => null);
    if (!s?.authed) return { ok: false, status: 401, body: { error: 'Sign in required' } };
    const operator = { username: s.username ?? null, role: s.role, permissions: Array.isArray(s.permissions) ? s.permissions : [] };
    prune();
    cache.set(key, { at: now(), operator });
    return { ok: true, operator };
  }

  return { resolve, _size: () => cache.size };
}
