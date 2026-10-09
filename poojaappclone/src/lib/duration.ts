/** Pure time helpers shared by the call screens. */

const pad = (n: number) => String(n).padStart(2, '0');

/** 252 -> "04:12"; 3725 -> "1:02:05". */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

/** Seconds elapsed since an ISO timestamp, never negative. */
export function secondsSince(iso?: string | null, now = Date.now()): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 1000)) : 0;
}

/** Seconds between two ISO timestamps. */
export function secondsBetween(a?: string | null, b?: string | null): number {
  if (!a || !b) return 0;
  const x = Date.parse(a);
  const y = Date.parse(b);
  return Number.isFinite(x) && Number.isFinite(y) ? Math.max(0, Math.round((y - x) / 1000)) : 0;
}
