import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import type { MutableRefObject } from 'react';
import { Platform } from 'react-native';

import { ADMIN_API } from '@/constants/config';

import { type Analytics, EMPTY_ANALYTICS } from './analytics';
import { DEFAULT_FLAGS, type FeatureKey, type Flags } from './flags';
import { hashStr, post } from './ingest';
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
  const [rawF, rawA, rawAdmin, rawDev] = await Promise.all([
    AsyncStorage.getItem(FLAGS_KEY),
    AsyncStorage.getItem(ANALYTICS_KEY),
    AsyncStorage.getItem(ADMIN_KEY),
    AsyncStorage.getItem('pooja.deviceId'),
  ]).catch(() => [null, null, null, null] as const);

  if (rawF) setFlags({ ...DEFAULT_FLAGS, ...JSON.parse(rawF) });
  if (rawAdmin === '1') setIsAdmin(true);

  // Stable per-install device id.
  let did = rawDev;
  if (!did) {
    did = `dev_${Math.abs(hashStr(String(Date.now()) + Math.random())).toString(36)}`;
    AsyncStorage.setItem('pooja.deviceId', did).catch(() => {});
  }
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
    appVersion: '1.0.0',
  });
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${ADMIN_API}/api/flags`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) {
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
    }
  } catch {
    // backend offline — keep local flags
  }
}
