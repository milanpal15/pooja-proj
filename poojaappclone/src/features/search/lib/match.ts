import { normalize, tokenize } from './normalize';

/**
 * What a searchable thing exposes. `primary` is the name a devotee would type (title, Hindi
 * title); `secondary` is everything that merely describes it (place, tagline, tags).
 */
export type Fields = { primary: unknown[]; secondary?: unknown[] };

/** Per-token tiers. Anything that matches a title beats anything that only matches a description. */
const T_TITLE_PREFIX = 40;
const T_TITLE_WORD = 30;
const T_TITLE_CONTAINS = 20;
const T_META_WORD = 8;
const T_META_CONTAINS = 4;
/** Extra when the whole query, in order, starts the title. */
const WHOLE_PREFIX_BONUS = 25;

function wordStart(hay: string, tok: string): boolean {
  return hay.startsWith(tok) || hay.includes(` ${tok}`);
}

function tokenScore(tok: string, primary: string[], secondary: string[]): number {
  let best = 0;
  for (const p of primary) {
    if (!p) continue;
    if (p.startsWith(tok)) return T_TITLE_PREFIX;
    if (wordStart(p, tok)) best = Math.max(best, T_TITLE_WORD);
    else if (p.includes(tok)) best = Math.max(best, T_TITLE_CONTAINS);
  }
  if (best) return best;
  for (const s of secondary) {
    if (!s) continue;
    if (wordStart(s, tok)) best = Math.max(best, T_META_WORD);
    else if (s.includes(tok)) best = Math.max(best, T_META_CONTAINS);
  }
  return best;
}

/**
 * Score one item for a query: every word of the query must match somewhere (AND), otherwise 0.
 * Null / non-string fields count as empty and never throw.
 */
export function scoreItem(fields: Fields, query: string): number {
  const toks = tokenize(query);
  if (!toks.length) return 0;
  const primary = (fields.primary ?? []).map(normalize);
  const secondary = (fields.secondary ?? []).map(normalize);
  let total = 0;
  for (const tok of toks) {
    const s = tokenScore(tok, primary, secondary);
    if (!s) return 0;
    total += s;
  }
  const whole = normalize(query);
  if (primary.some((p) => p && p.startsWith(whole))) total += WHOLE_PREFIX_BONUS;
  return total;
}

/** Items that match, best first; equal scores keep their original order (stable). */
export function rank<T>(items: readonly T[], query: string, fieldsOf: (item: T) => Fields): T[] {
  if (!tokenize(query).length) return [];
  return items
    .map((item, index) => ({ item, index, score: scoreItem(fieldsOf(item), query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((r) => r.item);
}
