import { dayKey } from './journal-store';

/** Month label for the week strip, in the devotee's language. */
const MONTHS_EN = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

export function monthLabelFor(anchor: Date, lang: string | null) {
  if (lang === 'hi') {
    return anchor.toLocaleDateString('hi-IN', { month: 'long', year: 'numeric' });
  }
  return `${MONTHS_EN[anchor.getMonth()]} ${anchor.getFullYear()}`;
}

/**
 * The 7 days of the week containing `anchor` (Sun–Sat).
 *
 * `dot` marks days that actually have a saved entry — it used to mark "every
 * day earlier than today", which drew a full week of gold dots for a devotee
 * who had never written anything.
 */
export function getWeek(anchor: Date, written: Set<string>) {
  const DAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const todayKey = dayKey();
  const anchorKey = dayKey(anchor);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(anchor);
    d.setDate(anchor.getDate() - anchor.getDay() + i);
    const key = dayKey(d);
    return {
      d: DAY_LABELS[i],
      n: d.getDate(),
      key,
      date: d,
      dot: written.has(key),
      active: key === anchorKey,
      today: key === todayKey,
      /** Nothing has been chanted tomorrow yet. */
      future: key > todayKey,
    };
  });
}

export type WeekDay = ReturnType<typeof getWeek>[number];
