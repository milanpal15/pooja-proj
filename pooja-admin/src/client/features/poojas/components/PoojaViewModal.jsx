import { formatDateTime, formatDay } from '../../../lib/dates.js';
import { ReadOnlyList, ViewOnlyModal } from '../../../ui/index.js';
import { priceRange } from '../lib/pooja.js';
import { statusMeta } from '../lib/status.js';

/** A pooja as text, for an account that cannot edit. */
export function PoojaViewModal({ pooja: p, nameOf, onClose }) {
  const pkgs = p.packages || [];
  return (
    <ViewOnlyModal title={p.title} subtitle={p.titleHi} onClose={onClose}>
      <ReadOnlyList
        label="Pooja details"
        rows={[
          { label: 'Status', value: statusMeta(p.status).label },
          { label: 'Temple', value: nameOf('temples', p.templeSlug) },
          { label: 'Place', value: p.place },
          { label: 'Festival', value: nameOf('festivals', p.festivalSlug) },
          { label: 'Tithi', value: p.tithi },
          { label: 'Pooja date', value: p.poojaDate ? formatDay(p.poojaDate) : 'Every day' },
          { label: 'Bookings close', value: p.bookingClosesAt ? formatDateTime(p.bookingClosesAt) : '' },
          { label: 'Cancel until', value: `${p.cancelHours ?? 24} hours before` },
          { label: 'Prasad', value: p.prasadAvailable ? `${p.prasadFeeCoins} coins` : 'Not offered' },
          { label: 'Packages', value: pkgs.length ? `${priceRange(pkgs) ?? '—'} coins` : '' },
          ...pkgs.map((k) => ({ label: `· ${k.name}`, value: `${k.persons} ${k.persons === 1 ? 'person' : 'people'} · ${k.coins} coins${k.enabled === false ? ' · hidden' : ''}` })),
          { label: 'Visible', value: p.enabled ? 'On' : 'Off' },
        ]}
      />
    </ViewOnlyModal>
  );
}
