import { asyncRouter } from '../../lib/async-handler.js';
import { ctx } from '../../lib/context.js';
import * as svc from './reviews.service.js';

/**
 * Reviews. Creating one is part of a booking (`POST /bookings/:id/review`, modules/bookings); here are the public list, the
 * moderation screen and the numbers the catalog shows.
 *   public  GET /poojas/:slug/reviews?limit&before            -> { reviews }
 *   catalog GET /pooja-stats                                  -> { stats }
 *   admin   GET /admin/reviews?hidden=true|false              -> { reviews }     (orders:view)
 *           PUT /admin/reviews/:id { hidden?, text? }         -> { review }      (orders:edit)
 */
export function reviewsRouters() {
  const pub = asyncRouter();
  const admin = asyncRouter();

  pub.get('/poojas/:slug/reviews', async (req, res) => res.json({ reviews: await svc.reviewsPublic(req.params.slug, req.query) }));
  pub.get('/pooja-stats', async (_req, res) => res.json({ stats: await svc.poojaStats() }));

  admin.get('/admin/reviews', async (req, res) => res.json({ reviews: ctx.redact.redactWho(await svc.listReviews(req.query), req) }));
  admin.put('/admin/reviews/:id', async (req, res) => res.json({ review: await svc.moderateReview(req.params.id, req.body) }));

  return { public: pub, admin };
}
