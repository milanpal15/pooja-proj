const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** `YYYY-MM-DD` → local Date, avoiding the UTC shift `new Date(str)` applies. */
function parseDay(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function monthLabel(iso: string, hi: boolean) {
  const d = parseDay(iso);
  if (hi) return d.toLocaleDateString('hi-IN', { month: 'long', year: 'numeric' });
  return `${MONTHS_EN[d.getMonth()]} ${d.getFullYear()}`;
}

export function dayLabel(iso: string, hi: boolean) {
  const d = parseDay(iso);
  return d.toLocaleDateString(hi ? 'hi-IN' : 'en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}
