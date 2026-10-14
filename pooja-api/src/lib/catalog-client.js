import { config } from '../config/env.js';
import { HttpError } from './http-error.js';
import { signServiceToken } from './service-jwt.js';

/**
 * The monolith's window onto the catalog service (phase 3 of docs/MICROSERVICES.md). Only used when CATALOG_URL is set;
 * with it unset nothing here is called and the monolith reads its own collections exactly as before.
 *
 * Two kinds of read, with OPPOSITE failure rules - this split is the point of the file:
 *
 *   CRITICAL (a purchase): `poojaForBooking`, `chadhavaForOrder`. The price a devotee pays comes from here. No cache, no
 *     stale answer, no default: catalog unreachable / slow / refusing = HttpError 503 `catalog_unavailable` ("try again
 *     in a moment"), never a 500 and never yesterday's price. A 404 from catalog is the same answer the monolith gave for
 *     a pooja that is not available. A client price is never an input to any of this.
 *
 *   NON-CRITICAL: `poojaExists` (the public reviews route checks the pooja is there). 5 s timeout, 15 s cache, and when
 *     catalog is down the answer degrades to "assume it is" (an unknown slug then returns an empty list instead of 404).
 *
 * Calls are signed with iss `monolith` like every other client in this app (engagement, identity); catalog accepts
 * `monolith` and `pooja-api` alike.
 */
export const TTL_MS = 15_000;
export const TIMEOUT_MS = 5_000;

export const catalogEnabled = () => Boolean(config.catalogUrl);

let fetchImpl = (...a) => fetch(...a);
const cache = new Map(); // key -> { at, value }

/** Test hooks. */
export const _reset = () => cache.clear();
export const _setFetch = (f) => { fetchImpl = f ?? ((...a) => fetch(...a)); };

/** One signed GET. Throws `{ status, body }` for a non-2xx answer and `{ network: true }` for anything else. */
async function get(path) {
  const token = signServiceToken({ iss: 'monolith' }, { secret: config.internalJwtSecret });
  let res;
  try {
    res = await fetchImpl(`${config.catalogUrl}/internal/catalog${path}`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw Object.assign(new Error(e?.message || 'catalog unreachable'), { network: true });
  }
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!res.ok) throw Object.assign(new Error(body?.error || `catalog ${res.status}`), { status: res.status, body });
  return body;
}

const unavailable = () =>
  new HttpError(503, 'catalog_unavailable', 'This is temporarily unavailable. Please try again in a moment.');

/** Run a critical read: 404 -> null (the caller says "not available"); anything else that is not an answer -> 503. */
async function critical(path) {
  try {
    return await get(path);
  } catch (e) {
    if (e.status === 404) return null;
    console.error(`! catalog unavailable for a purchase (${e.status ?? 'network'}: ${e.message}) - refusing`);
    throw unavailable();
  }
}

const orUndef = (v) => (v === null ? undefined : v);

/**
 * The priced snapshot a booking is made from, shaped like the lean `Pooja` document + its temple the booking code always
 * used (dates as Date objects, absent text as undefined), or null when the pooja is not available.
 */
export async function poojaForBooking(slug) {
  const out = await critical(`/pricing/pooja/${encodeURIComponent(String(slug))}`);
  if (!out?.pooja) return null;
  const p = out.pooja;
  return {
    pooja: {
      ...p,
      titleHi: orUndef(p.titleHi),
      templeSlug: orUndef(p.templeSlug),
      publishAt: p.publishAt ? new Date(p.publishAt) : null,
      bookingClosesAt: p.bookingClosesAt ? new Date(p.bookingClosesAt) : null,
      packages: p.packages.map((k) => ({ ...k, name: orUndef(k.name), nameHi: orUndef(k.nameHi) })),
    },
    temple: out.temple,
  };
}

/** Same for a chadhava listing: `{ listing, temple }` or null. `startsAt` / `endsAt` are Dates. */
export async function chadhavaForOrder(slug) {
  const out = await critical(`/pricing/chadhava/${encodeURIComponent(String(slug))}`);
  if (!out?.listing) return null;
  const l = out.listing;
  return {
    listing: {
      ...l,
      titleHi: orUndef(l.titleHi),
      templeSlug: orUndef(l.templeSlug),
      startsAt: l.startsAt ? new Date(l.startsAt) : null,
      endsAt: l.endsAt ? new Date(l.endsAt) : null,
      offerings: l.offerings.map((o) => ({ ...o, title: orUndef(o.title) })),
    },
    temple: out.temple,
  };
}

/** Is that pooja published and enabled? Degrades to `true` when catalog cannot answer (see the header). */
export async function poojaExists(slug) {
  const key = `exists:${slug}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  try {
    const value = Boolean((await get(`/pricing/pooja/${encodeURIComponent(String(slug))}/exists`))?.exists);
    if (cache.size > 500) cache.clear();
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch (e) {
    console.warn(`! catalog unreachable (${e.status ?? 'network'}) - not checking that the pooja exists`);
    return true;
  }
}
