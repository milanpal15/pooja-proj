import { daysUntil } from './days';

type SevaBooking = { status: string; poojaDate: string | null };

/**
 * The devotee's next upcoming pooja: a live booking (not cancelled, not yet
 * performed) with a date today or later, soonest first. A booking for an
 * "every day" pooja has no date to be "next" about, so it never qualifies.
 */
export function pickNextSeva<T extends SevaBooking>(
  bookings: T[],
  now: number,
): { booking: T; days: number } | null {
  let best: { booking: T; days: number } | null = null;
  for (const b of bookings) {
    if (b.status !== 'booked' && b.status !== 'sankalp') continue;
    const days = daysUntil(b.poojaDate, now);
    if (days === null || days < 0) continue;
    if (!best || days < best.days) best = { booking: b, days };
  }
  return best;
}
