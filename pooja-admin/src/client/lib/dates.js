/**
 * Local-date helpers. Never `toISOString().slice(0, 10)` for a day key: that is
 * UTC and rolls a day early east of Greenwich — India included.
 */
const z = (x) => String(x).padStart(2, '0');

const dayKey = (d) => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
export const todayKey = () => dayKey(new Date());

/** 'YYYY-MM-DD' -> a Date at local midnight. */
export const parseDay = (key) => {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** 'YYYY-MM-DD' moved by whole days (negative = earlier), still a local day key. */
export const shiftDate = (key, days) => {
  const dt = parseDay(key);
  dt.setDate(dt.getDate() + days);
  return dayKey(dt);
};

/** "Tuesday, 7 October 2026". */
export const longDate = (key) =>
  parseDay(key).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

/** Local start of a 'YYYY-MM-DD' day, as an ISO instant ('' when blank). */
export const startOfDayIso = (key) => (key ? parseDay(key).toISOString() : '');

/** Local end of a 'YYYY-MM-DD' day, as an ISO instant ('' when blank). */
export function endOfDayIso(key) {
  if (!key) return '';
  const d = parseDay(key);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

/** An ISO instant -> the local 'YYYY-MM-DD' for a date input ('' if none). */
export const isoToDayKey = (iso) => (iso ? dayKey(new Date(iso)) : '');

const time = (d) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const dayMonth = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** "Today 2:14 PM", "Yesterday 9:05 AM", "3 Oct, 4:20 PM" ("—" for none). */
export function formatWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diff = Math.round((parseDay(todayKey()) - parseDay(dayKey(d))) / 86400000);
  if (diff === 0) return `Today ${time(d)}`;
  if (diff === 1) return `Yesterday ${time(d)}`;
  return `${dayMonth(d)}, ${time(d)}`;
}

/** "12 Oct" or "12 Oct 2027" when it is not this year ("—" for none). */
export function formatDay(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** 281 -> "4m 41s", 0/none -> "—". */
export function formatDuration(sec) {
  const s = Math.round(Number(sec));
  if (!Number.isFinite(s) || s <= 0) return '—';
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

/** "today", "yesterday", "3 days ago" — for "Signed in · <when>". */
export function formatAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = Math.round((parseDay(todayKey()) - parseDay(dayKey(d))) / 86400000);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff < 30) return `${diff} days ago`;
  return formatDay(iso);
}

const pad = (x) => String(x).padStart(2, '0');

/** An ISO instant -> the local 'YYYY-MM-DDTHH:mm' a datetime-local input wants ('' if none). */
export function isoToLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A datetime-local value -> an ISO instant (null when blank or unreadable). */
export function localInputToIso(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** "27 Sep 2026, 6:00 pm" for a scheduled instant ("—" for none). */
export function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, ${time(d)}`;
}
