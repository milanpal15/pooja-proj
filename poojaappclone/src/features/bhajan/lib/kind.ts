import type { Track, TrackKind } from '../types';

export const KINDS: TrackKind[] = ['aarti', 'bhajan', 'chalisa', 'mantra', 'paath'];

/** Words (English and Devanagari) that mark a track's kind, checked in this order. */
const KEYWORDS: [TrackKind, RegExp][] = [
  ['chalisa', /chalisa|चालीसा/i],
  ['aarti', /aarti|arti|आरती/i],
  ['mantra', /mantra|मंत्र|jaap|जाप/i],
  ['paath', /paath|path\b|stotra|stotram|stuti|sukt|पाठ|स्तोत्र/i],
];

/**
 * Which tile a track belongs to. Nothing is invented: the dashboard's own
 * `category`, if it already names a kind, wins; otherwise the title says it;
 * everything else is a plain bhajan.
 */
export function trackKind(t: Pick<Track, 'title' | 'category'>): TrackKind {
  const own = t.category.toLowerCase() as TrackKind;
  if (KINDS.includes(own)) return own;
  for (const [kind, re] of KEYWORDS) if (re.test(t.title)) return kind;
  return 'bhajan';
}

/** Kinds that have at least one track, in tile order — an empty tile is not shown. */
export function kindsPresent(tracks: Pick<Track, 'title' | 'category'>[]): TrackKind[] {
  const have = new Set(tracks.map(trackKind));
  return KINDS.filter((k) => have.has(k));
}
