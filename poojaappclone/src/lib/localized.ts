/**
 * The API ships every localisable text with an `xxxHi` twin. Hindi is shown
 * only when the devotee reads Hindi AND the operator wrote it — an empty twin
 * falls back to English rather than rendering a blank line.
 */
export function pick(lang: string | null, en?: string | null, hi?: string | null): string {
  if (lang === 'hi' && hi && hi.trim()) return hi;
  return en ?? '';
}
