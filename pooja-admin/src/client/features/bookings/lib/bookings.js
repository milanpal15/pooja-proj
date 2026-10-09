import { whoLabel } from '../../../lib/ids.js';

/** Who booked: the API already masks it for roles that may not see devotees ("Devotee ••4821"). */
export const accountOf = (row) => whoLabel(row.who ?? row.devotee);

export const TYPES = [
  { value: '', label: 'Type: All' },
  { value: 'pooja', label: 'Pooja' },
  { value: 'chadhava', label: 'Chadhava' },
];

/** Both kinds in one filter; a status that does not apply to a kind (Offered for a pooja) simply matches none of it. */
export const BOOKING_STATUSES = [
  { value: '', label: 'Status: All' },
  { value: 'booked', label: 'Booked' },
  { value: 'sankalp', label: 'Sankalp done' },
  { value: 'performed', label: 'Performed' },
  { value: 'offered', label: 'Offered' },
  { value: 'cancelled', label: 'Cancelled' },
];

const TONE = { booked: 'info', sankalp: 'accent', performed: 'success', offered: 'success', cancelled: 'outline' };
const LABEL = { booked: 'Booked', sankalp: 'Sankalp done', performed: 'Performed', offered: 'Offered', cancelled: 'Cancelled' };

/** The word and tone for a status chip; a refunded cancellation says so. */
export function statusChip(row) {
  const label = LABEL[row.status] || row.status || '—';
  return { tone: TONE[row.status] || 'neutral', label: row.status === 'cancelled' && row.refunded ? `${label} · refunded` : label };
}

// The only moves the API allows are forward (booked -> sankalp -> performed; booked -> offered).
const POOJA_NEXT = { booked: { to: 'sankalp', label: 'Mark sankalp done' }, sankalp: { to: 'performed', label: 'Mark performed' } };
const CHADHAVA_NEXT = { booked: { to: 'offered', label: 'Mark offered' } };

/** The one forward step available from a status (undefined at the end of the line). */
export const nextPoojaStep = (status) => POOJA_NEXT[status];
export const nextChadhavaStep = (status) => CHADHAVA_NEXT[status];

export const stars = (n) => '★'.repeat(Math.max(0, Math.min(5, n))) + '☆'.repeat(5 - Math.max(0, Math.min(5, n)));

/** "Gau Seva, Ghee lamps ×2" */
export const itemsLine = (items = []) => items.map((i) => (i.qty > 1 ? `${i.title} ×${i.qty}` : i.title)).join(', ');

/** A review's text is capped at this many characters (the API enforces the same). */
export const REVIEW_MAX = 500;

/** Whether the edited text can be saved: changed, and within the cap. */
export const reviewTextOk = (draft, original = '') => draft.length <= REVIEW_MAX && draft.trim() !== String(original).trim();
