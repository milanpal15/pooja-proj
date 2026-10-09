import { Field, Switch } from '../../../../ui/index.js';
import { describePack } from '../../lib/coin-pack.js';
import { PackPreview } from './PackPreview.jsx';
import { WorkedOutPanel } from './WorkedOutPanel.jsx';

/**
 * The fields. An operator enters coins and price; everything else on screen is
 * derived with the same describePack the API uses.
 */
export function PackForm({ form, onChange, coinsPerRupee, problem }) {
  const set = (key) => (value) => onChange({ ...form, [key]: value });
  const derived = describePack({
    coins: form.coins,
    price: form.price,
    coinsPerRupee,
    showSale: form.showSale,
    saleEndsAt: form.saleEndsAt ? `${form.saleEndsAt}T23:59:59` : null,
  });
  return (
    <>
      <div className="feat-grid2">
        <Field label="Coins the devotee receives" type="number" min="1" step="1" value={form.coins} onChange={set('coins')} inputMode="numeric" />
        <Field label="Price they pay (₹)" type="number" min="1" step="1" value={form.price} onChange={set('price')} inputMode="numeric" />
      </div>
      {problem && (
        <p className="feat-form-error" role="alert">
          {problem}
        </p>
      )}

      <WorkedOutPanel derived={derived} coinsPerRupee={coinsPerRupee} />

      <div className="feat-grid2">
        <Switch
          variant="card"
          label="Show as a sale"
          hint={derived.salePct >= 1 ? `Adds the “${derived.salePct}% EXTRA” label` : 'Adds the sale label when there are extra coins'}
          checked={form.showSale}
          onChange={set('showSale')}
        />
        <Field label="Sale ends (optional)" type="date" value={form.saleEndsAt} onChange={set('saleEndsAt')} />
      </div>
      <p className="ui-field__hint" style={{ marginTop: -8 }}>
        After the end date the pack stays available but the sale label is hidden. Leave it blank to keep the label on until you turn it off.
      </p>

      <div className="feat-grid2">
        <Field label="Position in the list" type="number" min="1" step="1" value={form.order} onChange={set('order')} inputMode="numeric" />
        <Switch variant="card" label="Active" hint="Off hides the pack from the app" checked={form.active} onChange={set('active')} />
      </div>

      <PackPreview derived={derived} />
    </>
  );
}
