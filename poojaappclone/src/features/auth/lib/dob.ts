import type { DobParts } from '../types';

/**
 * Date of birth as three numeric boxes.
 *
 * Deliberately not a platform date picker: that is another native module
 * and another rebuild, and a wheel scrolled back sixty years is worse than
 * typing a year.
 */
/** A real date — not just three numbers of the right length. */
export function isRealDate(yyyy: string, mm: string, dd: string): boolean {
  const y = Number(yyyy);
  const m = Number(mm);
  const d = Number(dd);
  if (y < 1900 || m < 1 || m > 12 || d < 1) return false;
  // Day 0 of the next month is the last day of this one, which is the
  // short way to get February and the 30-day months right.
  return d <= new Date(y, m, 0).getDate();
}

export const splitDob = (v: string): DobParts =>
  /^\d{4}-\d{2}-\d{2}$/.test(v)
    ? { d: v.slice(8, 10), m: v.slice(5, 7), y: v.slice(0, 4) }
    : { d: '', m: '', y: '' };

/** The parts as `YYYY-MM-DD`, or '' while they are incomplete or impossible. */
export const joinDob = ({ d, m, y }: DobParts): string =>
  d.length === 2 && m.length === 2 && y.length === 4 && isRealDate(y, m, d) ? `${y}-${m}-${d}` : '';
