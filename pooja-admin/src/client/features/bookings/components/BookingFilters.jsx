import { Field } from '../../../ui/index.js';
import { BOOKING_STATUSES, TYPES } from '../lib/bookings.js';

/** Search, Type and Status for the combined bookings list. */
export function BookingFilters({ filters, onChange }) {
  return (
    <div className="feat-toolbar feat-toolbar--bare">
      <Field hideLabel label="Search" type="search" className="ui-field--grow" placeholder="Search by reference, pooja or listing" value={filters.q} onChange={(v) => onChange('q', v)} />
      <Field hideLabel label="Type" type="select" className="ui-field--auto" value={filters.type} options={TYPES} onChange={(v) => onChange('type', v)} />
      <Field hideLabel label="Status" type="select" className="ui-field--auto" value={filters.status} options={BOOKING_STATUSES} onChange={(v) => onChange('status', v)} />
    </div>
  );
}
