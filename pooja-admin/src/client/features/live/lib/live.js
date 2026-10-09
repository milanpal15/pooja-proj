/**
 * Pure rules for Live darshan (docs/LIVE_DARSHAN.md): the status chip, time and
 * day labels, the draft <-> API-body mapping and validation. No React, no
 * fetching, so `node --test` can pin them.
 */

export const MAX_AARTIS = 12;
export const SOURCE_TYPES = [
  { value: 'youtube', label: 'YouTube Live' },
  { value: 'hls', label: 'HLS link' },
];
export const DAY_PRESETS = [
  { value: 'daily', label: 'Every day', days: 'daily' },
  { value: 'weekdays', label: 'Mon to Fri', days: [1, 2, 3, 4, 5] },
  { value: 'weekends', label: 'Sat and Sun', days: [0, 6] },
];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const same = (a, b) => a.length === b.length && a.every((d, i) => d === b[i]);

/** "HH:MM" (24h) -> "4:00 am". Anything else comes back unchanged. */
export function clock(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  if (!m) return hhmm || '';
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'am' : 'pm'}`;
}

/** An aarti's `days` -> the key of the select option that represents it. */
export function daysKey(days) {
  if (days == null || days === 'daily') return 'daily';
  const list = [...days].sort((a, b) => a - b);
  const hit = DAY_PRESETS.find((p) => Array.isArray(p.days) && same(p.days, list));
  return hit ? hit.value : `custom:${list.join(',')}`;
}
export function daysFromKey(key) {
  const hit = DAY_PRESETS.find((p) => p.value === key);
  if (hit) return hit.days;
  return key.replace('custom:', '').split(',').filter(Boolean).map(Number);
}
export function daysLabel(days) {
  const k = daysKey(days);
  const hit = DAY_PRESETS.find((p) => p.value === k);
  return hit ? hit.label : daysFromKey(k).map((d) => DAY_NAMES[d]).join(', ');
}

/** Minutes of IST now, from a Date. */
function istMinutes(now) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return { min: Number(get('hour')) * 60 + Number(get('minute')), day: DAY_NAMES.indexOf(get('weekday')) };
}
const runsOn = (a, day) => a.days == null || a.days === 'daily' || (Array.isArray(a.days) && a.days.includes(day));

/** Today's aartis still to come (IST), by time. Used only when the API sent no `nextAarti`. */
export function nextAartiOf(stream, now = new Date()) {
  if (stream.nextAarti !== undefined) return stream.nextAarti;
  const { min, day } = istMinutes(now);
  const later = (stream.aartis || [])
    .filter((a) => /^\d{1,2}:\d{2}$/.test(a.time || '') && runsOn(a, day))
    .map((a) => ({ ...a, at: Number(a.time.split(':')[0]) * 60 + Number(a.time.split(':')[1]) }))
    .filter((a) => a.at >= min)
    .sort((a, b) => a.at - b.at);
  return later[0] || null;
}

/** "Bhog · 11:15 am", or "" when there is none. */
export const nextLabel = (a) => (a ? `${a.name} · ${clock(a.time)}` : '');

/**
 * The Status column's chip. `state` is the API's derived value; `hidden` is
 * the operator's own switch (the editor shows it before save). `note` is the
 * honest caveat: a Live that was never verified says so.
 */
export function streamStatus(s) {
  const state = s.enabled === false ? 'hidden' : s.state;
  if (state === 'hidden') return { key: 'hidden', tone: 'neutral', label: 'Hidden', note: '' };
  if (state === 'live') return { key: 'live', tone: 'live', label: 'Live', note: s.verified === false ? 'not verified' : '' };
  if (state === 'upcoming') {
    const n = nextAartiOf(s);
    return { key: 'upcoming', tone: 'info', label: n ? `Starts ${clock(n.time)}` : 'Upcoming', note: '' };
  }
  if (state === 'offline') return { key: 'offline', tone: 'warning', label: 'Source offline', note: '' };
  return { key: 'unknown', tone: 'neutral', label: 'Not checked yet', note: '' };
}

export const sourceLabel = (s) => (!s.url ? '[Not set]' : SOURCE_TYPES.find((t) => t.value === s.sourceType)?.label || s.sourceType);

/** "checked 3 min ago" from an ISO time; '' when never checked. */
export function checkedAgo(iso, now = Date.now()) {
  const t = iso ? new Date(iso).getTime() : NaN;
  if (Number.isNaN(t)) return '';
  const m = Math.max(0, Math.round((now - t) / 60000));
  if (m < 1) return 'checked just now';
  if (m < 60) return `checked ${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `checked ${h} h ago` : `checked ${Math.round(h / 24)} d ago`;
}

