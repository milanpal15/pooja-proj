import { ReadOnlyList, StatusText, ViewOnlyModal } from '../../../ui/index.js';
import { formatDay } from '../../../lib/dates.js';
import { formatCoins, formatRupees } from '../../../lib/money.js';
import { derive, saleLabel } from '../lib/packs.js';

/** One pack for an account that cannot edit: what devotees see and pay, as text. */
export function PackViewModal({ pack, coinsPerRupee, onClose }) {
  const d = derive(pack, coinsPerRupee);
  return (
    <ViewOnlyModal title="Coin pack" subtitle={`${formatCoins(pack.coins)} coins for ${formatRupees(pack.price)}`} onClose={onClose}>
      <ReadOnlyList
        label="Coin pack details"
        rows={[
          { label: 'Coins the devotee receives', value: formatCoins(pack.coins) },
          { label: 'Price they pay', value: formatRupees(pack.price) },
          { label: 'Extra coins', value: d.extraCoins > 0 ? `+${formatCoins(d.extraCoins)} (${d.salePct}%)` : '' },
          { label: 'Sale label', value: saleLabel(d) ?? (d.saleEnded ? 'Sale ended' : '') },
          { label: 'Sale ends', value: pack.saleEndsAt ? formatDay(pack.saleEndsAt) : '' },
          { label: 'Position in the list', value: pack.order },
          { label: 'Active in the app', value: <StatusText on={pack.active !== false} onLabel="Active" offLabel="Inactive" /> },
        ]}
      />
    </ViewOnlyModal>
  );
}
