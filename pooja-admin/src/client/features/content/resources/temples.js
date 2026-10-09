const TEMPLE_FIELDS = [
  { key: 'name', label: 'Name', type: 'text', col: true },
  { key: 'location', label: 'Location', type: 'text', col: true },
  { key: 'deitySlug', label: 'Deity slug', type: 'text' },
  { key: 'aartiTime', label: 'Aarti time', type: 'text', col: true },
  // Left blank the app hides the rating row rather than inventing one.
  { key: 'rating', label: 'Rating (0-5)', type: 'number', col: true },
  { key: 'reviews', label: 'Rating count', type: 'number' },
  // YouTube link or a direct HLS/mp4 URL. Blank = not streaming.
  { key: 'liveUrl', label: 'Live darshan URL', type: 'text' },
  { key: 'imageUrl', label: 'Image', type: 'image' },
  { key: 'offerings', label: 'Offerings (comma-separated)', type: 'csv' },
  { key: 'bookingEnabled', label: 'Booking', type: 'bool', col: true },
  { key: 'slug', label: 'Slug (id)', type: 'text' },
  { key: 'order', label: 'Order', type: 'number' },
  { key: 'enabled', label: 'Visible', type: 'bool', col: true },
];

/** The tab's wiring: which API collection, what a row is called. */
export const templeResource = {
  title: 'Temple',
  resource: 'temples',
  fields: TEMPLE_FIELDS,
  previewKey: 'name',
};
