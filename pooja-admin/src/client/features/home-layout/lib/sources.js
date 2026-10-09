/**
 * What each Home block is (docs/POOJA_AND_HOME.md §1.1). The phone builds
 * `hero`, `astrologer`, `festivals`, `temples` and `darshan` from content that
 * already has its own tab (chip "Automatic", no items); `grid`, `daily`,
 * `features` and `custom` carry the operator's own items; `knowledge` picks
 * deities. `link` is the sibling tab that owns the content.
 */
export const SOURCES = {
  hero: { fixed: true, label: 'Hero carousel', chip: 'dashboard', tone: 'purple', link: { label: 'Edit slider', tab: 'Home slider' } },
  astrologer: { fixed: true, label: 'Astrologer card', chip: 'automatic', tone: 'crimson', note: 'Shown while the “Astrologer calls” flag is on', link: { label: 'Flags', tab: 'Feature Flags' } },
  grid: { fixed: true, label: 'Quick grid', chip: 'dashboard', tone: 'gold', items: true, editLabel: 'Edit tiles', noun: 'tile' },
  festivals: { fixed: true, label: 'Upcoming vrat & festivals', chip: 'automatic', tone: 'crimson', note: 'The next two from the Festivals calendar', link: { label: 'Festivals', tab: 'Festivals' } },
  daily: { fixed: true, label: "Today's Special", chip: 'automatic', tone: 'forest', items: true, editLabel: 'Edit rows', noun: 'row' },
  knowledge: { label: 'Deity knowledge', chip: 'automatic', tone: 'purple', deities: true, editLabel: 'Choose deities', note: 'Photo tiles from the Knowledge entries you pick' },
  temples: { fixed: true, label: 'Popular temples', chip: 'automatic', tone: 'gold', note: 'From the Temples list', link: { label: 'Temples', tab: 'Temples' } },
  features: { fixed: true, label: 'Feature cards', chip: 'dashboard', tone: 'gold', items: true, editLabel: 'Edit cards', noun: 'card' },
  darshan: { fixed: true, label: 'Daily Darshan card', chip: 'automatic', tone: 'maroon', note: 'Live temple, while the “Live darshan” flag is on', link: { label: 'Temples', tab: 'Temples' } },
  custom: { label: 'Section', chip: 'dashboard', tone: 'gold', items: true, editLabel: 'Edit', noun: 'item' },
};

/**
 * Blocks the approved Home draws itself: not switchable, not reorderable, not
 * scheduled here. Only `custom` and `knowledge` shelves are managed on this tab.
 */
export const isFixed = (section) => !!SOURCES[section?.source]?.fixed;

export const sourceOf = (section) => SOURCES[section?.source] || SOURCES.custom;

/** A section's own sentence when it has a title, else the source's name. */
export const nameOf = (section) => section.title || sourceOf(section).label;

export const TONES = [
  { value: 'gold', label: 'Gold' },
  { value: 'purple', label: 'Purple' },
  { value: 'crimson', label: 'Crimson' },
  { value: 'forest', label: 'Forest' },
  { value: 'maroon', label: 'Maroon' },
];

export const LAYOUTS = [
  { value: 'photo3', label: 'Photos ×3' },
  { value: 'book2', label: 'Books ×2' },
  { value: 'list', label: 'List' },
  { value: 'grid4', label: 'Grid ×4' },
];

export const BADGES = [
  { value: '', label: 'None' },
  { value: 'new', label: 'New' },
  { value: 'soon', label: 'Coming soon' },
  { value: 'special', label: 'Special' },
];

/** App icon names (poojaappclone components/ui/icon.tsx) that make sense on a tile. */
export const ICONS = ['home', 'diya', 'temple', 'music', 'person', 'bell', 'settings', 'search', 'calendar', 'mapPin', 'star', 'heart', 'share', 'globe', 'sparkle', 'lotus', 'marigold', 'shankh', 'gift', 'support', 'play'];

/** Feature-flag keys an item may follow (DEFAULT_FLAGS in the API). */
export const FLAGS = ['virtualPooja', 'bhajan', 'chadhava', 'journal', 'liveDarshan', 'payments', 'announcements', 'astrologerCalls'];

/** Which item fields each kind of block uses: `main` sit in the row, `more` behind "More". */
export function itemFieldsFor(section) {
  const kind = section.source === 'custom' ? section.layout || 'photo3' : section.source;
  switch (kind) {
    case 'photo3':
    case 'book2':
      return { main: ['image', 'title', 'titleHi', 'href', 'badge'], more: ['subtitle', 'subtitleHi'] };
    case 'list':
      return { main: ['title', 'titleHi', 'href', 'badge'], more: ['icon', 'subtitle', 'subtitleHi', 'image'] };
    case 'daily':
      return { main: ['icon', 'title', 'titleHi', 'href'], more: ['subtitle', 'subtitleHi'] };
    case 'features':
      return { main: ['icon', 'title', 'titleHi', 'href'], more: ['subtitle', 'subtitleHi', 'flag'] };
    default: // grid, grid4
      return { main: ['icon', 'title', 'titleHi', 'href', 'badge'], more: ['flag'] };
  }
}

export const blankItem = () => ({ title: '', titleHi: '', subtitle: '', subtitleHi: '', icon: '', image: '', href: '', badge: '', flag: '', deitySlug: '' });
