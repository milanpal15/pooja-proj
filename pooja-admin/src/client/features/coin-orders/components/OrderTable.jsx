import { formatCoins, formatRupees } from '../../../lib/money.js';
import { Badge, DataTable, EmptyState } from '../../../ui/index.js';

const TONE = { paid: 'success', failed: 'danger', created: 'neutral' };

export function OrderTable({ rows }) {
  if (!rows || rows.length === 0) return <EmptyState title="No coin orders yet" />;
  return (
    <DataTable label="Coin orders" minWidth={640}>
      <thead>
        <tr>
          <th>Devotee</th>
          <th>Coins</th>
          <th>Price</th>
          <th>Status</th>
          <th>Gateway</th>
          <th>When</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((o) => (
          <tr key={o.id}>
            <td>{o.who}</td>
            <td>{formatCoins(o.coins)}</td>
            <td>{formatRupees(o.price)}</td>
            <td>
              <Badge tone={TONE[o.status] || 'neutral'}>{o.status}</Badge>
            </td>
            <td className="muted">{o.provider}</td>
            <td className="muted">{new Date(o.at).toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}
