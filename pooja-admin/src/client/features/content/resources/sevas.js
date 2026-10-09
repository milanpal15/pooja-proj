/** Bookable rites and their prices — used to be hardcoded in the app bundle. */
const SEVA_FIELDS = [
  { key: 'slug', label: 'Slug', type: 'text', col: true },
  { key: 'name', label: 'Name (EN)', type: 'text', col: true },
  { key: 'nameHi', label: 'Name (HI)', type: 'text' },
  { key: 'price', label: 'Price (coins)', type: 'number', col: true },
  { key: 'duration', label: 'Duration', type: 'text', col: true },
  { key: 'description', label: 'Description (EN)', type: 'text' },
  { key: 'descriptionHi', label: 'Description (HI)', type: 'text' },
  { key: 'templeSlug', label: 'Only at temple (slug)', type: 'text' },
  { key: 'deitySlugs', label: 'Deity slugs (comma-separated)', type: 'csv' },
  { key: 'order', label: 'Order', type: 'number' },
  { key: 'enabled', label: 'Visible', type: 'bool', col: true },
];

/** The tab's wiring: which API collection, what a row is called. */
export const sevaResource = {
  title: 'Seva',
  resource: 'sevas',
  fields: SEVA_FIELDS,
  previewKey: 'name',
};
