import { asyncRouter } from '../../lib/async-handler.js';
import { Booking } from './booking.model.js';

/**
 * Read-only, by uid, for the identity service's Users 360 view (docs/USERS.md section 2). /internal/orders/directory/*, `iss: identity` only (lib/perms.js).
 *
 *   GET /directory/users/:uid  -> { total, recent:[{ id, bookingRef, poojaTitle, templeName, packageName, status, totalCoins, poojaDate, createdAt }] }   the 10 newest bookings
 *
 * Deliberately NOT the names / gotras / address on a booking: the 360 needs "what did they book", not who it was recited for.
 */
export function bookingDirectoryRoutes() {
  const r = asyncRouter();
  r.get('/directory/users/:uid', async (req, res) => {
    const uid = req.params.uid;
    const [total, rows] = await Promise.all([
      Booking.countDocuments({ uid }),
      Booking.find({ uid }).sort({ createdAt: -1 }).limit(10).select('bookingRef poojaTitle templeName packageName status totalCoins poojaDate createdAt').lean(),
    ]);
    res.json({
      total,
      recent: rows.map((b) => ({
        id: String(b._id), bookingRef: b.bookingRef, poojaTitle: b.poojaTitle ?? null, templeName: b.templeName ?? null, packageName: b.packageName ?? null,
        status: b.status, totalCoins: b.totalCoins ?? 0, poojaDate: b.poojaDate ?? null, createdAt: b.createdAt, at: b.createdAt, title: b.poojaTitle ?? null, coins: b.totalCoins ?? 0,
      })),
    });
  });
  return r;
}
