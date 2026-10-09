import { Button, Card, ReadOnlyBadge, DataTable, EmptyState, ErrorState, TableSkeleton } from '../../../ui/index.js';
import { idOf } from '../../../lib/ids.js';
import { AstrologerFilters } from './AstrologerFilters.jsx';
import { AstrologerRow } from './AstrologerRow.jsx';

export function AstrologerTable({ rows, total, status, error, offline, filters, onFilters, specialities, readOnly = false, onAdd, onEdit, onListed, onRetry }) {
  const loaded = status === 'ready' || status === 'stale';
  return (
    <Card flush actions={readOnly ? <ReadOnlyBadge /> : undefined}>
      <AstrologerFilters value={filters} onChange={onFilters} specialities={specialities} />
      {status === 'loading' && <TableSkeleton />}
      {status === 'error' && <ErrorState message={error} offline={offline} onRetry={onRetry} />}
      {loaded && total === 0 && (
        <EmptyState title="No astrologers yet" action={readOnly ? undefined : <Button onClick={onAdd}>+ Add astrologer</Button>}>
          Add one with their sign-in email or mobile. They sign in to the app the normal way and land in the astrologer view.
        </EmptyState>
      )}
      {loaded && total > 0 && rows.length === 0 && (
        <EmptyState title="No astrologer matches these filters">Clear the search or the filters to see everyone.</EmptyState>
      )}
      {loaded && rows.length > 0 && (
        <DataTable label="Astrologers" minWidth={980}>
          <thead>
            <tr>
              <th>Astrologer</th>
              <th>Speciality</th>
              <th>Rate</th>
              <th>Platform share</th>
              <th>Presence</th>
              <th className="num">Calls (30d)</th>
              <th>Listed</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <AstrologerRow key={idOf(a)} astrologer={a} readOnly={readOnly} onEdit={onEdit} onListed={onListed} />
            ))}
          </tbody>
        </DataTable>
      )}
    </Card>
  );
}
