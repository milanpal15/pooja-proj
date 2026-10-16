/**
 * The Home layout registry (docs/HOME_LAYOUT.md section 2-3): block types, data sources, action types, tones, icons and
 * the known feature flags. ONE table, used by BOTH the validator (layout.validate.js) and `GET /admin/home-layout/registry`
 * (which the dashboard builder renders its forms from), so they cannot drift.
 *
 * A prop / param schema is a small JSON-schema-ish object: `{ type: 'string'|'boolean'|'integer'|'html'|'array', ...}`
 * with `enum`, `min`, `max`, `maxLength`, `default`, `items`.
 */
import { TARGET_TYPES } from '../content/resources/hero-target.js';

export const SCHEMA_VERSION = 2;
export const LIMITS = { layouts: 8, blocks: 60, items: 24, gridItems: 12, text: 160, name: 40, html: 20 * 1024, ref: 500, sourceLimitMax: 20 };

/** The id of the fallback layout (docs/HOME_LAYOUT.md section 9.1). */
export const DEFAULT_LAYOUT_ID = 'default';

/**
 * Audience segments (section 9.1): a CLOSED list. Evaluated on the device; the server only validates the keys.
 */
export const AUDIENCES = [
  { key: 'new_user', label: 'New users (first 7 days)', description: 'Account created 7 days ago or less.' },
  { key: 'has_booking', label: 'Has a booking', description: 'At least one booking that is not cancelled.' },
  { key: 'in_event', label: 'In an event', description: 'Joined an event that has not finished.' },
  { key: 'lapsed', label: 'Hasn\'t opened in 14 days', description: 'The app was last opened more than 14 days ago.' },
];
export const AUDIENCE_KEYS = AUDIENCES.map((a) => a.key);

export const TILE_STYLES = [
  { key: 'icon', label: 'Icon + label' },
  { key: 'image', label: 'Image tiles' },
  { key: 'pill', label: 'Pills' },
];
export const TILE_STYLE_KEYS = TILE_STYLES.map((s) => s.key);

export const TONES = ['gold', 'purple', 'crimson', 'forest', 'maroon'];
export const LANGUAGES = ['all', 'en', 'hi'];
export const BADGES = ['new', 'soon', 'special'];
export const ACTION_TYPES = ['pooja', 'chadhava', 'temple', 'bhajan', 'astrologer', 'coins', 'event', 'live', 'panchang', 'horoscope', 'events', 'route', 'link', 'none'];
export const SHELF_LAYOUTS = ['photo3', 'book2', 'list', 'grid4'];

/** poojaappclone/src/components/ui/icon.tsx `IconName` (a parity test reads that file). */
export const ICONS = [
  'home', 'diya', 'temple', 'music', 'person', 'back', 'forward', 'close', 'check', 'bell', 'settings', 'search', 'calendar', 'mapPin',
  'star', 'heart', 'share', 'plus', 'minus', 'trash', 'play', 'pause', 'globe', 'logout', 'sparkle', 'lotus', 'marigold', 'shankh',
  'gift', 'support', 'google', 'bag', 'chevronDown', 'chevronRight', 'arrowRight', 'filter', 'user', 'clock', 'moon',
];

/**
 * Feature-flag keys the dashboard offers: engagement's DEFAULT_FLAGS plus `events` (the app's own flag). ADVISORY: a block's
 * `flag` is only format-checked, because an unknown flag means "shown" (docs/HOME_LAYOUT.md section 1).
 */
export const KNOWN_FLAGS = ['virtualPooja', 'bhajan', 'chadhava', 'journal', 'liveDarshan', 'payments', 'announcements', 'astrologerCalls', 'phoneAuth', 'events'];

const slug = { type: 'string', maxLength: 80, pattern: '^[A-Za-z0-9][A-Za-z0-9_.-]*$' };

