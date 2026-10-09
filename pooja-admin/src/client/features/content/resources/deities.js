/**
 * A deity, including how the app draws one without a photograph.
 *
 * The sanctum renders a procedural murti when `imageUrl` is empty, tinted by
 * the palette and shaped by the geometry flags. Those used to live only in
 * the app bundle, so a deity added here came out grey and crownless.
 */
const DEITY_FIELDS = [
  { key: 'name', label: 'Name', type: 'text', col: true },
  { key: 'title', label: 'Title', type: 'text', col: true },
  { key: 'mark', label: 'Mark', type: 'text' },
  { key: 'mantra', label: 'Mantra', type: 'text', col: true },
  { key: 'imageUrl', label: 'Image (overrides the drawn murti)', type: 'image' },
  { key: 'offerings', label: 'Offerings (comma-separated)', type: 'csv' },

  { key: 'accent', label: 'Accent — halo and glow', type: 'text' },
  { key: 'body', label: 'Murti tone', type: 'text' },
  { key: 'robe', label: 'Robe colour', type: 'text' },
  { key: 'trim', label: 'Trim — garlands, crown, jewellery', type: 'text' },
  {
    key: 'crown',
    label: 'Crown',
    type: 'select',
    options: [
      { value: 'plain', label: 'Plain' },
      { value: 'mukut', label: 'Mukut' },
      { value: 'jata', label: 'Jata — matted hair (Shiva)' },
      { value: 'tall', label: 'Tall' },
    ],
  },
  { key: 'crescent', label: 'Crescent moon in the hair', type: 'bool' },
  { key: 'serpent', label: 'Cobra at the shoulder', type: 'bool' },
  { key: 'elephant', label: 'Elephant head', type: 'bool' },
  { key: 'mace', label: 'Mace at the side', type: 'bool' },

  { key: 'slug', label: 'Slug (id)', type: 'text' },
  { key: 'order', label: 'Order', type: 'number' },
  { key: 'enabled', label: 'Visible', type: 'bool', col: true },
];

/** The tab's wiring: which API collection, what a row is called. */
export const deityResource = {
  title: 'Deity',
  resource: 'deities',
  fields: DEITY_FIELDS,
  previewKey: 'name',
};
