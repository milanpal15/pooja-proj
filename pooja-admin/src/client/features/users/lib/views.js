import { DEFAULT_SORT, NO_FILTERS } from './query.js';
import { normaliseTag } from './tags.js';

/**
 * Saved views and the column choice live in THIS browser only (localStorage). They hold filters, a sort and column ids —
 * never the search text, and never a name, phone number or e-mail (docs/USERS.md §5, DESIGN.md privacy rules).
 */
export const VIEWS_KEY = 'bhakti.users.views';
export const COLUMNS_KEY = 'bhakti.users.columns';
export const MAX_VIEWS = 12;
export const VIEW_NAME_MAX = 40;

export const COLUMNS = [
  { id: 'name', label: 'Name', locked: true },
  { id: 'contact', label: 'Contact', on: true },
  { id: 'method', label: 'Sign-in', on: false },
  { id: 'role', label: 'Role', on: true },
  { id: 'status', label: 'Status', on: true },
  { id: 'tags', label: 'Tags', on: true },
  { id: 'version', label: 'App version', on: true },
  { id: 'push', label: 'Push', on: false },
  { id: 'lastActive', label: 'Last active', on: true },
  { id: 'createdAt', label: 'Created', on: false },
];
export const DEFAULT_COLUMNS = COLUMNS.filter((c) => c.on || c.locked).map((c) => c.id);

/** Only known column ids, in the table's own order, with the locked ones always present. */
export function sanitizeColumns(ids) {
  const want = new Set(Array.isArray(ids) ? ids : DEFAULT_COLUMNS);
  const out = COLUMNS.filter((c) => c.locked || want.has(c.id)).map((c) => c.id);
  return out.length ? out : DEFAULT_COLUMNS;
}

/** Filters minus the free-text search: the search box can hold a person's name or number. */
export function storableFilters(filters) {
  const f = { ...NO_FILTERS, ...filters };
  const { q, ...rest } = f;
  return { ...rest, tag: normaliseTag(rest.tag), versionCode: /^\d+$/.test(String(rest.versionCode)) ? String(rest.versionCode) : '' };
}

const cleanName = (n) => String(n ?? '').replace(/\s+/g, ' ').trim().slice(0, VIEW_NAME_MAX);

export function makeView(name, filters, sort, columns) {
  const nm = cleanName(name);
  if (!nm) return null;
  const s = { ...DEFAULT_SORT, ...sort };
  return { name: nm, filters: storableFilters(filters), sort: { sort: s.sort, dir: s.dir === 'asc' ? 'asc' : 'desc' }, columns: sanitizeColumns(columns) };
}

/** Read whatever is in storage defensively: bad shapes are dropped, and a stray `q` is never kept. */
export function sanitizeViews(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const v of raw) {
    if (!v || typeof v !== 'object') continue;
    const made = makeView(v.name, v.filters ?? {}, v.sort ?? {}, v.columns);
    if (made && !out.some((x) => x.name === made.name)) out.push(made);
  }
  return out.slice(0, MAX_VIEWS);
}

/** Add or replace (by name); the newest goes last; the list is capped. */
export function upsertView(list, view) {
  const rest = list.filter((v) => v.name !== view.name);
  return [...rest, view].slice(-MAX_VIEWS);
}
export const removeView = (list, name) => list.filter((v) => v.name !== name);
