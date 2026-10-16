import { createLimiter } from '@bhakti/common';

import { HttpError } from '../../lib/http-error.js';
import { Temple } from '../../models.js';
import { cell as cellOf, haversine, parseParams } from './places.geo.js';
import { PlaceCache } from './places.model.js';
import { ATTRIBUTION, normalise } from './places.overpass.js';
import { createUpstream } from './places.upstream.js';

export const MAX_RESULTS = 80;
export const DEDUPE_M = 150;
const MAX_STORED = 1500;
const DAY = 86_400_000;

/**
 * GET /api/places/temples. See docs/TEMPLE_MAP.md.
 * @param {object} config  config.js (places* keys)
 * @param {{fetchImpl?:Function, now?:()=>number, sleep?:Function, logger?:object, managed?:()=>Promise<{lat:number,lng:number}[]>}} [deps]
 */
export function createPlacesService(config, { fetchImpl, now = () => Date.now(), sleep, logger, managed } = {}) {
  const upstream = createUpstream(
    {
      urls: config.overpassUrls, userAgent: config.placesUserAgent, timeoutMs: config.placesTimeoutMs,
      totalMs: config.placesTotalMs, breakerMs: config.placesBreakerMs, perSecond: config.placesUpstreamPerSec,
    },
    { fetchImpl, now, sleep, logger },
  );
  const limiter = createLimiter({ max: config.placesRatePerMin, windowMs: 60_000, now });
  const inflight = new Map(); // cache key -> Promise<{ places, fetchedAt }>

  /** Dashboard temples that have a map position. */
  const managedPins = managed ?? (async () => (await Temple.find({ enabled: { $ne: false }, lat: { $type: 'number' }, lng: { $type: 'number' } }, { lat: 1, lng: 1 }).lean()));

  function checkRate(clientId) {
    const gate = limiter.check(clientId);
    if (gate.blocked) throw new HttpError(429, 'too_fast', 'Too many map requests. Try again in a moment.', { retryAfterSec: gate.retryAfterSec });
    limiter.fail(clientId); // counts the request
  }

  async function refresh(c) {
    const elements = await upstream(c);
    const t = now();
    const all = normalise(elements)
      .map((p) => ({ p, d: haversine(c.lat, c.lng, p.lat, p.lng) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, MAX_STORED)
      .map((x) => x.p);
    const fetchedAt = new Date(t);
    try {
      await PlaceCache.updateOne(
        { key: c.key },
        { $set: { lat: c.lat, lng: c.lng, radius: c.radius, places: all, fetchedAt, expiresAt: new Date(t + config.placesCacheDays * DAY), purgeAt: new Date(t + (config.placesCacheDays + config.placesStaleDays) * DAY) } },
        { upsert: true },
      );
    } catch (e) {
      logger?.warn?.(`places: cache write failed: ${e.message}`); // the answer is still good
    }
    return { places: all, fetchedAt };
  }

  /** One in-flight upstream fetch per cache key, however many requests are waiting on it. */
  function coalesced(c) {
    let p = inflight.get(c.key);
    if (!p) {
      p = refresh(c).finally(() => inflight.delete(c.key));
      inflight.set(c.key, p);
    }
    return p;
  }

  async function temples(query, { clientId = 'anonymous' } = {}) {
    const req = parseParams(query);
    checkRate(clientId);
    const c = cellOf(req.lat, req.lng, req.radius);

    const row = await PlaceCache.findOne({ key: c.key }).lean();
    let places; let cachedAt; let stale = false;
    if (row && row.expiresAt.getTime() > now()) {
      ({ places } = row);
      cachedAt = row.fetchedAt;
    } else {
      try {
        const got = await coalesced(c);
        places = got.places;
        cachedAt = null; // freshly fetched, not from the cache
      } catch (e) {
        if (!row) {
          logger?.warn?.(`places: unavailable, nothing cached: ${e.message}`);
          throw new HttpError(503, 'places_unavailable', 'Nearby temples are unavailable right now.');
        }
        logger?.warn?.(`places: serving stale ${c.key}: ${e.message}`);
        ({ places } = row);
        cachedAt = row.fetchedAt;
        stale = true;
      }
    }

    const pins = await managedPins().catch(() => []);
    const list = [];
    for (const p of places) {
      const distanceM = haversine(req.lat, req.lng, p.lat, p.lng);
      if (distanceM > req.radius) continue;
      if (pins.some((m) => haversine(m.lat, m.lng, p.lat, p.lng) <= DEDUPE_M)) continue;
      list.push({ ...p, distanceM: Math.round(distanceM) });
    }
    list.sort((a, b) => a.distanceM - b.distanceM || (a.id < b.id ? -1 : 1));
    return {
      temples: list.slice(0, MAX_RESULTS),
      center: { lat: req.lat, lng: req.lng, radius: req.radius },
      attribution: ATTRIBUTION,
      source: 'openstreetmap',
      cachedAt: cachedAt ? new Date(cachedAt).toISOString() : null,
      stale,
    };
  }

  return { temples };
}
