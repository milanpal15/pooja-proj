import { asyncRouter } from '../../lib/async-handler.js';
import { ctx } from '../../lib/context.js';
import { requireDevotee } from '../../lib/perms.js';
import * as svc from './bookings.service.js';

/**
 * Pooja bookings, paid in coins (docs/POOJA_AND_HOME.md section 3). The monolith's paths, status codes and bodies, byte for byte.
 *   devotee (mobile BFF, uid = the token's sub): GET /bookings | GET /bookings/:id | POST /bookings | POST /bookings/:id/cancel | POST /bookings/:id/review
 *   admin   (admin BFF, area `orders`):          GET /admin/bookings | PUT /admin/bookings/:id/status
 */
export function bookingsRouters() {
  const devotee = asyncRouter();
  const admin = asyncRouter();

  devotee.get('/bookings', requireDevotee, async (req, res) => res.json({ bookings: await svc.listForDevotee(req.token.uid) }));
  devotee.get('/bookings/:id', requireDevotee, async (req, res) => res.json({ booking: await svc.getForDevotee(req.token.uid, req.params.id) }));

  devotee.post('/bookings', requireDevotee, async (req, res) => {
    const out = await svc.createBooking(req.token.uid, req.body);
    res.status(out.created ? 201 : 200).json({ booking: out.booking, balance: out.balance });
  });

  devotee.post('/bookings/:id/cancel', requireDevotee, async (req, res) => res.json(await svc.cancelBooking(req.token.uid, req.params.id)));
  devotee.post('/bookings/:id/review', requireDevotee, async (req, res) => {
    res.status(201).json({ booking: await svc.reviewBooking(req.token.uid, req.params.id, req.body, { name: req.user?.name }) });
  });

  // Area `orders`: everyone with the dashboard may read; changing a status or hiding a review needs `orders:edit`.
  admin.get('/admin/bookings', async (req, res) => {
    const rows = await svc.listForAdmin(req.query, { canSearchPeople: ctx.redact.seesDevotees(req) });
    res.json({ bookings: ctx.redact.redactBookings(rows, req) });
  });
  admin.put('/admin/bookings/:id/status', async (req, res) => res.json({ booking: await svc.setStatus(req.params.id, req.body?.status) }));

  return { devotee, admin };
}
