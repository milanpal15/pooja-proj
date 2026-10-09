import type { RemoteHomeItem, RemoteHomeSection } from '@/providers/content';

import { inWindow } from './schedule';

/** Hide an item only when its flag is KNOWN to be off — an unknown key (offline) stays. */
export function visibleItems(items: RemoteHomeItem[], flags: Record<string, boolean>): RemoteHomeItem[] {
  return items.filter((i) => !i.flag || flags[i.flag] !== false);
}

/**
 * Sections to draw now: enabled, inside their window, in `order`, with
 * flag-hidden items removed. A section that HAD items and has none left is
 * dropped (an empty shelf is a blank hole); one without an `items` key
 * (hero, festivals…) is kept.
 */
export function renderableSections(
  sections: RemoteHomeSection[],
  flags: Record<string, boolean>,
  now: number | Date,
): RemoteHomeSection[] {
  const t = typeof now === 'number' ? now : now.getTime();
  return sections
    .filter((s) => s.enabled !== false && inWindow(s.startsAt, s.endsAt, t))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .flatMap((s) => {
      if (!Array.isArray(s.items)) return [s];
      const items = visibleItems(s.items, flags);
      return items.length ? [{ ...s, items }] : [];
    });
}

/** The sources the approved fixed Home draws itself; these are the only ones left to the dashboard. */
const SHELF_SOURCES: ReadonlySet<string> = new Set(['custom', 'knowledge']);

/**
 * Keep only the shelf sections. hero, astrologer, grid, festivals, daily,
 * temples, features and darshan are rendered by the fixed layout, so drawing
 * them again from `home.sections` would duplicate them.
 */
export function shelfSections(sections: RemoteHomeSection[]): RemoteHomeSection[] {
  return sections.filter((s) => SHELF_SOURCES.has(s.source));
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
