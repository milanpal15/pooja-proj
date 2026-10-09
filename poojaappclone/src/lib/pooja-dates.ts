/** `YYYY-MM-DD` as a local date (not UTC, which is a day behind in IST mornings). */
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** "Sun, 11 Oct" — or null for a pooja with no fixed date ("every day"). */
export function formatPoojaDate(iso: string | null | undefined, lang: string | null): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  return parseDay(iso.slice(0, 10)).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** "8 Oct, 11:42 am" for status timestamps. */
export function formatStamp(iso: string | null | undefined, lang: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(lang === 'hi' ? 'hi-IN' : 'en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}
