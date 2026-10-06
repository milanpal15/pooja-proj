import type { DeitySlug } from './temples';

/**
 * Seva catalogue for **real** pooja booking — a priest performs the ritual at
 * the physical temple on your behalf, on a chosen date, in your name.
 *
 * This is a different product from Virtual Pooja, which is the on-device
 * gesture aarti. They were conflated: the temple card's "Book Pooja" button
 * routed straight into the aarti screen, so tapping it never booked anything.
 *
 *   Virtual Pooja   free · instant · on-device · gated by the `virtualPooja`
 *                   flag · needs no temple's cooperation
 *   Pooja Booking   paid · scheduled · performed at the temple · gated
 *                   per-temple by `bookingEnabled`, because it depends on an
 *                   arrangement with that temple's administration
 *
 * Prices are in whole rupees here and become `price_paise` integers when this
 * moves to the `temple_offerings` table in phase P4-2 of the build plan.
 */

export type Seva = {
  id: string;
  name: string;
  /** Devanagari name, shown beneath the Latin one. */
  nameHi: string;
  /** What the priest actually performs — devotees are choosing a rite. */
  description: string;
  price: number;
  /** Roughly how long the rite takes, for expectation-setting. */
  duration: string;
  /** Deities this seva is appropriate for; omitted means universal. */
  deities?: DeitySlug[];
};

/** Prasad courier, added at checkout. */
export const PRASAD_DELIVERY = 99;
