import { Button, StatCard, StatGrid } from '../../../../ui/index.js';
import { formatCoins } from '../../../../lib/money.js';
import { txnRow } from '../../lib/format.js';
import { RecentTable } from './RecentTable.jsx';
import { SectionGate } from './SectionGate.jsx';

/** Balance + the last ten ledger rows. "Adjust coins" opens the Coins & Wallets form (wallets:edit). */
export function WalletTab({ detail, canAdjust, onAdjust, onRetry }) {
  const w = detail.wallet;
  return (
    <SectionGate detail={detail} tab="wallet" label="The wallet" emptyTitle="No coin activity yet" emptyText={`Balance ${formatCoins(w?.balance ?? 0)} coins.`} onRetry={onRetry}>
      <StatGrid>
        <StatCard label="Balance" value={`${formatCoins(w?.balance)} coins`} />
      </StatGrid>
      <div className="usr-tabhead">
        <h3>Recent coin movements</h3>
        {canAdjust && (
          <Button variant="outline" size="sm" onClick={onAdjust}>
            Adjust coins…
          </Button>
        )}
      </div>
      <RecentTable label="Recent wallet transactions" headers={['When', 'Reason', 'Type', 'Coins']} showDetail={false} rows={(w?.recent ?? []).map(txnRow)} />
    </SectionGate>
  );
}
