import { endOfDayIso, formatWhen, startOfDayIso } from '../../../lib/dates.js';

export const PAGE_SIZE = 50;
export const METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
export const NO_FILTERS = { operator: '', area: '', method: '', from: '', to: '' };

/** The GET /audit-log query for the filter form + a cursor (the previous page's `next`). Blank filters are left out. */
export function buildParams(filters, cursor) {
  return {
    operator: filters.operator.trim() || undefined,
    area: filters.area || undefined,
    method: filters.method || undefined,
    from: filters.from ? startOfDayIso(filters.from) : undefined,
    to: filters.to ? endOfDayIso(filters.to) : undefined,
    limit: PAGE_SIZE,
    before: cursor || undefined,
  };
}

export const hasFilters = (f) => Object.values(f).some(Boolean);

/** A date range typed backwards is a mistake worth saying out loud. */
export const rangeError = (f) => (f.from && f.to && f.from > f.to ? 'The start date is after the end date.' : '');

const VERB = { POST: 'Created', PUT: 'Changed', PATCH: 'Changed', DELETE: 'Deleted' };

/** "PUT /api/admin/version-policy" -> "Changed admin/version-policy". */
export function describe(e) {
  const path = String(e.path || '').replace(/^\/api\//, '').replace(/^\//, '');
  return `${VERB[e.method] || e.method || 'Did'} ${path}`.trim();
}

export const hasDetail = (e) => !!(e.before || e.after);

/** Rows the CSV export writes: exactly the page on screen. */
export const CSV_COLUMNS = [
  { header: 'When', value: (e) => e.at },
  { header: 'Operator', value: (e) => e.operator },
  { header: 'Role', value: (e) => e.role },
  { header: 'Area', value: (e) => e.area },
  { header: 'Method', value: (e) => e.method },
  { header: 'Path', value: (e) => e.path },
  { header: 'Target', value: (e) => e.targetId },
  { header: 'Result', value: (e) => e.status },
  { header: 'Self-approved', value: (e) => (e.selfApproved ? 'yes' : '') },
  { header: 'Before', value: (e) => (e.before ? JSON.stringify(e.before) : '') },
  { header: 'After', value: (e) => (e.after ? JSON.stringify(e.after) : '') },
];

export const csvName = (now = new Date()) => `audit-log-${now.toISOString().slice(0, 10)}.csv`;
export const whenLabel = formatWhen;

/** Result as a word: 2xx ok, 4xx refused, 5xx failed. */
export function resultTone(status) {
  const n = Number(status);
  if (n >= 500) return ['danger', `${n} failed`];
  if (n >= 400) return ['warning', `${n} refused`];
  if (n >= 200) return ['success', `${n} ok`];
  return ['neutral', String(status ?? '—')];
}
