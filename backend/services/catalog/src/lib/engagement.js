import { createServiceClient } from '@bhakti/common';

/**
 * Catalog's window onto the engagement service (the `Setting` table: prasad fee, chadhava fee/minimum). Mirrors what the
 * monolith's lib/engagement-client.js does for itself: 5 s timeout, 15 s cache, the last good answer (any age) when
 * engagement is down, then the documented defaults. A STRICT read (used by import-sevas, which writes prices into
 * poojas) refuses to guess and throws instead.
 */
export const TTL_MS = 15_000;
export const RETRY_AFTER_FAIL_MS = 5_000;

export const FALLBACK_SETTINGS = Object.freeze({
  prasadDelivery: '99',
  supportEmail: '',
  supportPhone: '',
  supportHours: '',
  supportHoursHi: '',
});

export function createSettingsReader(config, { fetchImpl, logger } = {}) {
  const client = createServiceClient({
    service: 'engagement',
    baseUrl: config.engagementUrl,
    iss: 'catalog',
    secret: config.secret,
    timeoutMs: config.serviceTimeoutMs,
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  let value;
  let at = 0;
  let failedAt = 0;
  let inflight = null;

  async function load() {
    const data = await client.get('/internal/engagement/settings/map');
    value = (data && typeof data.settings === 'object' && data.settings) || {};
    at = Date.now();
    failedAt = 0;
  }

  async function map({ strict = false } = {}) {
    const now = Date.now();
    if (value !== undefined && now - at < TTL_MS) return value;
    if (!strict && failedAt && now - failedAt < RETRY_AFTER_FAIL_MS) return value ?? { ...FALLBACK_SETTINGS };
    inflight ??= load()
      .catch((e) => {
        failedAt = Date.now();
        logger?.warn(`engagement settings unreachable (${e?.code || e?.message}): ${strict ? 'refusing' : 'serving cached/default values'}`);
        if (strict) throw e;
      })
      .finally(() => {
        inflight = null;
      });
    await inflight;
    return value ?? { ...FALLBACK_SETTINGS };
  }

  const get = async (key, fallback = '', o) => (await map(o))[key] ?? fallback;
  const getNumber = async (key, fallback, o) => {
    const raw = String(await get(key, '', o)).trim();
    const n = Number(raw);
    return raw !== '' && Number.isFinite(n) ? n : fallback;
  };
  return { map, get, getNumber, client, _reset: () => { value = undefined; at = 0; failedAt = 0; } };
}