/** `resolvedBy: 'app'` in v1: the app resolves every source from the feeds it already loads. `auth:true` = omitted for guests. */
export const SOURCES = [
  { key: 'hero', title: 'Home slider (managed slides)', params: {}, auth: false, resolvedBy: 'app' },
  { key: 'deities', title: 'Deities', params: {}, auth: false, resolvedBy: 'app' },
  { key: 'poojas.featured', title: 'Featured pooja', params: {}, auth: false, resolvedBy: 'app' },
  { key: 'poojas.upcoming', title: 'Upcoming poojas', params: { temple: { ...slug, description: 'Temple slug' } }, auth: false, resolvedBy: 'app' },
  { key: 'chadhava.listings', title: 'Chadhava listings', params: { category: { ...slug, description: 'Chadhava category slug' } }, auth: false, resolvedBy: 'app' },
  { key: 'temples.near_me', title: 'Temples near me', params: {}, auth: false, resolvedBy: 'app' },
  { key: 'temples.saved', title: 'Saved temples', params: {}, auth: true, resolvedBy: 'app' },
  { key: 'festivals.upcoming', title: 'Upcoming festivals', params: {}, auth: false, resolvedBy: 'app' },
  { key: 'events.upcoming', title: 'Upcoming events', params: { tags: { type: 'array', maxItems: 10, items: { ...slug, description: 'Event tag slug' } } }, auth: false, resolvedBy: 'app' },
  { key: 'events.mine', title: 'Events I joined', params: {}, auth: true, resolvedBy: 'app' },
  { key: 'bookings.next', title: 'My next booking', params: {}, auth: true, resolvedBy: 'app' },
  { key: 'astrologers.online', title: 'Astrologers online', params: {}, auth: false, resolvedBy: 'app' },
  { key: 'panchang.today', title: "Today's panchang", params: {}, auth: false, resolvedBy: 'app' },
  { key: 'horoscope.today', title: "Today's horoscope", params: {}, auth: false, resolvedBy: 'app' },
  { key: 'bhajans.featured', title: 'Featured bhajans', params: {}, auth: false, resolvedBy: 'app' },
  { key: 'knowledge', title: 'Knowledge of the gods', params: {}, auth: false, resolvedBy: 'app' },
  { key: 'daily.today', title: "Today's quick blocks", params: {}, auth: false, resolvedBy: 'app' },
  { key: 'live.now', title: 'Temples live now', params: {}, auth: false, resolvedBy: 'app' },
];
export const SOURCE_KEYS = SOURCES.map((s) => s.key);

const NONE = { modes: [], sources: null };
const only = (source) => ({ modes: ['source'], sources: [source] });
const html = { type: 'html', maxBytes: LIMITS.html };
const text = { type: 'string', maxLength: LIMITS.text };

/**
 * `summary` is the one-line subtitle of a section row in the builder. Placeholders the dashboard substitutes from the block:
 * `{count}` (inline items), `{columns}` (quick_grid), `{source}` (the source's registry title). `fixed` types are the locked
 * "Top bar and search" row: first two blocks of every layout, never disabled, removed, moved or targeted (section 9.1).
 */
const t = (title, description, icon, props, data, summary, fixed = false) => ({
  title, description, minAppVersion: '1.0.0', icon, props, data, summary, ...(fixed ? { fixed: true } : {}),
});

