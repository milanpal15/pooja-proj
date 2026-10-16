import { bookingRow, badgeRow, callRow, registrationRow } from '../../lib/format.js';
import { formatDuration, formatWhen } from '../../../../lib/dates.js';
import { RecentTable } from './RecentTable.jsx';
import { SectionGate } from './SectionGate.jsx';

export function BookingsTab({ detail, onRetry }) {
  const b = detail.bookings;
  return (
    <SectionGate detail={detail} tab="bookings" label="Bookings" emptyTitle="No bookings" emptyText="This person has not booked a pooja or sent an offering." onRetry={onRetry}>
      <p className="muted usr-count-line">{b?.total ?? 0} in total. The latest {Math.min(10, (b?.recent ?? []).length)} are shown.</p>
      <RecentTable label="Recent bookings" headers={['When', 'Booking', 'Status', 'Coins']} rows={(b?.recent ?? []).map(bookingRow)} />
    </SectionGate>
  );
}

export function CallsTab({ detail, onRetry }) {
  const c = detail.calls;
  const rows = (c?.recent ?? []).map(callRow).map((r) => ({ ...r, detail: typeof r.detail === 'number' ? formatDuration(r.detail) : r.detail }));
  return (
    <SectionGate detail={detail} tab="calls" label="Calls" emptyTitle="No calls" emptyText="This person has not called an astrologer." onRetry={onRetry}>
      <p className="muted usr-count-line">{c?.total ?? 0} in total. The latest {Math.min(10, rows.length)} are shown.</p>
      <RecentTable label="Recent calls" headers={['When', 'Astrologer', 'Outcome', 'Coins']} rows={rows} />
    </SectionGate>
  );
}

export function EventsTab({ detail, onRetry }) {
  const e = detail.events;
  const regs = (e?.registrations ?? []).map(registrationRow);
  const badges = (e?.badges ?? []).map(badgeRow);
  return (
    <SectionGate detail={detail} tab="events" label="Events" emptyTitle="No events joined" emptyText="This person has not joined an event or earned a badge." onRetry={onRetry}>
      {regs.length > 0 && <RecentTable label="Event registrations" headers={['Joined', 'Event', 'Status', 'Progress']} rows={regs.map((r) => ({ ...r, amount: r.detail, detail: null }))} />}
      {badges.length > 0 && (
        <>
          <h3 className="usr-subhead">Badges</h3>
          <ul className="usr-plain usr-badges">
            {badges.map((b) => (
              <li key={b.key}>
                <b>{b.title}</b> <span className="muted">{formatWhen(b.when)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </SectionGate>
  );
}
