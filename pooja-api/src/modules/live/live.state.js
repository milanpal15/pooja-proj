/**
 * Pure state derivation for a live stream (docs/LIVE_DARSHAN.md "Derived state").
 * Everything runs on IST wall-clock time, whatever timezone the server is in.
 */
export const AARTI_WINDOW_MIN = 90;

/** `{ date: 'YYYY-MM-DD', minutes: since midnight, weekday: 0..6 }` in IST. */
export function istParts(now = new Date()) {
  const d = new Date(now.getTime() + 5.5 * 3_600_000);
  return { date: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes(), weekday: d.getUTCDay() };
}

export const toMinutes = (hhmm) => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(hhmm ?? ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

const runsOn = (a, weekday) => a.days === undefined || a.days === null || a.days === 'daily' || (Array.isArray(a.days) && a.days.includes(weekday));

/** Today's aartis with their index in the stream's list and start minute, sorted by start. */
export function aartisToday(stream, now = new Date()) {
  const p = istParts(now);
  return (stream.aartis ?? [])
    .map((a, index) => ({ ...a, index, start: toMinutes(a.time) }))
    .filter((a) => a.start !== null && runsOn(a, p.weekday))
    .sort((a, b) => a.start - b.start || a.index - b.index);
}

/** The aarti whose window (start to +90 min) contains now; the latest-started wins an overlap. */
export function currentAarti(stream, now = new Date()) {
  const { minutes } = istParts(now);
  const hit = aartisToday(stream, now).filter((a) => a.start <= minutes && minutes < a.start + AARTI_WINDOW_MIN);
  return hit.length ? hit[hit.length - 1] : null;
}

/** The first aarti starting after now, today. */
export function nextAarti(stream, now = new Date()) {
  const { minutes } = istParts(now);
  return aartisToday(stream, now).find((a) => a.start > minutes) ?? null;
}

/** `live` | `upcoming` | `offline` | `hidden`. */
export function streamState(stream, now = new Date()) {
  if (!stream.enabled) return 'hidden';
  const b = stream.broadcasting ?? null;
  if (b === true || b === null) return 'live';
  return nextAarti(stream, now) ? 'upcoming' : 'offline';
}

export const isVerified = (stream) => (stream.broadcasting ?? null) !== null;

/** Counts are keyed per aarti occurrence, so each window starts at zero. */
export const windowKey = (stream, aarti, now = new Date()) => `${istParts(now).date}#${aarti.index}`;
