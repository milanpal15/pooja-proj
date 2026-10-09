const AARTI_FIELDS = [
  { key: 'title', label: 'Title', type: 'text', col: true },
  { key: 'artist', label: 'Artist', type: 'text', col: true },
  { key: 'deitySlug', label: 'Deity slug', type: 'text' },
  { key: 'duration', label: 'Duration', type: 'text', col: true },
  {
    key: 'category',
    label: 'Shelf',
    type: 'select',
    col: true,
    options: [
      { value: 'morning', label: 'Morning Mantras' },
      { value: 'evening', label: 'Evening Aarti' },
      { value: 'meditation', label: 'Meditation Music' },
    ],
  },
  { key: 'audioUrl', label: 'Audio', type: 'audio' },
  { key: 'order', label: 'Order', type: 'number' },
  { key: 'enabled', label: 'Visible', type: 'bool', col: true },
];

/** The tab's wiring: which API collection, what a row is called. */
export const aartiResource = {
  title: 'Aarti',
  resource: 'aartis',
  fields: AARTI_FIELDS,
  previewKey: 'title',
};
