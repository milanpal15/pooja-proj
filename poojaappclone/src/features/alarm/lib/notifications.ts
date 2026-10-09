import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { RemoteTone } from '@/providers/content';

/**
 * Expo Go on Android cannot host these native modules, and the failure is not
 * catchable: `expo-notifications` throws from inside a side-effect module
 * during evaluation, which escapes a try/catch around the dynamic import and
 * surfaces as an uncaught error that takes the screen down.
 *
 * So the import is never attempted there. Detecting the runtime is the only
 * reliable guard — handling the error is not an option when the error refuses
 * to be handled.
 */
const IN_EXPO_GO = Constants.executionEnvironment === 'storeClient';

/**
 * Daily aarti reminders, as repeating local notifications.
 *
 * Local rather than push, deliberately. These fire at 4:30am for Mangala
 * Aarti; they must not depend on a server, a network, or the push
 * infrastructure that Expo Go on Android no longer supports. Once scheduled
 * they are the operating system's problem, which is exactly where an alarm
 * belongs.
 *
 * State lives in AsyncStorage rather than being read back from the OS: the
 * scheduled-notification list is a poor source of truth (it is emptied by a
 * reinstall and reordered by the platform), and the settings screen needs to
 * render before any permission dialog has been answered.
 *
 * ── Why expo-notifications is loaded lazily ─────────────────────────────
 *
 * On Android, Expo Go throws the moment `expo-notifications` is IMPORTED —
 * not when a push method is called. Since expo-router loads routes eagerly, a
 * top-level import took down the entire app, not just this screen.
 *
 * So the module is pulled in on demand and every call site tolerates its
 * absence. In Expo Go the settings still render and persist, and the screen
 * says plainly that reminders need a development build; on a dev build the
 * same code schedules for real with nothing to change.
 */

export type NotificationsModule = any;

let cached: NotificationsModule | null = null;
let attempted = false;

/** Returns the module, or null where the platform will not have it. */
export async function loadNotifications(): Promise<NotificationsModule | null> {
  if (cached || attempted) return cached;
  attempted = true;
  if (IN_EXPO_GO && Platform.OS === 'android') return null;
  try {
    const mod = await import('expo-notifications');
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    cached = mod;
  } catch {
    cached = null;
  }
  return cached;
}

/**
 * One notification channel per tone.
 *
 * On Android 8+ the **channel** owns the sound — `content.sound` on an
 * individual notification is ignored once a channel exists. The app had a
 * single `reminders` channel and set the tone per notification, so choosing
 * "Temple Bell" changed nothing audible.
 *
 * A channel's sound is also immutable after creation, which is why each tone
 * gets its own channel rather than one channel being re-configured.
 *
 * The old channel passed `sound: 'default'`. That string is read as the name
 * of a bundled custom sound, not as "use the system default" — hence the
 * `Custom sound 'default' not found` error on every launch. Omitting `sound`
 * is how you ask for the system default.
 */
export async function ensureToneChannels(N: NotificationsModule, tones: RemoteTone[]) {
  for (const tone of tones) {
    const silent = tone.slug === 'silent';
    await N.setNotificationChannelAsync(channelFor(tone.slug), {
      name: `Aarti Reminders · ${tone.title}`,
      importance: silent ? N.AndroidImportance.LOW : N.AndroidImportance.HIGH,
      /*
       * Omitted entirely for the system default; `null` for silence.
       *
       * An Android channel's sound must be a file bundled with the app, and
       * none is any more — every tone is uploaded from the dashboard. So
       * this path can only ask for the device's own sound. The tone the
       * devotee actually chose is played by the native alarm, which streams
       * it; the notification is what is left when the alarm did not fire.
       */
      ...(silent ? { sound: null } : {}),
    });
  }
}

/** Channel id for a tone. Stable, because channels cannot be edited later. */
export function channelFor(toneId: string) {
  return `reminders-${toneId}`;
}

