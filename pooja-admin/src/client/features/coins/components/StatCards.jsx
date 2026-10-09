import { StatCard, StatGrid } from '../../../ui/index.js';
import { formatCoins, formatInr } from '../../../lib/money.js';

/** The four headline numbers. A missing stat reads "—", never a made-up zero. */
export function StatCards({ stats, loading }) {
  const spent = stats?.coinsSpent
    ? Object.values(stats.coinsSpent).reduce((a, b) => a + (Number(b) || 0), 0)
    : null;
  return (
    <StatGrid aria-label="Coin totals">
      <StatCard label="Coin sales · 30 days" tone="primary" loading={loading} value={stats ? formatInr(stats.salesPaise) : null} />
      <StatCard label="Coins sold · 30 days" loading={loading} value={stats ? formatCoins(stats.coinsSold) : null} />
      <StatCard label="Coins spent (all uses)" loading={loading} value={spent === null ? null : formatCoins(spent)} />
      <StatCard label="Unspent coins (owed to devotees)" loading={loading} value={stats ? formatCoins(stats.unspentCoins) : null} />
    </StatGrid>
  );
}
