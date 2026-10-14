import { createServiceClient } from '@bhakti/common';

/**
 * The two booking-derived numbers catalog shows but does not own (they live with the bookings and reviews: the orders service
 * since phase 5, the monolith while its ORDERS_URL is unset - the path and the shape are the same, which is why this client did not change): a pooja's booking count (dashboard list) and its rating aggregate (public detail).
 *
 *   GET {ORDERS_URL}/internal/orders/pooja-stats  ->  { stats: { [poojaSlug]: { bookingCount, rating: {avg,count}|null } } }
 *
 * 30 s cache. This is an OPTIONAL lookup: when the orders side is unset, slow or down the answer is "absent" - count 0,
 * rating hidden - and NEVER an error (docs/MICROSERVICES.md section 2). Concurrent callers share one request.
 */
export const STATS_TTL_MS = 30_000;
const RETRY_AFTER_FAIL_MS = 5_000;

export function createOrdersStats(config, { fetchImpl, logger } = {}) {
  if (!config.ordersUrl) return { available: false, forSlug: async () => ({ bookingCount: 0, rating: null }), all: async () => new Map() };
  const client = createServiceClient({
    service: 'orders',
    baseUrl: config.ordersUrl,
    iss: 'catalog',
    secret: config.secret,
    timeoutMs: Math.min(config.serviceTimeoutMs, 3000),
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  let stats = new Map();
  let at = 0;
  let failedAt = 0;
  let inflight = null;

  async function all() {
    const now = Date.now();
    if (at && now - at < STATS_TTL_MS) return stats;
    if (failedAt && now - failedAt < RETRY_AFTER_FAIL_MS) return stats; // empty after a failure
    inflight ??= client
      .get('/internal/orders/pooja-stats')
      .then((d) => {
        stats = new Map(Object.entries(d?.stats ?? {}));
        at = Date.now();
        failedAt = 0;
      })
      .catch((e) => {
        failedAt = Date.now();
        logger?.warn(`orders stats unavailable (${e?.code || e?.message}): rating hidden, booking count 0`);
        stats = new Map(); // absent, not stale: a booking count / rating that may be wrong is worse than none
        at = 0;
      })
      .finally(() => {
        inflight = null;
      });
    await inflight;
    return stats;
  }

  return {
    available: true,
    all,
    async forSlug(slug) {
      const s = (await all()).get(slug);
      return { bookingCount: Number(s?.bookingCount) || 0, rating: s?.rating ?? null };
    },
    _reset: () => { stats = new Map(); at = 0; failedAt = 0; },
  };
}
