import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import type { MutableRefObject } from 'react';
import { Platform } from 'react-native';

import { apiFetch } from '@/lib/api/client';
import { APP_VERSION_NAME, APP_VERSION_CODE, getDeviceId } from '@/lib/app-info';

import { type Analytics, EMPTY_ANALYTICS } from './analytics';
import { DEFAULT_FLAGS, type FeatureKey, type Flags } from './flags';
import { post } from './ingest';
import { ADMIN_KEY, ANALYTICS_KEY, FLAGS_KEY } from './storage';

/**
 * Load persisted state + start a session on mount, then sync with backend.
 */
export async function bootstrapAdmin({
  setFlags,
  setAnalytics,
  setIsAdmin,
  loaded,
  deviceId,
}: {
  setFlags: React.Dispatch<React.SetStateAction<Flags>>;
  setAnalytics: React.Dispatch<React.SetStateAction<Analytics>>;
  setIsAdmin: (v: boolean) => void;
  loaded: MutableRefObject<boolean>;
  deviceId: MutableRefObject<string>;
}) {
  const [rawF, rawA, rawAdmin] = await Promise.all([
    AsyncStorage.getItem(FLAGS_KEY),
    AsyncStorage.getItem(ANALYTICS_KEY),
    AsyncStorage.getItem(ADMIN_KEY),
  ]).catch(() => [null, null, null] as const);

  if (rawF) setFlags({ ...DEFAULT_FLAGS, ...JSON.parse(rawF) });
  if (rawAdmin === '1') setIsAdmin(true);

  // Stable per-install device id — the same one the API headers carry (lib/app-info).
  const did = (await getDeviceId()) ?? `dev_${Date.now().toString(36)}`;
  deviceId.current = did;

  const now = Date.now();
  const prev: Analytics = rawA ? JSON.parse(rawA) : EMPTY_ANALYTICS;
  const next: Analytics = {
    ...EMPTY_ANALYTICS,
    ...prev,
    firstOpen: prev.firstOpen || now,
    lastActive: now,
    sessions: (prev.sessions || 0) + 1,
  };
  setAnalytics(next);
  loaded.current = true;
  AsyncStorage.setItem(ANALYTICS_KEY, JSON.stringify(next)).catch(() => {});

  // Report the session to the backend + pull remote flags (best-effort).
  post('/api/ingest/session', {
    deviceId: did,
    model: Device.modelName,
    os: `${Platform.OS} ${Platform.Version}`,
    appVersion: APP_VERSION_NAME,
    versionCode: APP_VERSION_CODE,
  });
  // Two attempts: a short one, then a long one. A hosted backend that has been idle (Render's free plan sleeps) can take 20-60 s to wake,
  // and a single 4 s try gave up before it answered, leaving a stale cached flag in force (mobile login looked dead). Neither blocks the UI:
  // the cached flags are already applied above.
  for (const timeoutMs of [6_000, 30_000]) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await apiFetch('/api/flags', { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = (await res.json()) as { flags?: Partial<Record<string, unknown>> };
      if (data.flags) {
        // Only accept known keys, coerced to booleans — a malformed remote
        // payload can never replace a flag with a non-boolean.
        const clean: Partial<Flags> = {};
        (Object.keys(DEFAULT_FLAGS) as FeatureKey[]).forEach((k) => {
          if (k in data.flags!) clean[k] = !!data.flags![k];
        });
        setFlags((cur) => {
          const merged = { ...cur, ...clean };
          AsyncStorage.setItem(FLAGS_KEY, JSON.stringify(merged)).catch(() => {});
          return merged;
        });
      }
      return;
    } catch {
      // backend offline or still waking — try the longer attempt, then keep the local flags
    }
  }
}
