import { formatDay } from '../../../lib/dates.js';

const at = (iso) => (iso ? new Date(iso).getTime() : null);

/** Is `now` inside the section's window (either end may be open)? */
export function inWindow(section, now = Date.now()) {
  const from = at(section.startsAt);
  const to = at(section.endsAt);
  return (from === null || from <= now) && (to === null || now <= to);
}

/** On and inside its window: the phone would show it right now. */
export const isLiveNow = (section, now) => !!section.enabled && inWindow(section, now);

/** True when the section carries a window at all. */
export const isScheduled = (section) => !!(section.startsAt || section.endsAt);

/** "27 Sep → 10 Oct", "From 27 Sep", "Until 10 Oct" (null for none). */
export function scheduleLabel(section) {
  const { startsAt, endsAt } = section;
  if (startsAt && endsAt) return `${formatDay(startsAt)} → ${formatDay(endsAt)}`;
  if (startsAt) return `From ${formatDay(startsAt)}`;
  if (endsAt) return `Until ${formatDay(endsAt)}`;
  return null;
}
