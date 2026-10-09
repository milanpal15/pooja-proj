import { Button, Card, DataTable, EmptyState, ErrorState, Field, TableSkeleton } from '../../../ui/index.js';
import { downloadCsv, toCsv } from '../../../lib/csv.js';
import { formatWhen } from '../../../lib/dates.js';
import { formatCoins, formatSignedCoins } from '../../../lib/money.js';
import { whoLabel } from '../../../lib/ids.js';
import { TXN_TYPES, txnType } from '../lib/packs.js';
import { TxnTypeBadge } from './TxnTypeBadge.jsx';

const CSV_COLUMNS = [
  { header: 'When', value: (t) => t.at },
  { header: 'Devotee', value: (t) => whoLabel(t.who) },
  { header: 'Type', value: (t) => txnType(t.type).label },
  { header: 'Coins', value: (t) => t.amount },
  { header: 'Balance after', value: (t) => t.balanceAfter },
  { header: 'Note', value: (t) => t.note },
  { header: 'By', value: (t) => t.createdBy },
];

/** Full-width ledger with a type filter and a CSV export of exactly the rows shown. */
export function TransactionTable({ rows, status, error, offline, type, onType, onRetry, limit }) {
  const loaded = status === 'ready' || status === 'stale';
  return (
    <Card
      flush
      title="Transactions"
      actions={
        <>
          <Field
            hideLabel
            label="Type"
            type="select"
            className="ui-field--auto"
            value={type}
            onChange={onType}
            options={[{ value: '', label: 'All types' }, ...TXN_TYPES.map((t) => ({ value: t.value, label: t.label }))]}
          />
          <Button
            variant="secondary"
            disabled={!loaded || !rows?.length}
            onClick={() => downloadCsv(`wallet-transactions${type ? `-${type}` : ''}.csv`, toCsv(CSV_COLUMNS, rows))}>
            Export CSV
          </Button>
        </>
      }>
      {status === 'loading' && <TableSkeleton />}
      {status === 'error' && <ErrorState message={error} offline={offline} onRetry={onRetry} />}
      {loaded && rows.length === 0 && (
        <EmptyState title={type ? 'No transactions of this type' : 'No transactions yet'}>
          Every purchase, spend, refund and adjustment appears here.
        </EmptyState>
      )}
      {loaded && rows.length > 0 && (
        <>
          <DataTable label="Wallet transactions" minWidth={760}>
            <thead>
              <tr>
                <th>When</th>
                <th>Devotee</th>
                <th>Type</th>
                <th className="num">Coins</th>
                <th className="num">Balance after</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td>{formatWhen(t.at)}</td>
                  <td>{whoLabel(t.who)}</td>
                  <td>
                    <TxnTypeBadge type={t.type} />
                  </td>
                  <td className={`num ${t.amount >= 0 ? 'ui-pos' : 'ui-neg'}`}>{formatSignedCoins(t.amount)}</td>
                  <td className="num">{formatCoins(t.balanceAfter)}</td>
                  <td>
                    {t.note || '—'}
                    {t.createdBy && <span className="sub">by {t.createdBy}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          {rows.length >= limit && <div className="feat-note">Showing the latest {limit}. Filter by type to narrow it down.</div>}
        </>
      )}
    </Card>
  );
}
