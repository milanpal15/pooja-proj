/**
 * Chips for the empty state, taken from what the app really has: deity names first, then a
 * couple of temples and one aarti. Nothing is made up, so an unfilled dashboard gives none.
 */
export function buildSuggestions(
  src: { deities: unknown[]; temples: unknown[]; aartis: unknown[] },
  max = 8,
): string[] {
  const names = (list: unknown[]) =>
    list
      .map((x) => (typeof x === 'string' ? x : ((x as { name?: unknown; title?: unknown } | null)?.name ?? (x as { title?: unknown } | null)?.title)))
      .filter((s): s is string => typeof s === 'string' && !!s.trim())
      .map((s) => s.trim());
  const buckets = [names(src.deities).slice(0, 4), names(src.temples).slice(0, 2), names(src.aartis).slice(0, 2)];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of buckets.flat()) {
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out.slice(0, max);
}
