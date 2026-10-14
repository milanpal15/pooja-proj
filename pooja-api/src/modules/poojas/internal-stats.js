import { config } from '../../config/env.js';
import { ordersEnabled } from '../../lib/orders-guard.js';
import { bearer, verifyServiceToken } from '../../lib/service-jwt.js';
import { Booking, PoojaReview } from '../../models.js';

const ALLOWED_ISSUERS = ['catalog'];

/**
 * The two booking-derived numbers the catalog service shows but does not own (docs/MICROSERVICES.md section 2,
 * `catalog -> orders`): how many live bookings each pooja has (the dashboard list) and its rating aggregate (the public
 * detail). The bookings and reviews stay here until phase 5.
 *
 *   GET /internal/orders/pooja-stats
 *     -> { stats: { "<poojaSlug>": { bookingCount, rating: { avg, count } | null } } }
 *
 *   bookingCount  bookings whose status is not `cancelled`
 *   rating        mean of the VISIBLE (not hidden) reviews, one decimal place, and their count; null when there are none
 *
 * READ-ONLY, authenticated by a service JWT whose issuer is `catalog` (nothing else may call it), and mounted only when
 * CATALOG_URL is set and ORDERS_URL is NOT (404 otherwise; with ORDERS_URL set the orders service answers the very same path with the same shape). The catalog caches the answer for 30 s and treats any failure as "absent".
 * `/internal` is outside `/api`, so the operator gate does not apply, and the BFFs forward only `/api` and `/uploads`.
 */
export function mountInternalOrders(app) {
  app.get('/internal/orders/pooja-stats', async (req, res, next) => {
    try {
      const secret = config.internalJwtSecret;
      if (!secret || !config.catalogUrl || ordersEnabled()) return res.status(404).end(); // ORDERS_URL set: the orders service owns this route
      const claims = verifyServiceToken(bearer(req.headers.authorization), { secret, issuers: ALLOWED_ISSUERS });
      if (!claims) return res.status(401).json({ error: 'Invalid service token.', code: 'bad_token' });

      const [counts, ratings] = await Promise.all([
        Booking.aggregate([
          { $match: { status: { $ne: 'cancelled' }, poojaSlug: { $exists: true } } },
          { $group: { _id: '$poojaSlug', n: { $sum: 1 } } },
        ]),
        PoojaReview.aggregate([
          { $match: { hidden: false } },
          { $group: { _id: '$poojaSlug', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
        ]),
      ]);
      const stats = {};
      for (const c of counts) if (c._id) stats[c._id] = { bookingCount: c.n, rating: null };
      for (const r of ratings) {
        if (!r._id) continue;
        stats[r._id] ??= { bookingCount: 0, rating: null };
        stats[r._id].rating = { avg: Math.round(r.avg * 10) / 10, count: r.count };
      }
      res.json({ stats });
    } catch (e) {
      next(e);
    }
  });
}
