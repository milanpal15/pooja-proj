import { formatDay, formatWhen } from '../../../lib/dates.js';

/** Presentation helpers for a user row / 360. Values are shown exactly as the API returned them (masked included). */
export const displayName = (u) => u?.name || u?.contact || 'Unnamed user';
export const initialOf = (u) => {
  const s = String(u?.name || u?.contact || '?').replace(/[^\p{L}\p{N}]/gu, '');
  return (s[0] ?? '?').toUpperCase();
};

/** Blocked right now? The list row carries `blocked` (already derived with `until`), the 360 carries `block`. */
export const isBlocked = (u) => !!(u?.blocked ?? u?.block?.active);

/** @returns {{ tone: 'success'|'danger', label: string }} */
export function statusOf(u) {
  if (!isBlocked(u)) return { tone: 'success', label: 'Active' };
  const until = u.blockUntil ?? u.block?.until;
  return { tone: 'danger', label: until ? `Blocked until ${formatDay(until)}` : 'Blocked' };
}

export const versionLabel = (u) => (u?.versionName ? `${u.versionName}${u.versionCode ? ` (${u.versionCode})` : ''}` : u?.versionCode ? `Build ${u.versionCode}` : '—');
export const whenLabel = formatWhen;
export const methodLabel = (m) => ({ phone: 'Phone', google: 'Google', email: 'Email' })[m] ?? m ?? '—';
export const roleLabel = (r) => (r === 'astrologer' ? 'Astrologer' : r ? 'Devotee' : '—');

/** The list-row fields a block / tag change affects, from a full user object the API returned. */
export function rowPatch(user) {
  if (!user) return {};
  const blocked = user.block ? !!user.block.active : !!user.blocked;
  return {
    blocked,
    blockUntil: blocked ? user.block?.until ?? user.blockUntil ?? null : null,
    ...(Array.isArray(user.tags) ? { tags: user.tags } : {}),
  };
}

const first = (o, keys) => {
  for (const k of keys) if (o?.[k] !== undefined && o?.[k] !== null && o[k] !== '') return o[k];
  return undefined;
};

/* The recent-row shapes of the other services are only described as "[…]" in docs/USERS.md §2, so each reader
   accepts the likely names and falls back to a dash. */
export const txnRow = (t, i) => ({ key: t.id ?? t._id ?? `t${i}`, when: first(t, ['at', 'createdAt', 'date']), title: first(t, ['reason', 'note', 'description', 'type']) ?? '—', kind: first(t, ['type', 'kind']), amount: first(t, ['amount', 'coins', 'delta']), after: first(t, ['balanceAfter', 'balance']) });
export const bookingRow = (b, i) => ({ key: b.id ?? b._id ?? `b${i}`, when: first(b, ['createdAt', 'at', 'date']), title: first(b, ['poojaName', 'title', 'name', 'pooja']) ?? '—', detail: first(b, ['templeName', 'temple']), status: first(b, ['status']), amount: first(b, ['coins', 'total', 'amount']) });
export const callRow = (c, i) => ({ key: c.id ?? c._id ?? `c${i}`, when: first(c, ['startedAt', 'createdAt', 'at']), title: first(c, ['astrologerName', 'astrologer', 'name']) ?? '—', detail: first(c, ['durationSec', 'duration']), status: first(c, ['outcome', 'status']), amount: first(c, ['coins', 'charged', 'amount']) });
export const registrationRow = (r, i) => ({ key: r.id ?? r._id ?? `r${i}`, when: first(r, ['joinedAt', 'createdAt', 'at']), title: first(r, ['eventTitle', 'title', 'eventName', 'event']) ?? '—', detail: first(r, ['progress', 'tasksDone']), status: first(r, ['status']) });
export const badgeRow = (b, i) => ({ key: b.id ?? b._id ?? `g${i}`, when: first(b, ['earnedAt', 'at', 'createdAt']), title: first(b, ['name', 'title', 'badge']) ?? '—' });

const VERB = { POST: 'Changed', PUT: 'Changed', PATCH: 'Changed', DELETE: 'Deleted' };
/**
 * Block history + operator actions about this user, newest first.
 * @returns {{ key, at, kind: 'block'|'unblock'|'auto_unblock'|'audit', title, detail, by }[]}
 */
export function activityItems(detail) {
  const items = [];
  (detail?.user?.blockHistory ?? []).forEach((h, i) =>
    items.push({
      key: `h${i}-${h.at}`,
      at: h.at,
      kind: h.action,
      title: { block: 'Blocked', unblock: 'Unblocked', auto_unblock: 'Block ended on its own' }[h.action] ?? h.action,
      detail: [h.message && `Message: “${h.message}”`, h.reason && `Reason: ${h.reason}`, h.until && `Until ${new Date(h.until).toLocaleString('en-GB')}`].filter(Boolean).join(' · '),
      by: h.by,
    }),
  );
  (detail?.audit ?? []).forEach((e, i) =>
    items.push({
      key: `a${e.id ?? i}`,
      at: e.at,
      kind: 'audit',
      title: e.summary ?? e.action ?? `${VERB[e.method] ?? e.method ?? 'Did'} ${String(e.path ?? '').replace(/^\/api\//, '')}`.trim(),
      detail: '',
      by: e.operator ?? e.by,
    }),
  );
  return items.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
}
