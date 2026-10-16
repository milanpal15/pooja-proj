import { endOfDayIso, startOfDayIso } from '../../../lib/dates.js';
import { normaliseTag } from './tags.js';

/** The list's server-side query (docs/USERS.md §2): filters + sort + cursor -> the `GET /admin/users` parameters. */
export const PAGE_SIZE = 50;

export const NO_FILTERS = { q: '', status: 'all', tag: '', role: '', versionCode: '', lastActive: '', createdFrom: '', createdTo: '' };
export const DEFAULT_SORT = { sort: 'lastActive', dir: 'desc' };
export const SORTS = [
  { value: 'lastActive', label: 'Last active' },
  { value: 'createdAt', label: 'Created' },
  { value: 'name', label: 'Name' },
];

export const STATUS_OPTIONS = [
  { value: 'all', label: 'All users' },
  { value: 'active', label: 'Active' },
  { value: 'blocked', label: 'Blocked' },
];
export const ROLE_OPTIONS = [
  { value: '', label: 'Any role' },
  { value: 'devotee', label: 'Devotee' },
  { value: 'astrologer', label: 'Astrologer' },
];
export const LAST_ACTIVE_PRESETS = [
  { value: '', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'inactive30', label: 'Inactive 30+ days' },
  { value: 'inactive90', label: 'Inactive 90+ days' },
];

const DAY = 86400000;

/** A preset -> `lastActiveAfter` / `lastActiveBefore` (ISO instants). `now` is injected so it is testable. */
export function lastActiveRange(preset, now = new Date()) {
  const ago = (days) => new Date(now.getTime() - days * DAY).toISOString();
  switch (preset) {
    case 'today': {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return { lastActiveAfter: d.toISOString() };
    }
    case '7d':
      return { lastActiveAfter: ago(7) };
    case '30d':
      return { lastActiveAfter: ago(30) };
    case 'inactive30':
      return { lastActiveBefore: ago(30) };
    case 'inactive90':
      return { lastActiveBefore: ago(90) };
    default:
      return {};
  }
}

/** A build number typed by a person: digits only, otherwise ignored. */
const code = (v) => (/^\d{1,9}$/.test(String(v ?? '').trim()) ? String(Number(String(v).trim())) : undefined);

/**
 * The filters actually sent. Blank / default filters are left out (the server's defaults apply).
 * `q` is trimmed; the tag is normalised the way the API stores it.
 */
export function filterParams(filters, now = new Date()) {
  const f = { ...NO_FILTERS, ...filters };
  const p = {
    q: f.q.trim() || undefined,
    status: f.status && f.status !== 'all' ? f.status : undefined,
    tag: normaliseTag(f.tag) || undefined,
    role: f.role || undefined,
    versionCode: code(f.versionCode),
    ...lastActiveRange(f.lastActive, now),
    createdFrom: f.createdFrom ? startOfDayIso(f.createdFrom) : undefined,
    createdTo: f.createdTo ? endOfDayIso(f.createdTo) : undefined,
  };
  return Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined));
}

/** `GET /admin/users` parameters for one page. `cursor` is the previous page's `next`. */
export function buildListQuery(filters, sort = DEFAULT_SORT, { limit = PAGE_SIZE, cursor } = {}, now = new Date()) {
  const s = { ...DEFAULT_SORT, ...sort };
  return { ...filterParams(filters, now), sort: s.sort, dir: s.dir, limit, cursor: cursor || undefined };
}

/** The export takes the same filters and sort, never a limit or cursor (the server caps it at 50 000). */
export function buildExportQuery(filters, sort = DEFAULT_SORT, now = new Date()) {
  const { limit, cursor, ...rest } = buildListQuery(filters, sort, {}, now);
  return rest;
}

export const filtersEqual = (a, b) => Object.keys(NO_FILTERS).every((k) => String(a?.[k] ?? '') === String(b?.[k] ?? ''));
/** How many filters (not counting the search box) are narrowing the list. */
export const activeFilterCount = (f) => ['status', 'tag', 'role', 'versionCode', 'lastActive', 'createdFrom', 'createdTo'].filter((k) => (k === 'status' ? f[k] && f[k] !== 'all' : String(f[k] ?? '').trim() !== '')).length;
export const hasAnyFilter = (f) => activeFilterCount(f) > 0 || !!String(f.q ?? '').trim();

export const dateRangeError = (f) => (f.createdFrom && f.createdTo && f.createdFrom > f.createdTo ? 'The start date is after the end date.' : '');

/* ------------------------------------------------------------ cursor paging -- */

export const emptyPage = () => ({ rows: [], next: null, total: null });

/** Fold a page into what is already loaded. `replace` starts over (a new search); otherwise rows append, de-duplicated by id. */
export function mergePage(state, page, { replace = false } = {}) {
  const base = replace ? [] : state.rows;
  const seen = new Set(base.map((r) => r.id));
  const fresh = (page.users ?? []).filter((r) => !seen.has(r.id));
  return { rows: [...base, ...fresh], next: page.next ?? null, total: page.total ?? null };
}

/** "Showing 50 of 1,203", or "Showing 50 of many" when the server did not count. */
export function countLabel({ rows, next, total }) {
  const n = rows.length;
  if (total != null) return `Showing ${n.toLocaleString('en-IN')} of ${Number(total).toLocaleString('en-IN')}`;
  return next ? `Showing ${n.toLocaleString('en-IN')} of many` : `${n.toLocaleString('en-IN')} ${n === 1 ? 'user' : 'users'}`;
}
