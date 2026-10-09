/** `YYYY-MM-DD` (or a longer ISO string) as a LOCAL date — UTC parsing is a day behind in IST mornings. */
export function parseDay(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/**
 * Whole calendar days from today to `iso` (0 = today, 1 = tomorrow, negative =
 * past). Null for an undated or malformed value ("every day" poojas).
 */
export function daysUntil(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const target = parseDay(iso);
  if (!target) return null;
  const n = new Date(now);
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}
