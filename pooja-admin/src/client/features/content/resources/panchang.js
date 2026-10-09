import { todayKey } from '../../../lib/dates.js';

/**
 * Panchang override for one date.
 *
 * The app computes panchang on the device; this only overrides it. **Leave a
 * field blank and the device keeps its own computed value** — fill in only
 * what your tradition states differently. Times are free text, written the
 * way the temple publishes them.
 */
const PANCHANG_FIELDS = [
  { key: 'date', label: 'Date', type: 'date', col: true, default: todayKey },
  { key: 'tithi', label: 'Tithi', type: 'text', col: true },
  { key: 'paksha', label: 'Paksha', type: 'text', col: true },
  { key: 'nakshatra', label: 'Nakshatra', type: 'text', col: true },
  { key: 'yoga', label: 'Yoga', type: 'text' },
  { key: 'karana', label: 'Karana', type: 'text' },
  { key: 'masa', label: 'Masa', type: 'text' },
  { key: 'ritu', label: 'Ritu', type: 'text' },
  { key: 'sunrise', label: 'Sunrise (e.g. 5:51 AM)', type: 'text' },
  { key: 'sunset', label: 'Sunset (e.g. 5:40 PM)', type: 'text' },
  { key: 'abhijit', label: 'Abhijit Muhurat', type: 'text' },
  { key: 'rahuKaal', label: 'Rahu Kaal', type: 'text' },
  { key: 'yamaganda', label: 'Yamaganda', type: 'text' },
  { key: 'gulika', label: 'Gulika Kaal', type: 'text' },
  { key: 'note', label: 'Note shown to devotees (EN)', type: 'textarea' },
  { key: 'noteHi', label: 'Note shown to devotees (HI)', type: 'textarea' },
  { key: 'enabled', label: 'Visible', type: 'bool', col: true },
];

/** The tab's wiring: which API collection, what a row is called. */
export const panchangResource = {
  title: 'Panchang',
  resource: 'panchangs',
  fields: PANCHANG_FIELDS,
  previewKey: 'date',
};
