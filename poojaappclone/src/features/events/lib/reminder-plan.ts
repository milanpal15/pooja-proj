/**
 * Planning the "next milestone opens" reminder — pure (reminder-plan.test.mjs). The notification
 * itself is scheduled in `event-reminders.ts`; this decides WHETHER and WHEN, and keeps the
 * bookkeeping map, so the sheet only ever claims a reminder that really exists.
 */
import { toMs } from './events-logic';

/** A reminder less than this far ahead is not worth scheduling (it would fire as the sheet closes). */
export const MIN_AHEAD_MS = 60_000;

/** When to fire: the instant the milestone opens. Null when it has no time or is already (nearly) open. */
export function planReminder(opensAt: string | null | undefined, now: number): number | null {
  const at = toMs(opensAt);
  return at !== null && at - now >= MIN_AHEAD_MS ? at : null;
}

export type ScheduledReminder = { id: string; at: number };
export type ReminderMap = Record<string, ScheduledReminder>;

export function parseReminders(raw: string | null): ReminderMap {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const out: ReminderMap = {};
    for (const [k, r] of Object.entries(v as Record<string, ScheduledReminder>)) {
      if (r && typeof r.id === 'string' && typeof r.at === 'number') out[k] = { id: r.id, at: r.at };
    }
    return out;
  } catch {
    return {};
  }
}

export const withReminder = (m: ReminderMap, slug: string, r: ScheduledReminder): ReminderMap => ({ ...m, [slug]: r });

export function withoutReminder(m: ReminderMap, slug: string): ReminderMap {
  const { [slug]: _gone, ...rest } = m;
  return rest;
}

/** Drops entries whose time has passed (they have fired). */
export function pruneReminders(m: ReminderMap, now: number): ReminderMap {
  return Object.fromEntries(Object.entries(m).filter(([, r]) => r.at > now));
}

/** True when this event already has a reminder for exactly this moment (no need to reschedule). */
export const alreadyScheduled = (m: ReminderMap, slug: string, at: number) => m[slug]?.at === at;
