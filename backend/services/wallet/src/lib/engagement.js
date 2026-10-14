import { createServiceClient } from '@bhakti/common';

import { HttpError } from './http-error.js';

/**
 * The wallet's window onto the engagement service (the `Setting` table: the coin rate and the billing rules).
 *
 * Unlike the monolith's / catalog's reader this one NEVER substitutes a default for "I could not ask": the coin rate and the
 * billing rules move money, so when engagement cannot answer the read FAILS (503 `settings_unavailable`) instead of guessing.
 * (A key that is simply absent from a map that WAS read still gets the documented default - that is operator state, not a guess.)
 *
 *   map({ fresh: true })  at most TTL_MS old, else asks; unreachable = throws.            Used for every WRITE-side decision
 *                         (validating a pack's price against the rate, the billing-rules screen).
 *   map()                 the last answer of ANY age if there is one, else asks (throws if it cannot). Used for a DISPLAY derived
 *                         from the rate (the pack list's "50% EXTRA" labels): credited coins never depend on it.
 */
export const TTL_MS = 15_000;

const unavailable = () => new HttpError(503, 'settings_unavailable', 'Settings are unavailable right now. Please try again in a moment.');

export function createSettingsReader(config, { fetchImpl, logger, now = () => Date.now() } = {}) {
  const client = createServiceClient({
    service: 'engagement',
    baseUrl: config.engagementUrl,
    iss: 'wallet',
    secret: config.secret,
    timeoutMs: config.serviceTimeoutMs,
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  let value;
  let at = 0;
  let inflight = null;

  async function load() {
    const data = await client.get('/internal/engagement/settings/map');
    value = (data && typeof data.settings === 'object' && data.settings) || {};
    at = now();
  }

  async function map({ fresh = false } = {}) {
    if (value !== undefined && (fresh ? now() - at < TTL_MS : true)) {
      // Stale-but-known display reads still refresh in the background once the TTL has passed.
      if (!fresh && now() - at >= TTL_MS && !inflight) {
        inflight = load().catch((e) => logger?.warn(`engagement settings unreachable (${e?.code || e?.message}): serving the last answer`)).finally(() => { inflight = null; });
      }
      return value;
    }
    inflight ??= load().finally(() => { inflight = null; });
    try {
      await inflight;
    } catch (e) {
      logger?.warn(`engagement settings unreachable (${e?.code || e?.message}): refusing rather than guessing`);
      throw unavailable();
    }
    return value;
  }

  const get = async (key, fallback = '', o) => (await map(o))[key] ?? fallback;
  const getNumber = async (key, fallback, o) => {
    const raw = String(await get(key, '', o)).trim();
    const n = Number(raw);
    return raw !== '' && Number.isFinite(n) ? n : fallback;
  };
  const getBool = async (key, fallback, o) => {
    const v = String(await get(key, '', o)).trim().toLowerCase();
    if (v === 'true' || v === '1' || v === 'yes') return true;
    if (v === 'false' || v === '0' || v === 'no') return false;
    return fallback;
  };
  /** Write settings (the billing rules) with the operator's claims; engagement re-checks `money:edit`. Drops the cache. */
  async function upsert(items, as) {
    const out = await client.post('/internal/engagement/settings/upsert', { items }, { as });
    value = undefined;
    at = 0;
    return out;
  }
  return { map, get, getNumber, getBool, upsert, client, _reset: () => { value = undefined; at = 0; } };
}
