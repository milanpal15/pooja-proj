/** Derived event status (docs/EVENTS.md section 1). Never stored. */

const IST_OFFSET_MS = 5.5 * 3600_000;
const DAY_MS = 24 * 3600_000;

const ms = (d) => (d ? new Date(d).getTime() : null);

/** The instant (ms) the IST calendar day containing `t` (ms) ends. */
export const istDayEnd = (t) => Math.floor((t + IST_OFFSET_MS) / DAY_MS) * DAY_MS + DAY_MS - IST_OFFSET_MS;

/** When the event is over. A `single` event with no explicit end ends at the close of its IST day. */
export function effectiveEnd(schedule) {
  if (!schedule) return null;
  const end = ms(schedule.endsAt);
  if (end !== null) return end;
  if (schedule.mode === 'single' && ms(schedule.startsAt) !== null) {
    return istDayEnd(ms(schedule.startsAt));
  }
  return null;
}

/** Is the registration window open right now (ignores capacity)? */
export function registrationWindowOpen(registration, now) {
  if (!registration || registration.mode === 'none') return false;
  const opens = ms(registration.opensAt);
  const closes = ms(registration.closesAt);
  return (opens === null || now >= opens) && (closes === null || now < closes);
}

/** `registered` is the real count, or null when it is not known: capacity can then never be called "full". */
export function isFull(registration, registered) {
  return !!registration && Number.isInteger(registration.capacity) && Number.isInteger(registered) && registered >= registration.capacity;
}

/**
 * draft - not published
 * ended - past its end (an `always` event only ends if it was given an explicit endsAt)
 * live  - `always` while published, otherwise started and not ended
 * registration_open - before the start, registration block, window open, not full (once started it is `live`; joining stays possible while the window is open)
 * scheduled - published, before the start
 */
export function deriveStatus(event, nowDate = new Date(), { registered = null } = {}) {
  const now = new Date(nowDate).getTime();
  if (!event?.published) return 'draft';
  const s = event.schedule;
  if (!s) return 'live';
  const end = effectiveEnd(s);
  if (s.mode === 'always') return end !== null && now >= end ? 'ended' : 'live';
  if (end !== null && now >= end) return 'ended';
  const start = ms(s.startsAt);
  if (start !== null && now < start) {
    const reg = event.registration;
    return registrationWindowOpen(reg, now) && !isFull(reg, registered) ? 'registration_open' : 'scheduled';
  }
  return 'live';
}
