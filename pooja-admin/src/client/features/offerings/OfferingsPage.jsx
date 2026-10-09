import { api } from '../../api.js';
import { ContentManager } from '../content/index.js';

/**
 * The chadhava offering catalogue (flowers, prasad, vastram…). Priced in coins.
 * Its tab's area (content) decides whether it is editable.
 */
const OFFERING_FIELDS = [
  { key: 'key', label: 'Key (id, e.g. flowers)', type: 'text', col: true },
  { key: 'name', label: 'Name (EN)', type: 'text', col: true },
  { key: 'nameHi', label: 'Name (HI)', type: 'text', col: true },
  { key: 'coins', label: 'Price (coins)', type: 'number', col: true },
  { key: 'order', label: 'Order', type: 'number' },
  { key: 'enabled', label: 'Visible', type: 'bool', col: true },
];

export function OfferingsPage({ area }) {
  return (
    <div className="ui-page">
      <p className="content-lede">What a devotee can add to a chadhava offering, and what each costs in coins. Prices are read from here at payment time.</p>
      <ContentManager title="Offering" resource={api.offerings} fields={OFFERING_FIELDS} previewKey="name" area={area} />
    </div>
  );
}
