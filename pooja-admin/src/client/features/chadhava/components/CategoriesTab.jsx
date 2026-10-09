import { api } from '../../../lib/api/index.js';
import { ContentManager } from '../../content/index.js';

const CATEGORY_FIELDS = [
  { key: 'slug', label: 'Slug (id, e.g. deep-daan)', type: 'text', col: true },
  { key: 'name', label: 'Name (EN)', type: 'text', col: true },
  { key: 'nameHi', label: 'Name (HI)', type: 'text', col: true },
  { key: 'image', label: 'Image', type: 'image', col: true },
  { key: 'order', label: 'Order', type: 'number' },
  { key: 'enabled', label: 'Visible', type: 'bool', col: true },
];

/** Categories that group listings in the app (Deep Daan, Gau Seva…). Plain CRUD with an image. */
export function CategoriesTab({ area, onChange }) {
  return <ContentManager title="Category" resource={api.chadhavaCategories} fields={CATEGORY_FIELDS} previewKey="name" area={area} onChange={onChange} />;
}
