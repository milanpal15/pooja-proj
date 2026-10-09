import { useState } from 'react';

import { useAccess } from '../../lib/access/index.js';
import { Banner, Button, useToast } from '../../ui/index.js';
import { AdjustWalletForm } from './components/AdjustWalletForm.jsx';
import { PackModal } from './components/PackModal/index.js';
import { PackTable } from './components/PackTable.jsx';
import { PackViewModal } from './components/PackViewModal.jsx';
import { StatCards } from './components/StatCards.jsx';
import { TransactionTable } from './components/TransactionTable.jsx';
import { TXN_LIMIT, useTransactions } from './hooks/useTransactions.js';
import { useCoins } from './hooks/useCoins.js';

/**
 * Coins & Wallets, in two sections by area (DESIGN.md §21.3):
 *   money    the packs and their headline numbers (read-only without money:edit)
 *   wallets  the ledger, and "Adjust a wallet" (omitted entirely without wallets:edit)
 */
export function CoinsPage() {
  const access = useAccess();
  const showPacks = access.canView('money');
  const showWallets = access.canView('wallets');
  const { data, status, error, offline, actions } = useCoins({ enabled: showPacks });
  const [type, setType] = useState('');
  const txns = useTransactions(type, { enabled: showWallets });
  // `false` closed, `null` a new pack, a pack object = editing it.
  const [editing, setEditing] = useState(false);
  const toast = useToast();
  const packsReadOnly = !access.canEdit('money');

  const toggle = (pack, active) =>
    actions.setActive(pack, active).catch((e) => toast.error(`Could not change the pack. ${e.message}`));

  return (
    <div className="ui-page">
      <p className="content-lede">
        Coin packs devotees can buy, every coin movement, and manual corrections. Coins are the only way to pay inside the app, so every
        booking, offering and call shows up here. Pack prices are read from here at payment time, never from the app.
      </p>
      {showPacks && status === 'stale' && (
        <Banner action={<Button size="sm" variant="secondary" onClick={actions.reload}>Refresh</Button>}>
          Couldn't refresh. Showing the last data we got.
        </Banner>
      )}

      {showPacks && <StatCards stats={data.stats} loading={data.statsLoading} />}

      {showPacks && (
        <PackTable
          packs={data.packs}
          status={status}
          error={error}
          offline={offline}
          coinsPerRupee={data.coinsPerRupee}
          sold={data.sold}
          readOnly={packsReadOnly}
          onAdd={() => setEditing(null)}
          onEdit={setEditing}
          onToggle={toggle}
          onRetry={actions.reload}
        />
      )}

      {showWallets && (
        <TransactionTable
          rows={txns.data || []}
          status={txns.status}
          error={txns.error}
          offline={txns.offline}
          type={type}
          onType={setType}
          onRetry={txns.actions.reload}
          limit={TXN_LIMIT}
        />
      )}

      {access.canEdit('wallets') && (
        <AdjustWalletForm onAdjusted={() => { txns.actions.reload(); if (showPacks) actions.reload(); }} />
      )}

      {editing && packsReadOnly && <PackViewModal pack={editing} coinsPerRupee={data.coinsPerRupee} onClose={() => setEditing(false)} />}
      {editing !== false && !packsReadOnly && (
        <PackModal
          pack={editing}
          nextOrder={(data.packs.at(-1)?.order ?? 0) + 1}
          coinsPerRupee={data.coinsPerRupee}
          onSave={actions.savePack}
          onDelete={actions.removePack}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
