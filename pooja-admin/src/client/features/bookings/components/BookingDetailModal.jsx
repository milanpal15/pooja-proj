import { formatWhen } from '../../../lib/dates.js';
import { formatCoins } from '../../../lib/money.js';
import { Badge, Button, Modal, ReadOnlyList } from '../../../ui/index.js';
import { accountOf, stars, statusChip } from '../lib/bookings.js';

/** Everything on one pooja booking: who the sankalp is for, the price split, the history and any review. */
export function BookingDetailModal({ booking: b, onClose }) {
  const chip = statusChip(b);
  return (
    <Modal open onClose={onClose} title={b.bookingRef} subtitle={b.poojaTitle} footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      <ReadOnlyList
        label="Booking details"
        rows={[
          { label: 'Devotee', value: accountOf(b) },
          { label: 'Package', value: `${b.packageName} · ${b.persons} ${b.persons === 1 ? 'person' : 'people'}` },
          { label: 'Names in the sankalp', value: (b.names || []).map((n) => (n.gotra ? `${n.name} (${n.gotra})` : n.name)).join(', ') },
          { label: 'Coins', value: `${formatCoins(b.totalCoins)}${b.prasad ? ` (package ${formatCoins(b.packageCoins)} + prasad ${formatCoins(b.prasadCoins)})` : ''}` },
          { label: 'Status', value: <Badge tone={chip.tone}>{chip.label}</Badge> },
          { label: 'History', value: (b.statusHistory || []).map((h) => `${h.status} · ${formatWhen(h.at)}`).join('  →  ') },
          { label: 'Review', value: b.review ? `${stars(b.review.rating)} ${b.review.text || ''}` : '' },
        ]}
      />
    </Modal>
  );
}
