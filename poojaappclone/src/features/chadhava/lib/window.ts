/** "11 Oct to 19 Oct" style window; empty when the listing has no dates. */
export function dayLabel(iso: string | null | undefined, lang: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short' });
}
