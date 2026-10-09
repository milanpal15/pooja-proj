/**
 * Vrat & festival dates. Editable here rather than baked into the app because
 * the Hindu calendar is lunar — the dates shift every year, and a hardcoded
 * list runs dry silently, leaving the app's Home section blank.
 */
const FESTIVAL_FIELDS = [
  { key: 'slug', label: 'Slug', type: 'text', col: true },
  { key: 'name', label: 'Name (EN)', type: 'text', col: true },
  { key: 'nameHi', label: 'Name (HI)', type: 'text', col: true },
  { key: 'date', label: 'Date (YYYY-MM-DD)', type: 'text', col: true },
  { key: 'deitySlug', label: 'Deity slug', type: 'text', col: true },
  { key: 'enabled', label: 'Visible', type: 'bool', col: true },
];

/** The tab's wiring: which API collection, what a row is called. */
export const festivalResource = {
  title: 'Festival',
  resource: 'festivals',
  fields: FESTIVAL_FIELDS,
  previewKey: 'name',
};
