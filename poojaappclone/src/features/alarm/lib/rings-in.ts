/**
 * "in 11h 48m".
 *
 * The screen used to say nothing about this at all, which is how enabling
 * a reminder for a time that had already passed today looked identical to
 * a reminder that was simply broken.
 */
export function ringsIn(at: number | undefined, now: number, hi: boolean): string | null {
  if (!at) return null;
  const mins = Math.max(0, Math.round((at - now) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (hi) return h ? `${h} घंटे ${m} मिनट में` : `${m} मिनट में`;
  return h ? `in ${h}h ${m}m` : `in ${m}m`;
}
