/** 281 -> "4 min 41 sec" using the caller's translated templates. */
export function formatClockWords(totalSec: number, minSecTpl: string, secTpl: string): string {
  const s = Math.max(0, Math.round(totalSec));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return (m > 0 ? minSecTpl : secTpl).replace('{m}', String(m)).replace('{s}', String(rest));
}