/** What "Test link" returned, as a sentence and a tone. */
export function checkOutcome(r) {
  if (!r) return null;
  if (r.broadcasting === true) return { tone: 'ok', text: r.message || 'Broadcasting now' };
  if (r.broadcasting === false) return { tone: 'bad', text: r.message || 'Reachable, but not broadcasting' };
  return { tone: r.ok ? 'warn' : 'bad', text: r.message || (r.ok ? 'Link accepted. Live status cannot be verified.' : 'Link could not be checked') };
}

/** Does the link at least look like what its source type expects? (The API has the final say.) */
export function linkProblem(type, url) {
  const u = String(url || '').trim();
  if (!u) return 'Add the stream link';
  if (!/^https:\/\//i.test(u)) return 'The link must start with https://';
  if (type === 'hls' && !/\.(m3u8|mp4)(\?|#|$)/i.test(u)) return 'An HLS link must end in .m3u8 or .mp4';
  return '';
}

export const blankAarti = () => ({ name: '', nameHi: '', time: '', days: 'daily' });
export const blankStream = () => ({
  templeSlug: '', categorySlug: '', jaiText: '', jaiTextHi: '', sourceType: 'youtube', url: '', cover: '',
  aartis: [], chadhavaListingSlug: '', poojaSlug: '', enabled: true,
});

const str = (v) => (typeof v === 'string' ? v : '');
export function draftFrom(s = {}) {
  const b = blankStream();
  return {
    templeSlug: str(s.templeSlug), categorySlug: str(s.categorySlug), jaiText: str(s.jaiText), jaiTextHi: str(s.jaiTextHi),
    sourceType: s.sourceType || b.sourceType, url: str(s.url), cover: str(s.cover),
    aartis: (s.aartis || []).map((a) => ({ name: str(a.name), nameHi: str(a.nameHi), time: str(a.time), days: a.days ?? 'daily' })),
    chadhavaListingSlug: str(s.chadhavaListingSlug), poojaSlug: str(s.poojaSlug), enabled: s.enabled !== false,
  };
}
export function toBody(d) {
  const t = (v) => String(v || '').trim();
  return {
    templeSlug: d.templeSlug, categorySlug: d.categorySlug, jaiText: t(d.jaiText), jaiTextHi: t(d.jaiTextHi),
    sourceType: d.sourceType, url: t(d.url), cover: d.cover,
    aartis: d.aartis.map((a) => ({ name: t(a.name), nameHi: t(a.nameHi), time: a.time, days: a.days })),
    chadhavaListingSlug: d.chadhavaListingSlug, poojaSlug: d.poojaSlug, enabled: d.enabled,
  };
}

/** Field -> message. Empty means savable. */
export function validateStream(d, { taken = [] } = {}) {
  const e = {};
  if (!d.templeSlug) e.templeSlug = 'Choose a temple';
  else if (taken.includes(d.templeSlug)) e.templeSlug = 'This temple already has a stream';
  const lp = linkProblem(d.sourceType, d.url);
  if (lp) e.url = lp;
  if (d.jaiText.length > 40) e.jaiText = 'Up to 40 characters';
  if (d.jaiTextHi.length > 40) e.jaiTextHi = 'Up to 40 characters';
  if (d.aartis.length > MAX_AARTIS) e.aartis = `Up to ${MAX_AARTIS} aartis`;
  else if (d.aartis.some((a) => !a.name.trim() || a.name.trim().length > 60)) e.aartis = 'Each aarti needs a name of up to 60 characters';
  else if (d.aartis.some((a) => !/^\d{2}:\d{2}$/.test(a.time))) e.aartis = 'Each aarti needs a time';
  return e;
}

/** Every aarti of every stream, by time — the Aarti schedule tab. */
export function scheduleRows(streams, nameOf) {
  return streams
    .flatMap((s) => (s.aartis || []).map((a) => ({ stream: s, temple: nameOf(s.templeSlug), ...a })))
    .sort((a, b) => String(a.time).localeCompare(String(b.time)) || a.temple.localeCompare(b.temple));
}

export const slugify = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
