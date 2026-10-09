/**
 * Alert tones. `sound` is a name bundled with the app (`bell`, `aarti`),
 * an absolute URL to an audio file, or blank for silent. A URL streams
 * through the real alarm; on the notification fallback it rings with the
 * device default, because an Android channel sound must be a bundled file.
 */
const TONE_FIELDS = [
  { key: 'slug', label: 'Slug', type: 'text', col: true },
  { key: 'title', label: 'Title (EN)', type: 'text', col: true },
  { key: 'titleHi', label: 'Title (HI)', type: 'text' },
  { key: 'desc', label: 'Description (EN)', type: 'text', col: true },
  { key: 'descHi', label: 'Description (HI)', type: 'text' },
  { key: 'sound', label: 'Sound — bundled name, URL, or blank for silent', type: 'text' },
  { key: 'icon', label: 'Icon', type: 'text' },
  { key: 'order', label: 'Order', type: 'number' },
  { key: 'enabled', label: 'Visible', type: 'bool', col: true },
];

/** The tab's wiring: which API collection, what a row is called. */
export const toneResource = {
  title: 'Tone',
  resource: 'tones',
  fields: TONE_FIELDS,
  previewKey: 'title',
};
