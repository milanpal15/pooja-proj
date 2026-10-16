/**
 * Who sees what, as the dashboard can tell it (docs/HOME_LAYOUT.md §9.1, §9.2).
 * The app decides this ON THE DEVICE; "Preview as" lets an operator pretend to
 * be a persona (a language plus any of the four audience segments) and see the
 * result. Pure: `now` is always passed in.
 *
 * Rules mirrored from the contract:
 *  - an empty `audience` matches everyone; otherwise ANY listed segment is enough;
 *  - an UNKNOWN segment (one this dashboard / the persona cannot know) does not match;
 *  - a layout is served when it is enabled, inside its schedule and its audience matches; `default` is the fallback;
 *  - an item's badge shows only until `badgeUntil`.
 */
import { DEFAULT_ID, isDefault } from './layout.js';

/** The personas offered by "Preview as" (the board's presets). Custom ones are built from the same shape. */
export const PRESETS = [
  { id: 'everyone-en', label: 'Everyone · English', lang: 'en', segments: [] },
  { id: 'hi-booking', label: 'Hindi · has bookings', lang: 'hi', segments: ['has_booking'] },
  { id: 'en-new', label: 'English · new user', lang: 'en', segments: ['new_user'] },
];

/** Short names for audience badges in the section list (the registry's labels are the long, chip ones). */
const SHORT = { new_user: 'New users', has_booking: 'Has booking', in_event: 'In an event', lapsed: 'Lapsed' };

export const shortAudience = (key, reg) => SHORT[key] || reg?.audiences?.find((a) => a.key === key)?.label || key;

export const audienceLabel = (key, reg) => reg?.audiences?.find((a) => a.key === key)?.label || SHORT[key] || key;

const LANG_NAME = { en: 'English', hi: 'Hindi' };

/** "Hindi · has bookings" style label for a custom persona. */
export function personaLabel(p, reg) {
  const segs = (p?.segments || []).map((s) => audienceLabel(s, reg).replace(/ \(.*\)$/, '').toLowerCase());
  return [LANG_NAME[p?.lang] || 'English', segs.length ? segs.join(' + ') : 'everyone'].join(' · ');
}

export const samePersona = (a, b) => a?.lang === b?.lang && [...(a?.segments || [])].sort().join() === [...(b?.segments || [])].sort().join();

/** The preset a persona equals, or null (a custom persona). */
export const presetOf = (p) => PRESETS.find((x) => samePersona(x, p)) || null;

/** Does a block / layout audience match the persona? Empty = everyone; unknown segments never match. */
export function matchesAudience(audience, persona, known) {
  const list = Array.isArray(audience) ? audience : [];
  if (!list.length) return true;
  const mine = new Set(persona?.segments || []);
  return list.some((s) => (!known || known.includes(s)) && mine.has(s));
}

const ms = (iso) => (iso ? new Date(iso).getTime() : NaN);

/** '' (inside) | 'scheduled' (starts later) | 'ended' — for a block or a layout. */
export function scheduleState(x, now) {
  const s = ms(x?.startsAt);
  const e = ms(x?.endsAt);
  if (!Number.isNaN(s) && s > now) return 'scheduled';
  if (!Number.isNaN(e) && e <= now) return 'ended';
  return '';
}

/** A layout that is switched on and inside its schedule: "live now" (audience aside). The default always is. */
export const layoutLive = (l, now) => !!l && l.enabled !== false && !scheduleState(l, now);

/**
 * The layout a persona is served at `now`: the first, in priority order, that is live and whose audience matches;
 * else the default. `known` = the registry's audience keys.
 */
export function servedLayout(doc, persona, now, known) {
  const ls = doc?.layouts || [];
  const hit = ls.filter((l) => !isDefault(l)).find((l) => layoutLive(l, now) && matchesAudience(l.audience, persona, known));
  return hit || ls.find((l) => l.id === DEFAULT_ID) || ls[0] || null;
}

/** Why a block would not show to this persona: 'disabled' | 'scheduled' | 'ended' | 'language' | 'audience' | '' (shown). */
export function visibility(block, { now = Date.now(), lang = 'all', persona = null, known } = {}) {
  if (block.enabled === false) return 'disabled';
  const sched = scheduleState(block, now);
  if (sched) return sched;
  if (block.language && block.language !== 'all' && lang !== 'all' && block.language !== lang) return 'language';
  if (persona && !matchesAudience(block.audience, persona, known)) return 'audience';
  return '';
}

const VISIBILITY_LABEL = { disabled: 'Off', scheduled: 'Scheduled', ended: 'Ended', language: 'Other language', audience: 'Not for this audience' };
export const visibilityLabel = (v) => VISIBILITY_LABEL[v] || '';

/* ---------------------------------------------------------------- dates -- */
const IST = 330 * 60000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const parts = (iso) => {
  const d = new Date(new Date(iso).getTime() + IST);
  return { d: d.getUTCDate(), m: d.getUTCMonth(), y: d.getUTCFullYear() };
};
/** "31 Oct" (India time). */
export function shortDate(iso) {
  if (!iso || Number.isNaN(ms(iso))) return '';
  const p = parts(iso);
  return `${p.d} ${MONTHS[p.m]}`;
}

/** "11–19 Oct", "29 Oct–3 Nov", "from 29 Oct", "until 3 Nov", or '' with no schedule. */
export function windowLabel(x) {
  const a = x?.startsAt;
  const b = x?.endsAt;
  if (a && b) {
    const pa = parts(a);
    const pb = parts(b);
    return pa.m === pb.m && pa.y === pb.y ? `${pa.d}–${pb.d} ${MONTHS[pb.m]}` : `${shortDate(a)}–${shortDate(b)}`;
  }
  if (a) return `from ${shortDate(a)}`;
  if (b) return `until ${shortDate(b)}`;
  return '';
}

/** The tab suffix: "live 11–19 Oct" while inside the window, else the plain window. */
export function scheduleLabel(l, now) {
  const w = windowLabel(l);
  if (!w) return '';
  return layoutLive(l, now) && l.startsAt && l.endsAt ? `live ${w}` : w;
}

/* ---------------------------------------------------------------- badges -- */
/** Is the item's badge still showing at `now`? (A badge with no `badgeUntil` shows for ever.) */
export function badgeActive(item, now) {
  if (!item?.badge) return false;
  const e = ms(item.badgeUntil);
  return Number.isNaN(e) || e > now;
}

/** The pill an item row shows for its badge: { text, expired } or null. "NEW · until 31 Oct". */
export function badgePill(item, now) {
  if (!item?.badge) return null;
  const word = String(item.badge).toUpperCase();
  if (!item.badgeUntil) return { text: word, expired: false };
  const expired = !badgeActive(item, now);
  return { text: `${word} · ${expired ? 'ended' : 'until'} ${shortDate(item.badgeUntil)}`, expired };
}
