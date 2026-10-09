import { api } from '../../lib/api/index.js';
import { usePoll } from '../../lib/hooks/usePoll.js';
import { Card, ErrorNote } from '../../ui/index.js';
import { OrderTable } from './components/OrderTable.jsx';

/** Every attempt to buy coins, newest first — the dashboard's record of real money in. */
export function CoinOrdersPage() {
  const { data, err } = usePoll(() => api.coinOrders(200), [], 5000);
  if (err) return <ErrorNote msg={err} />;
  if (!data) return <p className="muted">Loading…</p>;
  return (
    <div className="ui-page">
      <Card flush>
        <OrderTable rows={data} />
      </Card>
    </div>
  );
}
