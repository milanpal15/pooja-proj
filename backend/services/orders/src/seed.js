import { Booking, ChadhavaOrder, OrderIntent, PoojaReview } from './models.js';

/**
 * Nothing to seed: orders are created by devotees. What "seeding" means here is making sure the indexes exist BEFORE traffic - above all the
 * unique ones the idempotency rests on (a booking / order is unique on (uid, requestId), a reference on `bookingRef` / `ref`, a review on its
 * booking, an intent on its wallet key). `db.js` already runs `init()` on connect; this waits for it again and is what `/health` gates on, so
 * /health is 200 only once every unique index is really built (a DB split's copied rows are in place before this service starts).
 */
export async function seedOrders({ log = () => {} } = {}) {
  await Promise.all([Booking, ChadhavaOrder, PoojaReview, OrderIntent].map((m) => m.init()));
  log('indexes ready');
}
