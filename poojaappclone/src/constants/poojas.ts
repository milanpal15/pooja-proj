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

export const SEVAS: Seva[] = [
  {
    id: 'archana',
    name: 'Archana',
    nameHi: 'अर्चना',
    description: 'Your name and gotra offered with 108 recitations.',
    price: 251,
    duration: '~20 min',
  },
  {
    id: 'abhishek',
    name: 'Rudrabhishek',
    nameHi: 'रुद्राभिषेक',
    description: 'Ritual bathing of the lingam with milk, honey and Ganga jal.',
    price: 1100,
    duration: '~45 min',
    deities: ['Shiva'],
  },
  {
    id: 'sahasranama',
    name: 'Sahasranama Archana',
    nameHi: 'सहस्रनाम अर्चना',
    description: 'The thousand names recited in your name.',
    price: 751,
    duration: '~40 min',
    deities: ['Vishnu', 'Devi'],
  },
  {
    id: 'modak',
    name: 'Modak Naivedya',
    nameHi: 'मोदक नैवेद्य',
    description: 'Twenty-one modaks offered, then couriered to you as prasad.',
    price: 501,
    duration: '~25 min',
    deities: ['Ganesha'],
  },
  {
    id: 'deep',
    name: 'Deep Daan',
    nameHi: 'दीप दान',
    description: 'A ghee lamp lit in your name at the evening aarti.',
    price: 151,
    duration: '~10 min',
  },
];

/** Sevas appropriate for a temple's presiding deity. */
export function sevasFor(deity: DeitySlug): Seva[] {
  return SEVAS.filter((s) => !s.deities || s.deities.includes(deity));
}

/** Prasad courier, added at checkout. */
export const PRASAD_DELIVERY = 99;
