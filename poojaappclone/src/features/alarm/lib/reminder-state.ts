import type { ReminderId, ToneId } from '../constants/reminders';
import type { ReminderState } from '../types';

/*
 * The reminder list maths, pure. Each returns the NEXT state and never
 * mutates the one it is given. The list the screen renders is derived from
 * state (`resolveReminders`) — bundled minus `removed`, plus `custom` — and
 * everything scheduled must come from that, never from the REMINDERS
 * constant, or a deleted reminder keeps firing.
 */

export const withToggled = (s: ReminderState, id: ReminderId, on: boolean): ReminderState => ({
  ...s,
  enabled: { ...s.enabled, [id]: on },
});

export const withTime = (s: ReminderState, id: ReminderId, hour: number, minute: number): ReminderState => ({
  ...s,
  times: { ...s.times, [id]: `${hour}:${String(minute).padStart(2, '0')}` },
});

export const withTone = (s: ReminderState, tone: ToneId): ReminderState => ({ ...s, tone });

/** Add the devotee's own reminder. It starts ON: adding one is the intent. */
export const withAdded = (
  s: ReminderState,
  id: ReminderId,
  title: string,
  hour: number,
  minute: number,
): ReminderState => ({
  ...s,
  custom: [...(s.custom ?? []), { id, title, hour, minute }],
  enabled: { ...s.enabled, [id]: true },
});

/**
 * Delete a reminder.
 *
 * A devotee's own is dropped outright; a bundled one is tombstoned, since it
 * lives in the app's code and would otherwise return on next launch. Either
 * way its enabled flag and time override go with it, so re-adding or
 * restoring starts clean rather than inheriting a stale time.
 */
export function withRemoved(s: ReminderState, id: ReminderId): ReminderState {
  const enabled = { ...s.enabled };
  const times = { ...s.times };
  delete enabled[id];
  delete times[id];

  const isCustom = (s.custom ?? []).some((r) => r.id === id);
  return {
    ...s,
    enabled,
    times,
    custom: isCustom ? s.custom.filter((r) => r.id !== id) : s.custom,
    removed: isCustom ? s.removed : [...new Set([...s.removed, id])],
  };
}

/** Bring back the bundled cycle, so deleting them is not a one-way door. */
export const withDefaultsRestored = (s: ReminderState): ReminderState => ({ ...s, removed: [] });
