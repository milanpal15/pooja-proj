import { Button, Card, ReadOnlyBadge, DataTable, EmptyState, ErrorState, TableSkeleton } from '../../../ui/index.js';
import { idOf } from '../../../lib/ids.js';
import { PackRow } from './PackRow.jsx';

/** The packs card: header + table, with all five data states. */
export function PackTable({ packs, status, error, offline, coinsPerRupee, sold, readOnly = false, onAdd, onEdit, onToggle, onRetry }) {
  const rupee = coinsPerRupee === 1 ? '1 coin = ₹1' : `₹1 = ${coinsPerRupee} coins`;
  return (
    <Card
      flush
      title="Coin packs"
      description={`You set the coins and the price. ${rupee}, so any coins above the price are extras, and the sale % is worked out for you.`}
      actions={readOnly ? <ReadOnlyBadge /> : <Button onClick={onAdd}>+ Add pack</Button>}>
      {status === 'loading' && <TableSkeleton />}
      {status === 'error' && <ErrorState message={error} offline={offline} onRetry={onRetry} />}
      {(status === 'ready' || status === 'stale') && packs.length === 0 && (
        <EmptyState title="No coin packs yet" action={readOnly ? undefined : <Button onClick={onAdd}>+ Add the first pack</Button>}>
          Without an active pack devotees have no way to buy coins.
        </EmptyState>
      )}
      {(status === 'ready' || status === 'stale') && packs.length > 0 && (
        <DataTable label="Coin packs" minWidth={900}>
          <thead>
            <tr>
              <th>Order</th>
              <th>Coins</th>
              <th>Price</th>
              <th>Extra coins</th>
              <th>Sale label</th>
              <th>Sale ends</th>
              <th className="num">Sold (30d)</th>
              <th>Active</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {packs.map((p) => (
              <PackRow
                key={idOf(p)}
                pack={p}
                coinsPerRupee={coinsPerRupee}
                sold={sold?.[idOf(p)]}
                readOnly={readOnly}
                onEdit={onEdit}
                onToggle={onToggle}
              />
            ))}
          </tbody>
        </DataTable>
      )}
    </Card>
  );
}
