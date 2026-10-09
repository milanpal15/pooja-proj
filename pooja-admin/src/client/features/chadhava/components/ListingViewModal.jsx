import { formatDateTime } from '../../../lib/dates.js';
import { formatCoins } from '../../../lib/money.js';
import { ReadOnlyList, ViewOnlyModal } from '../../../ui/index.js';

/** A listing and its offerings as text, for an account that cannot edit. */
export function ListingViewModal({ listing: l, refs, categoryName, onClose }) {
  return (
    <ViewOnlyModal title={l.title} subtitle={l.titleHi} onClose={onClose}>
      <ReadOnlyList
        label="Listing details"
        rows={[
          { label: 'Temple', value: refs.nameOf('temples', l.templeSlug) },
          { label: 'Place', value: l.place },
          { label: 'Category', value: categoryName(l.category) },
          { label: 'Starts', value: l.startsAt ? formatDateTime(l.startsAt) : '' },
          { label: 'Ends', value: l.endsAt ? formatDateTime(l.endsAt) : '' },
          ...(l.offerings || []).map((o) => ({ label: `· ${o.title}`, value: `${formatCoins(o.coins)} coins${o.enabled === false ? ' · hidden' : ''}` })),
          { label: 'Visible', value: l.enabled ? 'On' : 'Off' },
        ]}
      />
    </ViewOnlyModal>
  );
}
