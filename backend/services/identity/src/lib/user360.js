import { ServiceError } from '@bhakti/common';

/**
 * The 360 fan-out (docs/USERS.md principle 3): every section is fetched in parallel, each with its own timeout; one that is slow, down,
 * not configured or not permitted becomes `{ unavailable:true, reason }` and the others still arrive. Nothing here ever throws to the page.
 *
 * reason: 'timeout' | 'not_configured' | 'forbidden' (the operator lacks the area's view right) | 'upstream_error'
 */
export const RECENT = 10;

export function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('section timed out'), { code: 'timeout' })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function reasonOf(e) {
  if (e?.code === 'timeout' || e?.status === 504) return 'timeout';
  if (e?.code === 'not_configured') return 'not_configured';
  if (e instanceof ServiceError && e.status === 403) return 'upstream_forbidden';
  return 'upstream_error';
}

/** Run `fn` for one section. `allowed: false` = the operator may not see this area (never even asked). */
export async function section({ allowed = true, timeoutMs, fn, logger, name }) {
  if (!allowed) return { unavailable: true, reason: 'forbidden' };
  try {
    return await withTimeout(Promise.resolve().then(fn), timeoutMs);
  } catch (e) {
    if (e?.code !== 'not_configured') logger?.warn(`user 360: ${name} unavailable (${e?.code || e?.message})`);
    return { unavailable: true, reason: reasonOf(e) };
  }
}

const list = (v) => (Array.isArray(v) ? v.slice(0, RECENT) : []);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/* Defensive shaping: a downstream service is trusted for its data, not for its shape. */
export const shapeWallet = (d) => ({ balance: num(d?.balance), recent: list(d?.recent) });
export const shapeOrders = (d) => ({ total: num(d?.total), recent: list(d?.recent) });
export const shapeCalls = (d) => ({ total: num(d?.total), recent: list(d?.recent) });
export const shapeEvents = (d) => ({ registrations: list(d?.registrations), badges: list(d?.badges) });
