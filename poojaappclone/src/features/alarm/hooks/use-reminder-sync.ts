import { useCallback } from 'react';

import type { RemoteReminder, RemoteTone } from '@/providers/content';

import { scheduleFallbackNotifications } from '../lib/fallback-notifications';
import * as Alarm from '../lib/native-alarm';
import { loadNotifications } from '../lib/notifications';
import { armAlarms } from '../lib/schedule';
import type { ReminderState } from '../types';

/**
 * Rebuild every scheduled reminder from state.
 *
 * Two completely different mechanisms, and the choice matters:
 *
 *  - **Android with the alarm module** — real alarms via
 *    `AlarmManager.setAlarmClock`, ringing on the alarm stream through a
 *    foreground service. Exact, audible on a silenced phone, loops until
 *    dismissed.
 *  - **Everything else** — `expo-notifications`, which posts once at
 *    notification volume and is scheduled inexactly. That is a reminder,
 *    not an alarm, and is the fallback precisely because it is weaker.
 *
 * Never both: two systems firing for one reminder means it goes off twice.
 */
export function useReminderSync(
  cycle: RemoteReminder[],
  tones: RemoteTone[],
  setNextAt: (m: Record<string, number>) => void,
) {
  const syncAlarms = useCallback(
    async (next: ReminderState) => {
      setNextAt(await armAlarms(next, cycle, tones));
    },
    [cycle, tones, setNextAt],
  );

  const sync = useCallback(
    async (next: ReminderState) => {
      if (Alarm.isAvailable()) {
        await syncAlarms(next);
        return;
      }
      const N = await loadNotifications();
      // Settings still save without the module; they take effect on a build
      // that has it.
      if (!N) return;
      await scheduleFallbackNotifications(N, next, cycle, tones);
    },
    [syncAlarms, cycle, tones],
  );

  return { syncAlarms, sync };
}
