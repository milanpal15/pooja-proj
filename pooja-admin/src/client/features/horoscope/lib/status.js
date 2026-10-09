import { RASHIS } from '../constants/rashis.js';
import { parseDay, shiftDate } from '../../../lib/dates.js';

/**
 * A reading counts as *written* when it has text in either language, and as
 * *published* when it is written and `enabled`. A written, disabled reading is
 * a draft: the app shows "not published yet" for it, never the draft.
 */
export const isWritten = (r) => !!(r && (r.prediction || r.predictionHi));
export const statusOf = (r) => (!isWritten(r) ? 'empty' : r.enabled ? 'pub' : 'hidden');

export const PILL = { pub: 'Published', hidden: 'Hidden', empty: 'Not published' };

export const blankReading = (rashi, date) => ({
  rashi,
  date,
  prediction: '',
  predictionHi: '',
  luckyColor: '',
  luckyColorHi: '',
  luckyNumber: '',
  enabled: true,
});

/**
 * rashi+date is unique server-side, so one row per cell; the first wins if a
 * legacy duplicate ever slipped in. -> Map(date -> Map(rashi -> row)).
 */
export function indexByDate(rows) {
  const m = new Map();
  for (const r of rows || []) {
    if (!m.has(r.date)) m.set(r.date, new Map());
    const day = m.get(r.date);
    if (!day.has(r.rashi)) day.set(r.rashi, r);
  }
  return m;
}

/** The twelve cards for one day, and how many are published / hidden / empty. */
export function dayCards(byDate, date) {
  const day = byDate.get(date) || new Map();
  const cards = RASHIS.map((s) => ({ ...s, row: day.get(s.value) }));
  const counts = { pub: 0, hidden: 0, empty: 0 };
  cards.forEach((c) => (counts[statusOf(c.row)] += 1));
  return { cards, counts, written: counts.pub + counts.hidden };
}

/** Seven days centred on `date`, each with its written count. */
export const weekAround = (byDate, date) =>
  [-3, -2, -1, 0, 1, 2, 3].map((n) => {
    const k = shiftDate(date, n);
    const d = parseDay(k);
    const dm = byDate.get(k);
    const filled = dm ? [...dm.values()].filter(isWritten).length : 0;
    return {
      key: k,
      dow: d.toLocaleDateString('en-GB', { weekday: 'short' }),
      num: d.getDate(),
      filled,
      selected: n === 0,
    };
  });
