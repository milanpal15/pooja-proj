/**
 * Poojas are performed in India, so "the pooja day" is an IST calendar day no
 * matter what timezone the server runs in (Render's is UTC, which would flip
 * "today" at 5:30 am for every devotee).
 */
const IST = '+05:30';

export const istToday = (now = new Date()) => new Date(now.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
export const dayStart = (date) => new Date(`${date}T00:00:00${IST}`);

export function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
