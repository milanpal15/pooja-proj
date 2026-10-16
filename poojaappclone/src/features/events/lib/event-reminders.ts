import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { alreadyScheduled, parseReminders, planReminder, pruneReminders, type ReminderMap, withoutReminder, withReminder } from './reminder-plan';

/**
 * "We'll remind you" — a local notification at the moment the NEXT milestone of an event opens.
 *
 * Local, so it needs no server. One per event: the notification id the OS returned is kept per
 * event slug in AsyncStorage, so scheduling a newer one replaces the old, and leaving the event (or
 * finishing it) cancels exactly this one. `expo-notifications` is imported lazily and never in Expo
 * Go on Android (it throws, uncatchably, on import there) — the same rule Live Darshan follows.
 *
 * `scheduleNextReminder` resolves true ONLY when a notification really exists for that moment, so the
 * completion sheet never promises a reminder that was not scheduled.
 */

const STORAGE_KEY = 'events.reminders.v1';
const CHANNEL = 'events';

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

async function load(): Promise<ReminderMap> {
  try {
    return pruneReminders(parseReminders(await AsyncStorage.getItem(STORAGE_KEY)), Date.now());
  } catch {
    return {};
  }
}

async function save(map: ReminderMap) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage failed: the notification still exists; it just will not be cancelled by leave.
  }
}

export type NextReminder = {
  slug: string;
  /** The notification title (the event's name, in the reader's language). */
  title: string;
  /** The notification body, already localised ("Day 6 · Katyayani is open"). */
  body: string;
  opensAt: string | null | undefined;
};

/** Schedules (or keeps) the reminder for the next milestone. True only if one now exists. */
export async function scheduleNextReminder(r: NextReminder): Promise<boolean> {
  const at = planReminder(r.opensAt, Date.now());
  if (at === null) return false;
  const N = await loadNotifications();
  if (!N) return false;
  try {
    const map = await load();
    if (alreadyScheduled(map, r.slug, at)) return true;

    let perm = await N.getPermissionsAsync();
    if (!perm.granted) perm = await N.requestPermissionsAsync();
    if (!perm.granted) return false;

    if (map[r.slug]) await N.cancelScheduledNotificationAsync(map[r.slug].id).catch(() => {});
    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync(CHANNEL, { name: 'Event reminders', importance: N.AndroidImportance.HIGH });
    }
    const id: string = await N.scheduleNotificationAsync({
      content: { title: r.title, body: r.body, data: { event: r.slug }, ...(Platform.OS === 'android' ? { channelId: CHANNEL } : {}) },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: new Date(at) },
    });
    await save(withReminder(map, r.slug, { id, at }));
    return true;
  } catch {
    return false;
  }
}

/** Cancels the event's reminder (leaving the event, or nothing is left to remind about). Never throws. */
export async function cancelEventReminder(slug: string): Promise<void> {
  try {
    const map = await load();
    const existing = map[slug];
    if (!existing) return;
    const N = await loadNotifications();
    if (N) await N.cancelScheduledNotificationAsync(existing.id).catch(() => {});
    await save(withoutReminder(map, slug));
  } catch {
    // Nothing to cancel, or storage failed — either way the reminder is not ours to keep.
  }
}