export const BLOCK_TYPES = {
  header: t('Top bar', 'Greeting, avatar, wallet chip and the reminders bell.', 'home', { showWallet: { type: 'boolean', default: true } }, NONE, 'Greeting, coins, notifications', true),
  search: t('Search bar', 'The search field.', 'search', { placeholder: text, placeholderHi: text }, NONE, 'Search poojas, temples, bhajans', true),
  slider: t('Promo slider', 'The Home slider: managed slides, or your own images.', 'star', {}, { modes: ['source', 'inline'], sources: ['hero'] }, '{count} slides \u00b7 managed in Home slider'),
  quick_grid: t('Services grid', 'Icon tiles that open a screen.', 'sparkle', {
    columns: { type: 'integer', enum: [3, 4, 5], default: 4 },
    tileStyle: { type: 'string', enum: TILE_STYLE_KEYS, default: 'icon' },
  }, { modes: ['inline'], sources: null, maxItems: LIMITS.gridItems }, '{count} shortcuts \u00b7 {columns} per row'),
  shelf: t('Shelf of cards', 'A titled shelf of cards.', 'diya', { layout: { type: 'string', enum: SHELF_LAYOUTS, default: 'photo3' } }, {
    modes: ['inline', 'source'],
    sources: ['poojas.upcoming', 'poojas.featured', 'chadhava.listings', 'events.upcoming', 'events.mine', 'festivals.upcoming', 'bhajans.featured', 'knowledge', 'temples.saved', 'live.now'],
  }, '{source} \u00b7 {count} cards'),
  deity_row: t('Deity stories', 'Round deity chips.', 'lotus', {}, { modes: ['source', 'inline'], sources: ['deities'] }, 'Deity chips'),
  promo: t('Banner', 'One banner or a sanitised HTML card.', 'gift', { kind: { type: 'string', enum: ['banner', 'html'], default: 'banner' }, html, htmlHi: html }, { modes: ['inline'], sources: null, maxItems: 1 }, 'One banner or HTML card'),
  astrologer: t('Talk to an astrologer', 'Talk-to-an-astrologer card.', 'support', {}, only('astrologers.online'), 'Call and chat card'),
  featured_pooja: t('Festival banner', 'The featured pooja card.', 'diya', {}, only('poojas.featured'), 'The featured pooja'),
  daily: t('Daily darshan', "Today's darshan, aarti and panchang quick blocks.", 'clock', {}, only('daily.today'), 'Deity of the day \u00b7 opens the mandir'),
  panchang: t('Aaj ka Panchang', "Today's panchang card.", 'calendar', {}, only('panchang.today'), 'Tithi, nakshatra, sunrise, Rahu Kaal'),
  rashi_row: t('Aaj ka Rashifal', 'Zodiac chips.', 'star', {}, only('horoscope.today'), '12 signs'),
  temples_near: t('Temples near you', 'Temples near the devotee.', 'mapPin', {}, only('temples.near_me'), 'Needs location permission'),
  next_seva: t('Your next seva', "The devotee's next booking (hidden when none or signed out).", 'bag', {}, only('bookings.next'), 'Shown only to devotees with a booking'),
  listen: t('Listen now', 'Bhajan teaser.', 'music', {}, only('bhajans.featured'), 'Bhajan categories and tracks'),
  events: t('Your events', 'Events teaser: continue or upcoming.', 'calendar', {}, { modes: ['source'], sources: ['events.mine', 'events.upcoming'] }, '{source}'),
  share: t('Share with family', 'Share-the-app card.', 'share', { message: text, messageHi: text }, NONE, 'Share the app'),
  html: t('Custom HTML', 'Free HTML, sanitised on save and on read.', 'globe', { html, htmlHi: html }, NONE, 'Sanitised HTML'),
  spacer: t('Spacer', 'A vertical gap.', 'minus', { height: { type: 'integer', min: 4, max: 96, default: 16 } }, NONE, 'Vertical gap'),
  fab: t('Floating button', 'The floating action button (uses title and action).', 'plus', { icon: { type: 'string', enum: ICONS, default: 'music' } }, NONE, 'Floating action button'),
};

/** The body of `GET /admin/home-layout/registry`. */
export function registryView() {
  return {
    blockTypes: Object.entries(BLOCK_TYPES).map(([type, b]) => ({
      type, title: b.title, description: b.description, minAppVersion: b.minAppVersion, props: b.props, data: b.data, icon: b.icon, summary: b.summary, fixed: b.fixed === true,
    })),
    sources: SOURCES,
    actionTypes: ACTION_TYPES,
    icons: ICONS,
    tones: TONES,
    audiences: AUDIENCES,
    tileStyles: TILE_STYLES,
    flags: KNOWN_FLAGS,
    badges: BADGES,
    languages: LANGUAGES,
    limits: LIMITS,
  };
}

// The hero's own target list is a subset of the action types: keep that true.
for (const x of TARGET_TYPES) if (!ACTION_TYPES.includes(x)) throw new Error(`hero target ${x} is not a home action type`);
