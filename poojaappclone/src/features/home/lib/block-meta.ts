/**
 * What the app knows about each block type, with no React in it so tests (and
 * the layout filter) can read it. The components live in `components/blocks/`
 * (the REGISTRY); `components/blocks/index.ts` is typed `Record<BlockType, …>`
 * so a type added here without a component fails the typecheck.
 */

/** pinned = above the scroll (the header); flow = in the scroll; float = over it (the fab). */
export type Place = 'pinned' | 'flow' | 'float';
/** gutter = the 16px side padding; bleed = edge to edge (the block pads itself). */
export type FrameKind = 'gutter' | 'bleed';
/** top = the 16px-gap band under the search bar; stack = the 24px-gap stack after it. */
export type Group = 'top' | 'stack';

export type BlockMeta = { minAppVersion: string; place: Place; frame: FrameKind; group: Group };

const M = (place: Place, frame: FrameKind, group: Group): BlockMeta => ({ minAppVersion: '1.0.0', place, frame, group });

export const BLOCK_META = {
  header: M('pinned', 'gutter', 'top'),
  search: M('flow', 'gutter', 'top'),
  slider: M('flow', 'bleed', 'top'),
  astrologer: M('flow', 'gutter', 'top'),
  deity_row: M('flow', 'bleed', 'top'),
  spacer: M('flow', 'bleed', 'top'),
  quick_grid: M('flow', 'gutter', 'stack'),
  shelf: M('flow', 'gutter', 'stack'),
  promo: M('flow', 'gutter', 'stack'),
  featured_pooja: M('flow', 'gutter', 'stack'),
  daily: M('flow', 'gutter', 'stack'),
  panchang: M('flow', 'gutter', 'stack'),
  rashi_row: M('flow', 'gutter', 'stack'),
  temples_near: M('flow', 'gutter', 'stack'),
  next_seva: M('flow', 'gutter', 'stack'),
  listen: M('flow', 'gutter', 'stack'),
  events: M('flow', 'gutter', 'stack'),
  share: M('flow', 'gutter', 'stack'),
  html: M('flow', 'gutter', 'stack'),
  fab: M('float', 'bleed', 'top'),
} as const satisfies Record<string, BlockMeta>;

export type BlockType = keyof typeof BLOCK_META;

export function metaFor(type: string): BlockMeta | undefined {
  return Object.prototype.hasOwnProperty.call(BLOCK_META, type) ? BLOCK_META[type as BlockType] : undefined;
}

/** Contract §3. `auth` sources are empty for guests. */
export const SOURCE_AUTH = {
  hero: false,
  deities: false,
  'poojas.featured': false,
  'poojas.upcoming': false,
  'chadhava.listings': false,
  'temples.near_me': false,
  'temples.saved': true,
  'festivals.upcoming': false,
  'events.upcoming': false,
  'events.mine': true,
  'bookings.next': true,
  'astrologers.online': false,
  'panchang.today': false,
  'horoscope.today': false,
  'bhajans.featured': false,
  knowledge: false,
  'daily.today': false,
} as const satisfies Record<string, boolean>;

export type SourceKey = keyof typeof SOURCE_AUTH;

export function isSourceKey(key: unknown): key is SourceKey {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(SOURCE_AUTH, key);
}

/** Sources a `shelf` may bind to (contract §2). */
export const SHELF_SOURCES: readonly SourceKey[] = [
  'poojas.upcoming',
  'poojas.featured',
  'chadhava.listings',
  'events.upcoming',
  'events.mine',
  'festivals.upcoming',
  'bhajans.featured',
  'knowledge',
  'temples.saved',
];
