const FAQ_FIELDS = [
  { key: 'slug', label: 'Slug', type: 'text' },
  { key: 'category', label: 'Category key', type: 'text', col: true },
  { key: 'categoryTitle', label: 'Category title (EN)', type: 'text' },
  { key: 'categoryTitleHi', label: 'Category title (HI)', type: 'text' },
  { key: 'question', label: 'Question (EN)', type: 'text', col: true },
  { key: 'questionHi', label: 'Question (HI)', type: 'text' },
  { key: 'answer', label: 'Answer (EN)', type: 'text' },
  { key: 'answerHi', label: 'Answer (HI)', type: 'text' },
  { key: 'order', label: 'Order', type: 'number' },
  { key: 'enabled', label: 'Visible', type: 'bool', col: true },
];

/** The tab's wiring: which API collection, what a row is called. */
export const faqResource = {
  title: 'FAQ',
  resource: 'faqs',
  fields: FAQ_FIELDS,
  previewKey: 'question',
};
