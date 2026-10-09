/** Deity lore behind the Knowledge screen. */
const KNOWLEDGE_FIELDS = [
  { key: 'deitySlug', label: 'Deity slug', type: 'text', col: true },
  { key: 'epithet', label: 'Epithet (EN)', type: 'text', col: true },
  { key: 'epithetHi', label: 'Epithet (HI)', type: 'text' },
  { key: 'about', label: 'About (EN)', type: 'text' },
  { key: 'aboutHi', label: 'About (HI)', type: 'text' },
  { key: 'texts', label: 'Scriptures EN (comma-separated)', type: 'csv' },
  { key: 'textsHi', label: 'Scriptures HI (comma-separated)', type: 'csv' },
  { key: 'festivals', label: 'Festivals EN (comma-separated)', type: 'csv' },
  { key: 'festivalsHi', label: 'Festivals HI (comma-separated)', type: 'csv' },
  { key: 'order', label: 'Order', type: 'number' },
  { key: 'enabled', label: 'Visible', type: 'bool', col: true },
];

/** The tab's wiring: which API collection, what a row is called. */
export const knowledgeResource = {
  title: 'Knowledge',
  resource: 'knowledge',
  fields: KNOWLEDGE_FIELDS,
  previewKey: 'deitySlug',
};
