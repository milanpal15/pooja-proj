import { config } from '../config/env.js';
import { signServiceToken } from './service-jwt.js';

/**
 * The monolith's window onto the identity service (users) - phase 2 of docs/MICROSERVICES.md. Only used when
 * IDENTITY_URL is set; with it unset nothing here is called and the monolith reads its own `users` collection
 * (see `lib/user-directory.js`, the one place that chooses).
 *
 * Design rules (same family as engagement-client.js):
 *   - 5 s timeout; per-uid reads are cached 15 s (names and device ids change rarely) with stale-on-error.
 *   - A NON-CRITICAL read (a display name, a push device id, the `who` column of an admin list) never throws into
 *     the request: it degrades to "absent". After a failure the next 5 s of reads skip the network.
 *   - A CRITICAL read (searching devotees for the wallet lookup) throws a clear 503 `identity_unavailable`.
 *   - A role write is best effort: `User.role` is a convenience copy, re-derived at every sign-in claim.
 *   - Whether the devotee is BLOCKED is not asked here: the mobile BFF checks that at the edge, per request,
 *     failing closed, and vouches for it in the signed token the monolith trusts.
 */

export const TTL_MS = 15_000;
export const RETRY_AFTER_FAIL_MS = 5_000;
export const TIMEOUT_MS = 5_000;

export const identityEnabled = () => Boolean(config.identityUrl);

const users = new Map(); // uid -> { value, at }
let failedAt = 0;
let warnedAt = 0;
let fetchImpl = (...a) => fetch(...a);

/** Test hooks. */
export const _reset = () => { users.clear(); failedAt = 0; warnedAt = 0; };
export const _setFetch = (f) => { fetchImpl = f ?? ((...a) => fetch(...a)); };

function warn(msg) {
  if (Date.now() - warnedAt > 30_000) {
    warnedAt = Date.now();
    console.warn(`! identity unreachable (${msg}) - serving cached/absent user facts`);
  }
}

/** One signed call. Throws on any non-2xx or network failure. */
export async function call(method, path, { body, as, timeoutMs = TIMEOUT_MS } = {}) {
  const token = signServiceToken({ iss: 'monolith', ...(as || {}) }, { secret: config.internalJwtSecret });
  const res = await fetchImpl(`${config.identityUrl}/internal/identity${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, accept: 'application/json', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text.slice(0, 200) }; }
  if (!res.ok) throw Object.assign(new Error(data?.error || `identity ${res.status}`), { status: res.status, body: data });
  return data;
}

const skipNetwork = () => failedAt && Date.now() - failedAt < RETRY_AFTER_FAIL_MS;
const failed = (e) => { failedAt = Date.now(); warn(e.message); };

/** { name, contact, deviceId, role } for one uid, or null (unknown uid, or identity down and nothing cached). */
export async function getUser(uid) {
  if (!uid) return null;
  const hit = users.get(uid);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  if (skipNetwork()) return hit?.value ?? null;
  try {
    const data = await call('GET', `/directory/users/${encodeURIComponent(uid)}`);
    const value = data?.user ?? null;
    users.set(uid, { value, at: Date.now() });
    if (users.size > 2000) users.delete(users.keys().next().value);
    failedAt = 0;
    return value;
  } catch (e) {
    if (e.status === 404) { users.set(uid, { value: null, at: Date.now() }); return null; }
    failed(e);
    return hit?.value ?? null;
  }
}

/** Map uid -> { name, contact } for a set of uids (missing / unreachable uids are simply absent). */
export async function lookupUsers(uids) {
  const want = [...new Set(uids.filter(Boolean))];
  const out = new Map();
  if (!want.length || skipNetwork()) return out;
  try {
    const data = await call('POST', '/directory/lookup', { body: { uids: want } });
    for (const u of data?.users ?? []) out.set(u.uid, { name: u.name || '', contact: u.contact || '' });
    failedAt = 0;
  } catch (e) {
    failed(e);
  }
  return out;
}

/** Wallet lookup: devotees whose name/contact/email/phone match. Throws 503 when identity cannot answer. */
export async function searchUsers(q, as) {
  try {
    return (await call('GET', `/directory/search?q=${encodeURIComponent(q)}`, { as }))?.users ?? [];
  } catch (e) {
    throw Object.assign(new Error('The devotee directory is unavailable right now.'), { status: 503, code: 'identity_unavailable' });
  }
}

/** Best-effort role write (`devotee` | `astrologer`). */
export async function setRole(uid, role) {
  try {
    await call('PUT', `/directory/users/${encodeURIComponent(uid)}/role`, { body: { role } });
    users.delete(uid);
  } catch (e) {
    failed(e);
    console.error(`! could not set the ${role} role for ${uid} in identity: ${e.message} (re-derived at the next sign-in)`);
  }
}
