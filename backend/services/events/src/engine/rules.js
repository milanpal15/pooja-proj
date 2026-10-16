/**
 * The completion rules, as pure functions of plain data (docs/EVENTS.md sections 3 and 10). No database, no clock of their own:
 * every function that needs "now" takes it, so each rule is testable on its own.
 */
import { effectiveEnd, istDayEnd } from '../events/status.js';

const ms = (d) => (d ? new Date(d).getTime() : null);

/**
 * Is a `{ rule, n }` completion met by `done` of `total`? `all` needs every one, `any` needs one, `atLeast` needs n (an n that an edit
 * pushed above the total is treated as "all"). An empty set is never complete.
 */
export function ruleMet(completion, done, total) {
  if (!(total > 0)) return false;
  const rule = completion?.rule;
  if (rule === 'any') return done >= 1;
  if (rule === 'atLeast') return done >= Math.min(Number.isInteger(completion.n) && completion.n >= 1 ? completion.n : total, total);
  return done >= total;
}

/**
 * Can milestone `i` take progress right now?
 *
 *   `daily`      opensAt is its day; `missed` then says how long it stays open once its day has begun:
 *                  catch_up_any   until the event ends
 *                  catch_up_next  until the end of the IST day the NEXT milestone opens (the last one: until the event ends)
 *                  lock_at_end    only until the end of its own IST day
 *   `sequential` milestone n opens when n-1 is complete (and at its opensAt if it has one)
 *   `any`        only opensAt
 * A milestone the devotee already completed is never "missed" (nothing un-completes).
 *
 * @param {object} ms          the event's milestones block
 * @param {number} i           index into ms.items
 * @param {Set<string>} done   keys of the milestones this devotee has completed
 * @param {number} now         ms since epoch
 * @param {object} [schedule]  the event's schedule block (for its end)
 * @returns {{ open: boolean, reason: 'locked'|'missed'|null, opensAt: string|null }}
 */
export function milestoneOpenState(ms_, i, done, now, schedule) {
  const items = ms_?.items ?? [];
  const item = items[i];
  const opens = ms(item?.opensAt);
  const opensAt = opens === null ? null : new Date(opens).toISOString();
  if (done.has(item.key)) return { open: true, reason: null, opensAt };
  if (ms_.order === 'sequential' && i > 0 && !done.has(items[i - 1].key)) return { open: false, reason: 'locked', opensAt };
  if (opens !== null && opens > now) return { open: false, reason: 'locked', opensAt };
  if (ms_.order === 'daily' && opens !== null) {
    const end = effectiveEnd(schedule);
    let close = Infinity;
    if (ms_.missed === 'lock_at_end') close = istDayEnd(opens);
    else if (ms_.missed === 'catch_up_next') {
      const next = ms(items[i + 1]?.opensAt);
      close = next !== null ? istDayEnd(next) : (end ?? Infinity);
    } else close = end ?? Infinity;
    if (now >= close) return { open: false, reason: 'missed', opensAt };
  }
  return { open: true, reason: null, opensAt };
}

/** The first milestone, in order, that is not done and can take progress now; null when there is none. */
export function currentMilestoneKey(ms_, done, now, schedule) {
  const items = ms_?.items ?? [];
  for (let i = 0; i < items.length; i += 1) {
    if (done.has(items[i].key)) continue;
    if (milestoneOpenState(ms_, i, done, now, schedule).open) return items[i].key;
  }
  return null;
}

/** Milestones completed that still exist in the event (a removed milestone's old result never inflates progress). */
export const doneKeysOf = (ms_, resultKeys) => {
  const live = new Set((ms_?.items ?? []).map((m) => m.key));
  return new Set([...resultKeys].filter((k) => live.has(k)));
};

/** Is the whole event complete, given the keys of the milestones this devotee completed? */
export const eventComplete = (ms_, doneKeys) => ruleMet(ms_?.completion, doneKeys.size, ms_?.items?.length ?? 0);
