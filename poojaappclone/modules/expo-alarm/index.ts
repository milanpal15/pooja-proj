import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

/**
 * A real alarm, not a notification.
 *
 * `expo-notifications` posts a notification: it plays once, at notification
 * volume, is silent on a muted phone, and is scheduled inexactly — the daily
 * trigger it produced carried a ONE HOUR window and could be deferred further
 * by Doze. None of that is acceptable for a 4:30am Mangala Aarti.
 *
 * This module schedules with `AlarmManager.setAlarmClock` (exact, Doze-proof)
 * and rings through a foreground service on the alarm stream, with a
 * full-screen ringing screen over the lock screen and Dismiss / Snooze.
 *
 * Android only. iOS has no API that lets a third-party app ring through
 * silent mode, so the app keeps using notifications there.
 */

export type AlarmSpec = {
  id: string;
  title: string;
  body: string;
  /** 24-hour. */
  hour: number;
  minute: number;
  /**
   * A bundled raw resource name (`bell`, `aarti`), `null` for the device's
   * own alarm sound, or `''` for silence.
   */
  sound: string | null;
  vibrate?: boolean;
};

export type ScheduledAlarm = {
  id: string;
  title?: string;
  hour?: number;
  minute?: number;
  /** Epoch millis of the next firing. */
  at: number;
};

type NativeModule = {
  canUseFullScreen: boolean;
  canScheduleExact: boolean;
  openExactAlarmSettings: () => Promise<void>;
  openFullScreenSettings: () => Promise<void>;
  setAlarms: (alarms: AlarmSpec[]) => Promise<{ id: string; at: number }[]>;
  cancelAll: () => Promise<void>;
  scheduled: () => Promise<ScheduledAlarm[]>;
  preview: (id: string) => Promise<void>;
  stop: () => Promise<void>;
};

/*
 * Optional, for the same reason expo-wallpaper is: expo-router loads routes
 * eagerly, so a module that throws while being imported takes the whole app
 * down rather than just the screen that needs it.
 */
let native: NativeModule | null = null;
try {
  if (Platform.OS === 'android') {
    native = requireOptionalNativeModule<NativeModule>('ExpoAlarm');
  }
} catch {
  native = null;
}

/** True when this build can ring a real alarm. */
export function isAvailable(): boolean {
  return native !== null;
}

/**
 * Whether the ringing screen may take over the device.
 *
 * Android 14 restricted full-screen intents to calling and alarm apps. Where
 * it is refused the alarm still rings and still shows — as a heads-up
 * notification rather than a takeover — so this gates an explanation, not
 * the feature.
 */
export function canUseFullScreen(): boolean {
  return !!native?.canUseFullScreen;
}

export async function openFullScreenSettings(): Promise<void> {
  await native?.openFullScreenSettings();
}

/**
 * Whether alarms will ring to the minute.
 *
 * False means they still ring — the scheduler falls back to an inexact but
 * Doze-exempt alarm — just possibly a few minutes late.
 */
export function canScheduleExact(): boolean {
  return !!native?.canScheduleExact;
}

export async function openExactAlarmSettings(): Promise<void> {
  await native?.openExactAlarmSettings();
}

/** Replace every registered alarm. Returns each one's next firing time. */
export async function setAlarms(alarms: AlarmSpec[]): Promise<Map<string, number>> {
  if (!native) return new Map();
  const out = await native.setAlarms(alarms);
  return new Map(out.map((a) => [a.id, a.at]));
}

export async function cancelAll(): Promise<void> {
  await native?.cancelAll();
}

export async function scheduled(): Promise<ScheduledAlarm[]> {
  return (await native?.scheduled()) ?? [];
}

/** Ring one now, without touching its schedule — the Preview button. */
export async function preview(id: string): Promise<void> {
  await native?.preview(id);
}

export async function stop(): Promise<void> {
  await native?.stop();
}
