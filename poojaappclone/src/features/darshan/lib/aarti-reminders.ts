import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import {
  aartiKey,
  parseReminders,
  type ReminderMap,
  reminderClock,
  withoutReminder,
  withReminder,
} from './live-logic';

/**
 * "Remind me" for a live aarti: a daily local notification ten minutes before it starts.
 *
 * Local, so it needs no server and no push. The notification id the OS handed back is kept per
 * (stream, aarti) in AsyncStorage, which is what lets a second tap cancel exactly that one.
 * `expo-notifications` is imported lazily and never in Expo Go on Android (it throws, uncatchably,
 * on import there) — the same rule the alarm feature follows.
 */

const STORAGE_KEY = 'live-darshan.reminders.v1';
const CHANNEL = 'live-darshan';
export const REMINDER_LEAD_MINUTES = 10;

type NotificationsModule = any;

let cached: NotificationsModule | null = null;
let attempted = false;

async function loadNotifications(): Promise<NotificationsModule | null> {
  if (cached || attempted) return cached;
  attempted = true;
  if (Constants.executionEnvironment === 'storeClient' && Platform.OS === 'android') return null;
  try {
    cached = await import('expo-notifications');
  } catch {
    cached = null;
  }
  return cached;
}

export async function loadReminders(): Promise<ReminderMap> {
  try {
    return parseReminders(await AsyncStorage.getItem(STORAGE_KEY));
  } catch {
    return {};
  }
}

async function save(map: ReminderMap) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage failed: the notification still exists; the toggle just will not remember it.
  }
}

export type ReminderResult = 'on' | 'off' | 'denied' | 'unavailable';

export type AartiToRemind = {
  streamSlug: string;
  /** "HH:MM" */
  time: string;
  /** Canonical (English) aarti name — part of the storage key. */
  name: string;
  /** Aarti name in the language the notification is shown in. */
  title: string;
  templeName: string;
  /** Notification body, already localised. */
  body: string;
};

/** Flip the reminder for one aarti. Returns the resulting state. */
export async function toggleReminder(a: AartiToRemind): Promise<ReminderResult> {
  const key = aartiKey(a.streamSlug, a.time, a.name);
  const map = await loadReminders();
  const N = await loadNotifications();
  if (!N) return 'unavailable';

  const existing = map[key];
  if (existing) {
    try {
      await N.cancelScheduledNotificationAsync(existing);
    } catch {
      // Already gone from the OS list; forgetting it is still right.
    }
    await save(withoutReminder(map, key));
    return 'off';
  }

  const at = reminderClock(a.time, REMINDER_LEAD_MINUTES);
  if (!at) return 'unavailable';

  let perm = await N.getPermissionsAsync();
  if (!perm.granted) perm = await N.requestPermissionsAsync();
  if (!perm.granted) return 'denied';

  if (Platform.OS === 'android') {
    await N.setNotificationChannelAsync(CHANNEL, {
      name: 'Live darshan reminders',
      importance: N.AndroidImportance.HIGH,
    });
  }
  try {
    const id: string = await N.scheduleNotificationAsync({
      content: {
        title: `${a.title} · ${a.templeName}`,
        body: a.body,
        data: { liveDarshan: a.streamSlug },
        ...(Platform.OS === 'android' ? { channelId: CHANNEL } : {}),
      },
      trigger: { type: N.SchedulableTriggerInputTypes.DAILY, hour: at.hour, minute: at.minute },
    });
    await save(withReminder(map, key, id));
    return 'on';
  } catch {
    return 'unavailable';
  }
}
