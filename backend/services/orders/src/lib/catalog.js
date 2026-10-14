import { signServiceToken } from '@bhakti/common';

import { HttpError } from './http-error.js';

/**
 * The orders service's window onto the catalog (docs/MICROSERVICES.md section 2: orders -> catalog). Port of the monolith's
 * lib/catalog-client.js with the same two rules, which are the point of the file:
 *
 *   CRITICAL (a purchase): `poojaForBooking`, `chadhavaForOrder`. The price a devotee pays comes from here. NO cache, NO stale answer,
 *     NO default: catalog unreachable / slow / refusing = HttpError 503 `catalog_unavailable` BEFORE any coin moves - never a 500 and never
 *     yesterday's price. A 404 is the same "not available" the monolith gave for a pooja that is not there. A client price is never an input.
 *
 *   NON-CRITICAL: `poojaExists` (the public reviews route checks the pooja is there). 15 s cache; catalog down = assume it is (an unknown
 *     slug then yields an empty list instead of a 404).
 *
 * Signed `iss orders`; catalog's `/pricing/*` accepts monolith, pooja-api and orders.
 */
export const TTL_MS = 15_000;
const orUndef = (v) => (v === null ? undefined : v);

export function createCatalogClient(config, { fetchImpl, logger } = {}) {
  const doFetch = fetchImpl ?? ((...a) => fetch(...a));
  const cache = new Map();

  async function get(path) {
    const token = signServiceToken({ iss: 'orders' }, { secret: config.secret });
    let res;
    try {
      res = await doFetch(`${config.catalogUrl}/internal/catalog${path}`, {
        headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
        signal: AbortSignal.timeout(config.serviceTimeoutMs),
      });
    } catch (e) {
      throw Object.assign(new Error(e?.message || 'catalog unreachable'), { network: true });
    }
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = null; }
    if (!res.ok) throw Object.assign(new Error(body?.error || `catalog ${res.status}`), { status: res.status, body });
    // A 200 nobody can read is not "that pooja is not available": it is a catalog that is not answering properly.
    if (body === null || typeof body !== 'object') throw Object.assign(new Error('catalog answered with something unreadable'), { network: true });
    return body;
  }

  const unavailable = () => new HttpError(503, 'catalog_unavailable', 'This is temporarily unavailable. Please try again in a moment.');

  async function critical(path) {
    try {
      return await get(path);
    } catch (e) {
      if (e.status === 404) return null;
      logger?.error(`catalog unavailable for a purchase (${e.status ?? 'network'}: ${e.message}) - refusing`);
      throw unavailable();
    }
  }

  return {
    /** `{ pooja, temple }` shaped like the lean Pooja + Temple the booking code always used, or null when the pooja is not available. */
    async poojaForBooking(slug) {
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
    },
    /** `{ listing, temple }` or null. `startsAt` / `endsAt` are Dates. */
    async chadhavaForOrder(slug) {
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
    },
    /** Is that pooja published and enabled? Degrades to `true` when catalog cannot answer. */
    async poojaExists(slug) {
      const key = `exists:${slug}`;
      const hit = cache.get(key);
      if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
      try {
        const value = Boolean((await get(`/pricing/pooja/${encodeURIComponent(String(slug))}/exists`))?.exists);
        if (cache.size > 500) cache.clear();
        cache.set(key, { at: Date.now(), value });
        return value;
      } catch (e) {
        logger?.warn(`catalog unreachable (${e.status ?? 'network'}) - not checking that the pooja exists`);
        return true;
      }
    },
    _reset: () => cache.clear(),
  };
}
