import { DEFAULT_BLOCK_MESSAGE, DEFAULT_BLOCK_MESSAGE_HI } from '@bhakti/common';

/**
 * The block rules in one place (docs/USERS.md sections 1-3). Pure: no database, the clock is an argument.
 *
 * `User.blocked` (bool) is kept for every reader that existed before `block`; this file is how it is derived and how both stay in step.
 */
export const MAX_TEXT = 300;
export const HISTORY_LIMIT = 20;
export const NOTES_LIMIT = 50;
export const NOTE_MAX = 500;
export const TAGS_LIMIT = 10;
export const TAG_MAX = 24;
export const MAX_BLOCK_YEARS = 10;

const asDate = (v) => (v instanceof Date ? v : new Date(v));

/**
 * Is this account blocked at `now`? A block with an `until` in the past is NOT, immediately - the sweeper only tidies the stored flag afterwards.
 * A row with a bare `blocked: true` and no active `block` (written before blocks carried a reason, or by hand) is blocked: fail closed.
 */
export function isBlocked(doc, now = new Date()) {
  const b = doc?.block;
  if (b?.active) return !b.until || asDate(b.until) > now;
  return doc?.blocked === true;
}

/** The Mongo filter for "blocked at `now`" - the same rule as isBlocked, for the list and the sweeper's complement. */
export function blockedFilter(now = new Date()) {
  return {
    $or: [
      { 'block.active': true, $or: [{ 'block.until': null }, { 'block.until': { $gt: now } }] },
      { 'block.active': { $ne: true }, blocked: true },
    ],
  };
}

/** What the operator sees of a block (internal reason included). null when the account never had one. */
export function blockView(doc, now = new Date()) {
  const b = doc?.block;
  if (!b) return doc?.blocked === true ? { active: true, scope: 'account', reason: '', message: '', messageHi: '', until: null, at: null, by: null } : null;
  return {
    active: isBlocked(doc, now),
    scope: b.scope || 'account',
    reason: b.reason || '',
    message: b.message || '',
    messageHi: b.messageHi || '',
    until: b.until ? asDate(b.until).toISOString() : null,
    at: b.at ? asDate(b.at).toISOString() : null,
    by: b.by || null,
  };
}

/** What the PHONE is told: the operator's message only, never the internal reason or who blocked. */
export function phoneBlock(src) {
  const message = (src?.message || '').trim();
  return {
    message: message || DEFAULT_BLOCK_MESSAGE,
    messageHi: (src?.messageHi || '').trim() || (message ? '' : DEFAULT_BLOCK_MESSAGE_HI),
    until: src?.until ? asDate(src.until).toISOString() : null,
  };
}

/** History rows, newest first. */
export const historyView = (doc) =>
  [...(doc?.blockHistory ?? [])].reverse().map((h) => ({
    action: h.action,
    at: h.at ? asDate(h.at).toISOString() : null,
    by: h.by || null,
    reason: h.reason || '',
    message: h.message || '',
    until: h.until ? asDate(h.until).toISOString() : null,
  }));

const text = (v) => (typeof v === 'string' ? v.trim() : undefined);

/**
 * Validate the body of a block (user or device). `{ value }` or `{ fields }` (field -> message) for `400 bad_block`.
 * `until`: absent / null / '' = until an operator unblocks; otherwise an ISO date in the future (and not absurdly far).
 */
export function parseBlockBody(body, now = new Date()) {
  const b = body && typeof body === 'object' ? body : {};
  const fields = {};
  const reason = text(b.reason);
  const message = text(b.message);
  const messageHi = b.messageHi === undefined || b.messageHi === null ? '' : text(b.messageHi);
  if (!reason) fields.reason = 'Give the internal reason.';
  else if (reason.length > MAX_TEXT) fields.reason = `At most ${MAX_TEXT} characters.`;
  if (!message) fields.message = 'Write the message the person will read.';
  else if (message.length > MAX_TEXT) fields.message = `At most ${MAX_TEXT} characters.`;
  if (messageHi === undefined) fields.messageHi = 'Must be text.';
  else if (messageHi.length > MAX_TEXT) fields.messageHi = `At most ${MAX_TEXT} characters.`;
  let until = null;
  if (b.until !== undefined && b.until !== null && b.until !== '') {
    const d = typeof b.until === 'string' || typeof b.until === 'number' ? new Date(b.until) : new Date(NaN);
    if (Number.isNaN(d.getTime())) fields.until = 'Not a valid date.';
    else if (d <= now) fields.until = 'The end date must be in the future.';
    else if (d.getTime() - now.getTime() > MAX_BLOCK_YEARS * 366 * 86_400_000) fields.until = `At most ${MAX_BLOCK_YEARS} years ahead; leave it empty for no end date.`;
    else until = d;
  }
  if (b.alsoBlockDevices !== undefined && typeof b.alsoBlockDevices !== 'boolean') fields.alsoBlockDevices = 'Must be true or false.';
  if (Object.keys(fields).length) return { fields };
  return { value: { reason, message, messageHi: messageHi || '', until, alsoBlockDevices: b.alsoBlockDevices === true } };
}

/** `{ blocked, until, reason, message, messageHi }` - the shape written to the audit log's before / after. */
export const auditBlock = (doc, now = new Date()) => {
  const v = blockView(doc, now);
  return { blocked: isBlocked(doc, now), until: v?.until ?? null, reason: v?.reason ?? '', message: v?.message ?? '', messageHi: v?.messageHi ?? '' };
};

const SLUG = /^[a-z0-9][a-z0-9_-]*$/;

/** One tag as typed -> its stored form (lowercase, spaces become '-'), or null when it is not a tag. */
export function cleanTag(raw) {
  if (typeof raw !== 'string') return null;
  const t = raw.trim().toLowerCase().replace(/\s+/g, '-');
  return t && t.length <= TAG_MAX && SLUG.test(t) ? t : null;
}

/** Apply `{ add, remove }` to a tag list. `{ tags }` or `{ fields }` for `400 bad_tags`. */
export function applyTags(current, body) {
  const b = body && typeof body === 'object' ? body : {};
  const fields = {};
  const lists = {};
  for (const k of ['add', 'remove']) {
    const v = b[k] ?? [];
    if (!Array.isArray(v) || v.length > 50) { fields[k] = 'Must be a list of tags.'; continue; }
    const bad = v.filter((x) => cleanTag(x) === null);
    if (bad.length) fields[k] = `Tags are lowercase letters, digits, "-" or "_", at most ${TAG_MAX} characters.`;
    lists[k] = v.map(cleanTag).filter(Boolean);
  }
  if (!b.add?.length && !b.remove?.length && !Object.keys(fields).length) fields.add = 'Nothing to add or remove.';
  if (Object.keys(fields).length) return { fields };
  const set = new Set(current ?? []);
  for (const t of lists.remove) set.delete(t);
  for (const t of lists.add) set.add(t);
  if (set.size > TAGS_LIMIT) return { fields: { add: `At most ${TAGS_LIMIT} tags per person.` } };
  return { tags: [...set] };
}
