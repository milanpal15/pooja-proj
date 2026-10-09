import { useAccess } from '../../lib/access/index.js';
import { ReadOnlyBadge } from '../../ui/index.js';
import { BookingsTable } from './components/BookingsTable.jsx';
import { ReviewsSection } from './components/ReviewsSection.jsx';

/**
 * Bookings: poojas and chadhava paid in coins in one list, and below it the
 * reviews devotees leave. Everyone with `orders:view` can read; moving a booking
 * forward and moderating a review need `orders:edit` (the actions are not rendered without it).
 */
export function BookingsPage() {
  const canEdit = useAccess().canEdit('orders');
  return (
    <div className="ui-page">
      <div className="hl-head">
        <p className="content-lede">Poojas and chadhava paid in coins. {canEdit ? 'Move each booking along as it is performed.' : 'You can look at bookings, not change them.'}</p>
        {!canEdit && <ReadOnlyBadge />}
      </div>
      <BookingsTable />
      <ReviewsSection />
    </div>
  );
}
