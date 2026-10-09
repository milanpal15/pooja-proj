import { redactBookings, redactWho, seesDevotees } from '../../access/redact.js';
import { asyncRouter } from '../../lib/async-handler.js';
import { httpErrorHandler } from '../../lib/http-error.js';
import * as svc from './bookings.service.js';

/** Pooja bookings, paid in coins. See docs/POOJA_AND_HOME.md §3. */
export function bookingsRouters({ requireAuth }) {
  const devotee = asyncRouter();
  const admin = asyncRouter();

  devotee.get('/bookings', requireAuth, async (req, res) => res.json({ bookings: await svc.listForDevotee(req.token.uid) }));
  devotee.get('/bookings/:id', requireAuth, async (req, res) => res.json({ booking: await svc.getForDevotee(req.token.uid, req.params.id) }));

  devotee.post('/bookings', requireAuth, async (req, res) => {
    const out = await svc.createBooking(req.token.uid, req.body);
    res.status(out.created ? 201 : 200).json({ booking: out.booking, balance: out.balance });
  });

  devotee.post('/bookings/:id/cancel', requireAuth, async (req, res) => res.json(await svc.cancelBooking(req.token.uid, req.params.id)));
  devotee.post('/bookings/:id/review', requireAuth, async (req, res) => {
    res.status(201).json({ booking: await svc.reviewBooking(req.token.uid, req.params.id, req.body) });
  });

  // Area `orders`: everyone with the dashboard may read; changing a status or hiding a review needs `orders:edit`.
  admin.get('/admin/bookings', async (req, res) => {
    const rows = await svc.listForAdmin(req.query, { canSearchPeople: seesDevotees(req) });
    res.json({ bookings: redactBookings(rows, req) });
  });
  admin.put('/admin/bookings/:id/status', async (req, res) => res.json({ booking: await svc.setStatus(req.params.id, req.body?.status) }));

  admin.get('/admin/reviews', async (req, res) => res.json({ reviews: redactWho(await svc.listReviews(req.query), req) }));
  admin.put('/admin/reviews/:id', async (req, res) => res.json({ review: await svc.moderateReview(req.params.id, req.body) }));

  devotee.use(httpErrorHandler);
  admin.use(httpErrorHandler);
  return { devotee, admin };
}
