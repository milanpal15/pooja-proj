import { permissionsFor } from './access/permissions.js';

/**
 * Who is this operator? (identity phase) The cookie is verified HERE (admin BFF); the operator RECORD is read from the
 * identity service - role and `active` from the record on every request, never from the cookie, so a demotion takes effect
 * on the next call. To keep that from being one extra hop per click, a positive answer is cached `ttlMs` (default 5 s)
 * per operator id (and "no cookie, sign-in required" under one shared key); this BFF drops the entry when an operator write passes through it. Accepted consequence: a demotion
 * made through ANOTHER admin-bff instance reaches here up to `ttlMs` late. Other negative answers and failures are never cached.
 *
 * Roles (docs/ROLES.md): `permissions` is what identity resolved from the role STORE (built-ins from code, custom roles from the database), so an edit to a
 * role reaches a signed-in operator within `ttlMs` (5 s here, well inside the contract's 30 s ceiling) with no re-login; this same list feeds the route gate AND
 * the permissions signed for the services. Role writes that pass through this BFF drop the cache at once (identity-mount.js).
 *
 * `resolve(req)` has the shape engagementAdminRouter already uses, so the same gate serves every route family.
 */
export const IDENTITY_SESSION_TTL_MS = 5_000;
export const LOCKED = { error: 'The dashboard is locked: no active operator exists.', code: 'no_operators' };
const UNAVAILABLE = { error: 'identity_unavailable', code: 'identity_unavailable' };

export function createOperatorSessions({ client, cookies, isProduction = false, ttlMs = IDENTITY_SESSION_TTL_MS, now = () => Date.now(), logger }) {
  const cache = new Map(); // operator id -> { at, state }

  /** identity's `/operators/session` answer for this cookie, or { error }. */
  async function state(req) {
    const s = cookies.sessionOf(req);
    const id = s?.uid ? String(s.uid) : '';
    const key = id || '-'; // '-' = no (valid) cookie: only the "sign-in is required" answer is remembered, so a flood of cookie-less requests is not a flood of identity lookups
    const hit = cache.get(key);
    if (hit && now() - hit.at < ttlMs) return { s, state: hit.state };
    try {
      const st = await client.get('/internal/identity/operators/session', { query: { id }, reqId: req.id, timeoutMs: 2500 });
      if (st?.required && (st?.authed || !id)) {
        if (cache.size > 500) cache.clear();
        cache.set(key, { at: now(), state: st });
      }
      return { s, state: st };
    } catch (e) {
      logger?.warn(`identity session lookup failed: ${e?.code || e?.message}`, { reqId: req.id });
      return { s, error: true };
    }
  }

  return {
    state,

    /** @returns {Promise<{ok:true, operator:{id,username,role,permissions}} | {ok:false,status:number,body:object}>} */
    async resolve(req) {
      const r = await state(req);
      if (r.error) return { ok: false, status: 503, body: UNAVAILABLE };
      if (r.state?.required === false) {
        // No operator exists. Production never opens, even now: a restored backup that leaves no active operator would
        // otherwise leave the whole admin API open. Dev opens (a database nobody has set up yet).
        if (isProduction) return { ok: false, status: 503, body: LOCKED };
        return { ok: true, operator: { id: 'local-dev', username: 'local-dev', role: 'admin', permissions: permissionsFor('admin') } };
      }
      if (!r.s || !r.state?.authed) return { ok: false, status: 401, body: { error: 'Sign in required' } };
      const { id, username, role, roleName, permissions } = r.state;
      return { ok: true, operator: { id, username, role, ...(roleName ? { roleName } : {}), permissions: Array.isArray(permissions) ? permissions : [] } };
    },

    invalidate: (id) => (id ? cache.delete(String(id)) : cache.clear()),
    _size: () => cache.size,
  };
}
