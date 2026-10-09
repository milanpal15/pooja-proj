import { Card, DataTable, EmptyState, ErrorState, TableSkeleton } from '../../../ui/index.js';
import { downloadCsv, toCsv } from '../../../lib/csv.js';
import { formatDuration } from '../../../lib/dates.js';
import { CALL_LIMIT } from '../hooks/useCalls.js';
import { outcomeLabel } from '../lib/outcome.js';
import { CallFilters } from './CallFilters.jsx';
import { CallRow } from './CallRow.jsx';

const CSV = [
  { header: 'Started', value: (c) => c.startedAt },
  { header: 'Devotee', value: (c) => c.devoteeName },
  { header: 'Astrologer', value: (c) => c.astrologerName },
  { header: 'Duration', value: (c) => formatDuration(c.durationSec) },
  { header: 'Duration (sec)', value: (c) => c.durationSec },
  { header: 'Coins', value: (c) => c.coins },
  { header: 'Outcome', value: (c) => outcomeLabel(c) },
];

export function CallTable({ calls, status, error, offline, filters, onFilters, onDetails, onRetry }) {
  const loaded = status === 'ready' || status === 'stale';
  return (
    <Card
      flush
      title="Call log"
      actions={
        <CallFilters
          value={filters}
          onChange={onFilters}
          canExport={loaded && calls.length > 0}
          onExport={() => downloadCsv(`calls${filters.from ? `-${filters.from}` : ''}.csv`, toCsv(CSV, calls))}
        />
      }>
      {status === 'loading' && <TableSkeleton />}
      {status === 'error' && <ErrorState message={error} offline={offline} onRetry={onRetry} />}
      {loaded && calls.length === 0 && (
        <EmptyState title="No calls in this range">Widen the dates or clear the outcome filter.</EmptyState>
      )}
      {loaded && calls.length > 0 && (
        <>
          <DataTable label="Calls" minWidth={860}>
            <thead>
              <tr>
                <th>Started</th>
                <th>Devotee</th>
                <th>Astrologer</th>
                <th>Duration</th>
                <th className="num">Coins</th>
                <th>Outcome</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {calls.map((c) => (
                <CallRow key={c.id} call={c} onDetails={onDetails} />
              ))}
            </tbody>
          </DataTable>
          {calls.length >= CALL_LIMIT && <div className="feat-note">Showing the latest {CALL_LIMIT}. Narrow the dates to see others.</div>}
        </>
      )}
    </Card>
  );
}
