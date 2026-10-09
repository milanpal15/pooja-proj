import { Card, ReadOnlyBadge, EmptyState, ErrorState, TableSkeleton } from '../../../ui/index.js';
import { PayoutRow } from './PayoutRow.jsx';

/** What each astrologer is owed. Payment itself happens in the bank; this records it. */
export function PayoutsPanel({ rows, status, error, offline, readOnly = false, onPay, onRetry }) {
  const loaded = status === 'ready' || status === 'stale';
  return (
    <Card
      title="Payouts due"
      description={readOnly ? 'Earnings are calculated from completed calls.' : 'Earnings are calculated from completed calls. Pay the astrologer by bank transfer, then record it here.'}
      actions={readOnly ? <ReadOnlyBadge /> : undefined}>
      {status === 'loading' && <TableSkeleton rows={3} />}
      {status === 'error' && <ErrorState message={error} offline={offline} onRetry={onRetry} />}
      {loaded && rows.length === 0 && <EmptyState title="Nothing to pay yet">Earnings appear here after an astrologer completes a call.</EmptyState>}
      {loaded && rows.length > 0 && (
        <div role="list" aria-label="Payouts">
          {rows.map((r) => (
            <div role="listitem" key={r.id}>
              <PayoutRow row={r} readOnly={readOnly} onPay={onPay} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
