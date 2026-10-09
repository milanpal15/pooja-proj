const WALLPAPER_STYLE_FIELDS = [
  { key: 'slug', label: 'Slug', type: 'text', col: true },
  { key: 'title', label: 'Title (EN)', type: 'text', col: true },
  { key: 'titleHi', label: 'Title (HI)', type: 'text', col: true },
  { key: 'order', label: 'Order', type: 'number' },
  { key: 'enabled', label: 'Visible', type: 'bool', col: true },
];

/** The tab's wiring: which API collection, what a row is called. */
export const wallpaperStyleResource = {
  title: 'Wallpaper style',
  resource: 'wallpaperStyles',
  fields: WALLPAPER_STYLE_FIELDS,
  previewKey: 'title',
};
