import mongoose from 'mongoose';

import { blockedFilter } from './blocks.js';

/**
 * The Users list's query language (docs/USERS.md section 2): parse and validate the query string, build the Mongo filter, page with a cursor.
 * Pure apart from `mongoose.Types.ObjectId`; nothing here talks to the database.
 *
 *   q                   prefix search (case-insensitive) on name, e-mail, phone, contact and uid - every branch is an indexed prefix match
 *   status              all | active | blocked   (a timed block that has run out counts as active at once)
 *   tag, role           exact
 *   versionCode         devices on that build (resolved by the caller through the device registry into `uids`)
 *   lastActiveAfter/Before, createdFrom/To    ISO date or date-time; a bare date is a day in IST
 *   sort                lastActive | createdAt | name        dir  asc | desc (name: asc by default, the others desc)
 *   limit               default 50, max 200        cursor   opaque, from the previous page's `next`
 */
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;
const SORTS = { lastActive: 'lastActive', createdAt: 'createdAt', name: 'nameLower' };
const IST_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

export const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const one = (v) => (Array.isArray(v) ? v[0] : v);

/** A bare YYYY-MM-DD is the IST day it names; anything else must parse as a date-time. */
function parseWhen(v, { endOfDay = false } = {}) {
  if (typeof v !== 'string' || !v.trim()) return null;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const start = Date.parse(`${s}T00:00:00Z`);
    if (Number.isNaN(start)) return null;
    return new Date(start - IST_MS + (endOfDay ? DAY_MS : 0));
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The E.164-ish prefixes a typed number could be the start of (a number typed without the country code is tried as +91 too). */
export function phonePrefixes(q) {
  const s = q.replace(/[\s()-]/g, '');
  if (!/^\+?\d+$/.test(s)) return [];
  return s.startsWith('+') ? [s] : [`+${s}`, `+91${s}`];
}

/** `{ query }` (normalised) or `{ fields }` for `400 bad_filter`. */
export function parseListQuery(raw = {}) {
  const fields = {};
  const q = {};
  const str = (k, max) => {
    const v = one(raw[k]);
    if (v === undefined || v === '') return undefined;
    if (typeof v !== 'string' || v.length > max) { fields[k] = `Must be text of at most ${max} characters.`; return undefined; }
    return v.trim();
  };

  q.q = str('q', 80) ?? '';
  const status = str('status', 10) ?? 'all';
  if (!['all', 'active', 'blocked'].includes(status)) fields.status = 'One of all, active, blocked.';
  q.status = status;
  q.tag = str('tag', 40)?.toLowerCase();
  q.role = str('role', 12);
  if (q.role && !['devotee', 'astrologer'].includes(q.role)) fields.role = 'One of devotee, astrologer.';
  const vc = str('versionCode', 12);
  if (vc !== undefined) {
    if (!/^\d{1,9}$/.test(vc)) fields.versionCode = 'A whole number.';
    else q.versionCode = Number(vc);
  }
  for (const [key, end] of [['lastActiveAfter', false], ['lastActiveBefore', false], ['createdFrom', false], ['createdTo', true]]) {
    const v = str(key, 40);
    if (v === undefined) continue;
    const d = parseWhen(v, { endOfDay: end });
    if (!d) fields[key] = 'Not a valid date.';
    else q[key] = d;
  }
  const sort = str('sort', 12) ?? 'lastActive';
  if (!SORTS[sort]) fields.sort = 'One of lastActive, createdAt, name.';
  q.sort = sort;
  const dir = str('dir', 4) ?? (sort === 'name' ? 'asc' : 'desc');
  if (!['asc', 'desc'].includes(dir)) fields.dir = 'asc or desc.';
  q.dir = dir;
  const lim = str('limit', 6);
  if (lim === undefined) q.limit = DEFAULT_LIMIT;
  else if (!/^\d{1,4}$/.test(lim) || Number(lim) < 1) fields.limit = `A whole number from 1 to ${MAX_LIMIT}.`;
  else q.limit = Math.min(Number(lim), MAX_LIMIT);
  q.cursor = str('cursor', 400);
  return Object.keys(fields).length ? { fields } : { query: q };
}

/** The search branches for `q`. */
function searchBranches(text) {
  const lowerRe = new RegExp(`^${escapeRe(text.toLowerCase())}`);
  const asTyped = new RegExp(`^${escapeRe(text)}`);
  const branches = [{ nameLower: lowerRe }, { emailLower: lowerRe }, { contact: asTyped }, { uid: asTyped }];
  const phones = phonePrefixes(text);
  for (const p of phones) branches.push({ phone: new RegExp(`^${escapeRe(p)}`) });
  return branches;
}

/**
 * The Mongo filter for a parsed query (everything except paging). `uids`: the accounts on `versionCode` according to the device registry
 * (an array, possibly empty) or undefined when the filter was not asked for.
 */
export function buildFilter(query, { now = new Date(), uids } = {}) {
  const and = [];
  if (query.q) and.push({ $or: searchBranches(query.q) });
  if (query.status === 'blocked') and.push(blockedFilter(now));
  if (query.status === 'active') and.push({ $nor: [blockedFilter(now)] });
  if (query.tag) and.push({ tags: query.tag });
  if (query.role === 'astrologer') and.push({ role: 'astrologer' });
  if (query.role === 'devotee') and.push({ role: { $ne: 'astrologer' } });
  if (uids !== undefined) and.push({ uid: { $in: uids } });
  const range = (field, from, to) => {
    if (from || to) and.push({ [field]: { ...(from ? { $gte: from } : {}), ...(to ? { $lt: to } : {}) } });
  };
  range('lastActive', query.lastActiveAfter, query.lastActiveBefore);
  range('createdAt', query.createdFrom, query.createdTo);
  return and.length ? { $and: and } : {};
}

/* ------------------------------------------------------------------ cursor paging -- */

export const sortField = (query) => SORTS[query.sort];

/** The value a row sorts by, in the form it goes into a cursor. */
function sortValue(query, row) {
  const v = row[sortField(query)];
  return v instanceof Date ? v.toISOString() : v ?? '';
}

export const encodeCursor = (query, row) => Buffer.from(JSON.stringify({ v: sortValue(query, row), id: String(row._id) })).toString('base64url');

/** `{ after }` (a Mongo condition) or `{ bad: true }` for a cursor that is not ours. */
export function cursorCondition(query, cursor) {
  if (!cursor) return {};
  let c;
  try {
    c = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    return { bad: true };
  }
  if (!c || typeof c.id !== 'string' || !mongoose.isValidObjectId(c.id) || (typeof c.v !== 'string' && typeof c.v !== 'number')) return { bad: true };
  const field = sortField(query);
  const value = field === 'nameLower' ? String(c.v) : new Date(c.v);
  if (field !== 'nameLower' && Number.isNaN(value.getTime())) return { bad: true };
  const op = query.dir === 'asc' ? '$gt' : '$lt';
  const id = new mongoose.Types.ObjectId(c.id);
  return { after: { $or: [{ [field]: { [op]: value } }, { [field]: value, _id: { [op]: id } }] } };
}

export const sortSpec = (query) => {
  const d = query.dir === 'asc' ? 1 : -1;
  return { [sortField(query)]: d, _id: d };
};
