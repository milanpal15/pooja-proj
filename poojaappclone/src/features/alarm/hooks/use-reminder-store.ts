import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import type { RemoteReminder, RemoteTone } from '@/providers/content';

import { EMPTY, KEY } from '../constants/storage';
import * as Alarm from '../lib/native-alarm';
import { armAlarms } from '../lib/schedule';
import type { ReminderState } from '../types';

/**
 * The persisted reminder state, plus `nextAt`.
 *
 * `nextAt` is when each enabled reminder next goes off, epoch millis. The
 * screen used to say nothing about this, so turning on a 6am reminder at
 * midday looked exactly like a reminder that did not work.
 */
export function useReminderStore(cycle: RemoteReminder[], tones: RemoteTone[]) {
  const [state, setState] = useState<ReminderState>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [nextAt, setNextAt] = useState<Record<string, number>>({});

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then(async (raw) => {
        const initial: ReminderState = raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
        setState(initial);
        /*
         * Re-arm with the OS on every launch.
         *
         * Three things need this. A devotee updating from the version that
         * scheduled notifications has reminders switched on that nothing has
         * yet registered as alarms. Android loses alarms to reboots and to
         * some OEM cleanups. And `nextAt` — "rings in 11h 48m" — can only be
         * known by asking the scheduler, so without it the screen says
         * nothing about when anything will happen until a setting changes.
         */
        if (Alarm.isAvailable()) setNextAt(await armAlarms(initial, cycle, tones));
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
    // `cycle` and `tones` arrive from the network a moment after mount, so
    // the first pass arms nothing and the second arms the real thing. Both
    // are idempotent — setAlarms replaces the whole set every time.
  }, [cycle, tones]);

  const persist = useCallback((next: ReminderState) => {
    setState(next);
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  return { state, loaded, nextAt, setNextAt, persist };
}
