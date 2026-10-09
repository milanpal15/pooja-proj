import { useCallback, useMemo } from 'react';
import { Platform } from 'react-native';

import { useContent } from '@/providers/content';

import type { ReminderId, ToneId } from '../constants/reminders';
import * as Alarm from '../lib/native-alarm';
import { ensureToneChannels, loadNotifications } from '../lib/notifications';
import {
  withAdded,
  withDefaultsRestored,
  withRemoved,
  withTime,
  withToggled,
  withTone,
} from '../lib/reminder-state';
import { resolveReminders } from '../lib/schedule';
import type { ReminderState } from '../types';
import { useReminderPermission } from './use-reminder-permission';
import { useReminderStore } from './use-reminder-store';
import { useReminderSync } from './use-reminder-sync';

export function useReminders() {
  /*
   * The temple's suggested cycle and its alert tones come from the
   * dashboard. They used to be literals in `constants/reminders.ts`, so a
   * temple whose Mangala Aarti is at 4:00 rather than 4:30 could not say so
   * without shipping a new build.
   */
  const { reminders: cycle, tones } = useContent();

  const { state, loaded, nextAt, setNextAt, persist } = useReminderStore(cycle, tones);
  const { permission, supported, ensurePermission } = useReminderPermission();
  const { syncAlarms, sync } = useReminderSync(cycle, tones, setNextAt);

  /** Save the next state, then make the OS agree with it. */
  const commit = useCallback(
    async (next: ReminderState) => {
      persist(next);
      await sync(next);
    },
    [persist, sync],
  );

  const toggle = useCallback(
    async (id: ReminderId) => {
      const turningOn = !state.enabled[id];
      // Permission is only worth asking for where notifications exist. Where
      // they do not, the toggle still records the choice.
      if (turningOn && supported === 'yes' && !(await ensurePermission())) return false;
      await commit(withToggled(state, id, turningOn));
      return true;
    },
    [state, supported, ensurePermission, commit],
  );

  const setTime = useCallback(
    (id: ReminderId, hour: number, minute: number) => commit(withTime(state, id, hour, minute)),
    [state, commit],
  );

  /**
   * Add a reminder of the devotee's own. It starts ON; permission is asked
   * for here for the same reason it is asked on toggle.
   */
  const addReminder = useCallback(
    async (title: string, hour: number, minute: number) => {
      const clean = title.trim();
      if (!clean) return false;
      if (supported === 'yes' && !(await ensurePermission())) return false;
      const id = `custom-${Date.now().toString(36)}`;
      await commit(withAdded(state, id, clean, hour, minute));
      return true;
    },
    [state, supported, ensurePermission, commit],
  );

  const removeReminder = useCallback(
    (id: ReminderId) => commit(withRemoved(state, id)),
    [state, commit],
  );

  const restoreDefaults = useCallback(() => commit(withDefaultsRestored(state)), [state, commit]);

  // Re-scheduling is what actually changes the sound: a notification's tone
  // is baked in when it is scheduled, not read at fire time.
  const setTone = useCallback((tone: ToneId) => commit(withTone(state, tone)), [state, commit]);

  /** The list the screen renders: bundled minus deleted, plus the devotee's. */
  const reminders = useMemo(() => resolveReminders(state, cycle), [state, cycle]);

  const activeCount = useMemo(
    () => reminders.filter((r) => state.enabled[r.id]).length,
    [reminders, state.enabled],
  );

  /** Ring one now, so the devotee can hear it before 4:30am does. */
  const previewAlarm = useCallback(
    async (id: ReminderId) => {
      if (!Alarm.isAvailable()) return false;
      if (supported === 'yes' && !(await ensurePermission())) return false;
      // It has to exist natively before it can be previewed, and it only does
      // once it is enabled — so arm the current state first.
      await syncAlarms(withToggled(state, id, true));
      await Alarm.preview(id);
      return true;
    },
    [state, supported, ensurePermission, syncAlarms],
  );

  return {
    state,
    loaded,
    permission,
    supported,
    /** True when reminders ring as real alarms rather than notifications. */
    isRealAlarm: Alarm.isAvailable(),
    /** False when Android 14+ has withheld the full-screen ring screen. */
    canFullScreen: Alarm.canUseFullScreen(),
    openFullScreenSettings: Alarm.openFullScreenSettings,
    /** False when alarms will ring late rather than to the minute. */
    canScheduleExact: Alarm.canScheduleExact(),
    openExactAlarmSettings: Alarm.openExactAlarmSettings,
    nextAt,
    previewAlarm,
    stopAlarm: Alarm.stop,
    reminders,
    activeCount,
    /** Whether any bundled reminder has been deleted — gates "Restore". */
    hasRemovedDefaults: state.removed.length > 0,
    toggle,
    setTime,
    setTone,
    addReminder,
    removeReminder,
    restoreDefaults,
    ensurePermission,
    /** Android needs a channel before anything is shown; harmless elsewhere. */
    prepareChannel: useCallback(async () => {
      if (Platform.OS !== 'android') return;
      const N = await loadNotifications();
      if (!N) return;
      await ensureToneChannels(N, tones);
    }, [tones]),
  };
}
