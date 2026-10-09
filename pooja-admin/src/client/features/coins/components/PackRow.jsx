import { Badge, Button, StatusText, Switch } from '../../../ui/index.js';
import { formatDay } from '../../../lib/dates.js';
import { formatCoins, formatRupees } from '../../../lib/money.js';
import { derive, saleLabel } from '../lib/packs.js';

/** One pack: the two numbers an operator set, and what follows from them. */
export function PackRow({ pack, coinsPerRupee, sold, readOnly = false, onEdit, onToggle }) {
  const d = derive(pack, coinsPerRupee);
  const label = saleLabel(d);
  return (
    <tr>
      <td>{pack.order}</td>
      <td>
        <b>{formatCoins(pack.coins)}</b>
      </td>
      <td>{formatRupees(pack.price)}</td>
      <td>
        {d.extraCoins > 0 ? (
          <>
            +{formatCoins(d.extraCoins)} <span className="ui-field__hint">({d.salePct}%)</span>
          </>
        ) : (
          '—'
        )}
      </td>
      <td>
        {label ? <Badge tone="accent">{label}</Badge> : d.saleEnded ? <Badge tone="neutral">Sale ended</Badge> : '—'}
      </td>
      <td>{formatDay(pack.saleEndsAt)}</td>
      <td className="num">{pack.sold30d ?? sold ?? '—'}</td>
      <td>
        {readOnly ? (
          <StatusText on={pack.active !== false} onLabel="Active" offLabel="Inactive" />
        ) : (
          <Switch
            label={`Active: ${pack.coins} coins for ₹${pack.price}`}
            checked={pack.active !== false}
            onChange={(v) => onToggle(pack, v)}
          />
        )}
      </td>
      <td className="actions">
        <Button variant="outline" size="sm" onClick={() => onEdit(pack)} aria-label={`${readOnly ? 'View' : 'Edit'} pack: ${pack.coins} coins for ₹${pack.price}`}>
          {readOnly ? 'View' : 'Edit'}
        </Button>
      </td>
    </tr>
  );
}
