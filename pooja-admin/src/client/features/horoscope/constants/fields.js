import { todayKey } from '../../../lib/dates.js';
import { RASHIS } from './rashis.js';

/**
 * Daily readings, one row per sign per day.
 *
 * `rashi` + `date` are unique together. Editorial content — the app shows
 * nothing at all for a day with no rows rather than inventing a prediction.
 * Used by the "Show all dates" table; the day view writes through ReadingModal.
 */
export const HOROSCOPE_FIELDS = [
  {
    key: 'rashi',
    label: 'Rashi',
    type: 'select',
    col: true,
    options: RASHIS.map((r) => ({ value: r.value, label: `${r.name} (${r.en})` })),
  },
  { key: 'date', label: 'Date', type: 'date', col: true, default: todayKey },
  { key: 'prediction', label: 'Reading (EN)', type: 'textarea', col: true },
  { key: 'predictionHi', label: 'Reading (HI)', type: 'textarea' },
  { key: 'luckyColor', label: 'Lucky colour (EN)', type: 'text' },
  { key: 'luckyColorHi', label: 'Lucky colour (HI)', type: 'text' },
  { key: 'luckyNumber', label: 'Lucky number', type: 'text' },
  { key: 'enabled', label: 'Visible', type: 'bool', col: true },
];
