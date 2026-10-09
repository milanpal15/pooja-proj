export type SectionKey = 'about' | 'benefits' | 'included' | 'process' | 'temple' | 'packages' | 'reviews' | 'faq';

/**
 * Which tab to highlight for a scroll offset: the last section whose top has
 * passed `y` (+ a little slack so a section lights up as it nears the bar).
 */
export function activeSection(
  tops: Partial<Record<SectionKey, number>>,
  order: SectionKey[],
  y: number,
  slack = 80,
): SectionKey | undefined {
  let current: SectionKey | undefined = order[0];
  for (const k of order) {
    const top = tops[k];
    if (top !== undefined && top - slack <= y) current = k;
  }
  return current;
}
