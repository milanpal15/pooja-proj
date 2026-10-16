import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { type AppInfo, buildAppHeaders } from './app-headers';

/**
 * What this build is, sent to the API on every call so the dashboard can see which versions are in
 * the field and gate old ones (docs/RELEASES.md). `versionCode` comes from `app.json` →
 * `android.versionCode`: BUMP IT for every Android release, or the gate cannot tell builds apart.
 */
const DEVICE_KEY = 'pooja.deviceId';

export const APP_PLATFORM: string = Platform.OS;
export const APP_VERSION_NAME: string = Constants.expoConfig?.version ?? '1.0.0';
const rawCode = Constants.expoConfig?.android?.versionCode;
export const APP_VERSION_CODE: number | null = typeof rawCode === 'number' && Number.isFinite(rawCode) ? rawCode : null;
const rawApi = Platform.OS === 'android' ? Number(Platform.Version) : NaN;
export const OS_API: number | null = Number.isFinite(rawApi) ? rawApi : null;

let deviceIdPromise: Promise<string | null> | null = null;

/** The stable per-install id (one source for analytics and headers). Resolves null if storage is unusable. */
export function getDeviceId(): Promise<string | null> {
  if (!deviceIdPromise) {
    deviceIdPromise = (async () => {
      try {
        const existing = await AsyncStorage.getItem(DEVICE_KEY);
        if (existing) return existing;
        const id = `dev_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
        await AsyncStorage.setItem(DEVICE_KEY, id).catch(() => {});
        return id;
      } catch {
        deviceIdPromise = null; // try again next time rather than caching a failure
        return null;
      }
    })();
  }
  return deviceIdPromise;
}

export async function getAppInfo(): Promise<AppInfo> {
  return {
    platform: APP_PLATFORM,
    versionName: APP_VERSION_NAME,
    versionCode: APP_VERSION_CODE,
    osApi: OS_API,
    deviceId: await getDeviceId(),
  };
}

/** The `X-App-*` / `X-OS-Api` / `X-Device-Id` headers for one request. */
export async function appHeaders(): Promise<Record<string, string>> {
  return buildAppHeaders(await getAppInfo());
}
