import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { registerPushToken, unregisterPushToken } from '@/lib/api';

import { CHANNEL_CALLS, CHANNEL_DEFAULT, needsRegistration, usableToken } from './push-logic';

/**
 * Background push (Firebase Cloud Messaging) for this phone: ask for permission, get the device's FCM token, hand it to the backend,
 * and keep that in step with sign-in and sign-out. What the server does with it lives in the identity service.
 *
 * `expo-notifications` is loaded lazily and never in Expo Go on Android — importing it there throws from a side-effect module and
 * takes the app down (see features/alarm/lib/notifications.ts). Android only for now: iOS would need APNs set up in Firebase.
 */
const IN_EXPO_GO = Constants.executionEnvironment === 'storeClient';
const STORE_KEY = 'push_registration_v1';

export type NotificationsModule = any;

let cached: NotificationsModule | null = null;
let attempted = false;

export async function loadPushModule(): Promise<NotificationsModule | null> {
  if (cached || attempted) return cached;
  attempted = true;
  if (Platform.OS !== 'android' || IN_EXPO_GO) return null;
  try {
    cached = await import('expo-notifications');
  } catch {
    cached = null;
  }
  return cached;
}

/** The channels the server names in its messages. On Android 8+ a channel owns sound and urgency, so they must exist before a push arrives. */
export async function ensurePushChannels(N: NotificationsModule): Promise<void> {
  await N.setNotificationChannelAsync(CHANNEL_CALLS, {
    name: 'Incoming calls',
    description: 'Rings when a devotee calls you.',
    importance: N.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 300, 500, 300, 500],
    lockscreenVisibility: N.AndroidNotificationVisibility.PUBLIC,
  });
  await N.setNotificationChannelAsync(CHANNEL_DEFAULT, {
    name: 'Updates',
    description: 'Booking and offering updates.',
    importance: N.AndroidImportance.DEFAULT,
  });
}

async function remembered(): Promise<{ token: string; uid: string } | null> {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as { token: string; uid: string }) : null;
  } catch {
    return null;
  }
}

/**
 * Permission → token → backend. Resolves the token, or null when push is unavailable here or the devotee said no. Never throws.
 * Safe to call on every launch: it only talks to the backend when the token or the account changed.
 */
export async function registerForPush(uid: string): Promise<string | null> {
  try {
    const N = await loadPushModule();
    if (!N) return null;
    await ensurePushChannels(N);

    let perm = await N.getPermissionsAsync();
    if (!perm.granted && perm.canAskAgain !== false) perm = await N.requestPermissionsAsync();
    if (!perm.granted) return null;

    const token = usableToken((await N.getDevicePushTokenAsync())?.data);
    if (!token) return null;
    if (needsRegistration(await remembered(), token, uid)) {
      await registerPushToken(token, 'android');
      await AsyncStorage.setItem(STORE_KEY, JSON.stringify({ token, uid }));
    }
    return token;
  } catch {
    return null; // offline, backend down, permission API hiccup: the next launch tries again
  }
}

/** Re-register after the OS rotates the token. Returns an unsubscribe function. */
export async function watchPushToken(uid: string): Promise<() => void> {
  const N = await loadPushModule();
  if (!N) return () => {};
  const sub = N.addPushTokenListener((t: { data?: unknown }) => {
    const token = usableToken(t?.data);
    if (!token) return;
    registerPushToken(token, 'android')
      .then(() => AsyncStorage.setItem(STORE_KEY, JSON.stringify({ token, uid })))
      .catch(() => {});
  });
  return () => sub.remove();
}

/** Sign-out: stop this account's notifications reaching this phone. Best effort and bounded, so it can never hold a sign-out. */
export async function unregisterForPush(): Promise<void> {
  try {
    const mine = await remembered();
    if (!mine) return;
    await AsyncStorage.removeItem(STORE_KEY);
    await Promise.race([unregisterPushToken(mine.token), new Promise<void>((r) => setTimeout(r, 2500))]);
  } catch {
    // the server forgets a token when FCM reports it dead, and moves it when the next account registers it
  }
}
