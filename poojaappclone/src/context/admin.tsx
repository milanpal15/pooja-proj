import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { ADMIN_API } from '@/constants/config';

/** Fire-and-forget POST to the admin backend (ignores failures/offline). */
async function post(path: string, body: unknown) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    await fetch(`${ADMIN_API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
  } catch {
    // offline / backend down — the app keeps working with local state
  }
}

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/** Toggleable app features, controllable from the Admin panel. */
export type FeatureKey =
  | 'virtualPooja'
  | 'bhajan'
  | 'chadhava'
  | 'journal'
  | 'liveDarshan'
  | 'payments'
  | 'announcements'
  | 'phoneAuth'
  | 'demoContent';

export type Flags = Record<FeatureKey, boolean>;

/*
 * Every flag defaults ON so an unreachable backend hides nothing — except
 * `phoneAuth` and `demoContent`, which default OFF.
 *
 * The usual fail-open reasoning inverts here. Firebase stopped sending
 * verification SMS on the free Spark plan in September 2024; it now needs a
 * Blaze billing account. Failing open would put a Mobile button on the login
 * screen that cannot possibly work — every tap ends in BILLING_NOT_ENABLED.
 * Offering a sign-in route that is guaranteed to fail is worse than not
 * offering it, so this one stays off until the dashboard says otherwise.
 */
const DEFAULT_FLAGS: Flags = {
  virtualPooja: true,
  bhajan: true,
  chadhava: true,
  journal: true,
  liveDarshan: true,
  payments: true,
  announcements: true,
  phoneAuth: false,
  /*
   * `demoContent` is the other inversion, for the opposite reason.
   *
   * It decides whether the app may fall back to the catalogue compiled into
   * the bundle when the dashboard has nothing to show. Defaulting it ON
   * would mean an empty or unreachable backend silently renders invented
   * deities and temples that no operator can edit — the dashboard looks
   * broken and the app looks fine, which is the worst way round.
   *
   * Off, the app shows exactly what the backend returned, empty states and
   * all. Turn it on to demo the app, or to keep something on screen while
   * a fresh deployment is still being filled.
   */
  demoContent: false,
};

export const FEATURE_META: { key: FeatureKey; label: string; desc: string }[] = [
  { key: 'virtualPooja', label: 'Virtual Pooja', desc: 'Aarti experience' },
  { key: 'bhajan', label: 'Bhajan Library', desc: 'Media library tab' },
  { key: 'chadhava', label: 'E-Chadhava', desc: 'Offerings & checkout' },
  { key: 'journal', label: 'Daily Journal', desc: 'Mantra journal' },
  { key: 'liveDarshan', label: 'Live Darshan', desc: 'Live temple stream' },
  { key: 'payments', label: 'Payments', desc: 'Razorpay checkout' },
  { key: 'announcements', label: 'Announcements', desc: 'Temple banners' },
  { key: 'phoneAuth', label: 'Mobile OTP Sign-in', desc: 'Needs Firebase Blaze billing' },
  { key: 'demoContent', label: 'Demo Content', desc: 'Use bundled data when the dashboard is empty' },
];

export type PaymentLog = {
  id: string;
  amount: number;
  method: string;
  status: 'success' | 'failed';
  at: number;
  note?: string;
};

type Analytics = {
  firstOpen: number;
  lastActive: number;
  sessions: number;
  screenViews: Record<string, number>;
  payments: PaymentLog[];
};

const EMPTY_ANALYTICS: Analytics = {
  firstOpen: 0,
  lastActive: 0,
  sessions: 0,
  screenViews: {},
  payments: [],
};

type AdminContextValue = {
  flags: Flags;
  setFlag: (k: FeatureKey, v: boolean) => void;
  analytics: Analytics;
  trackScreen: (name: string) => void;
  logPayment: (p: Omit<PaymentLog, 'id' | 'at'>) => void;
  resetAnalytics: () => void;
  isAdmin: boolean;
  unlockAdmin: () => void;
  lockAdmin: () => void;
};

const FLAGS_KEY = 'pooja.flags';
const ANALYTICS_KEY = 'pooja.analytics';
const ADMIN_KEY = 'pooja.isAdmin';

const AdminContext = createContext<AdminContextValue>({
  flags: DEFAULT_FLAGS,
  setFlag: () => {},
  analytics: EMPTY_ANALYTICS,
  trackScreen: () => {},
  logPayment: () => {},
  resetAnalytics: () => {},
  isAdmin: false,
  unlockAdmin: () => {},
  lockAdmin: () => {},
});

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [flags, setFlags] = useState<Flags>(DEFAULT_FLAGS);
  const [analytics, setAnalytics] = useState<Analytics>(EMPTY_ANALYTICS);
  const [isAdmin, setIsAdmin] = useState(false);
  const loaded = useRef(false);
  const deviceId = useRef<string>('');

  // Load persisted state + start a session on mount, then sync with backend.
  useEffect(() => {
    (async () => {
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
    })();
  }, []);

  const persistAnalytics = useCallback((a: Analytics) => {
    AsyncStorage.setItem(ANALYTICS_KEY, JSON.stringify(a)).catch(() => {});
  }, []);

  const setFlag = useCallback((k: FeatureKey, v: boolean) => {
    setFlags((prev) => {
      const next = { ...prev, [k]: v };
      AsyncStorage.setItem(FLAGS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const trackScreen = useCallback(
    (name: string) => {
      if (!loaded.current) return;
      post('/api/ingest/screen', { deviceId: deviceId.current, screen: name });
      setAnalytics((prev) => {
        const next: Analytics = {
          ...prev,
          lastActive: Date.now(),
          screenViews: { ...prev.screenViews, [name]: (prev.screenViews[name] || 0) + 1 },
        };
        persistAnalytics(next);
        return next;
      });
    },
    [persistAnalytics],
  );

  const logPayment = useCallback(
    (p: Omit<PaymentLog, 'id' | 'at'>) => {
      post('/api/ingest/payment', { deviceId: deviceId.current, ...p });
      setAnalytics((prev) => {
        const entry: PaymentLog = { ...p, id: `pay_${prev.payments.length + 1}`, at: Date.now() };
        const next: Analytics = { ...prev, payments: [entry, ...prev.payments].slice(0, 50) };
        persistAnalytics(next);
        return next;
      });
    },
    [persistAnalytics],
  );

  const resetAnalytics = useCallback(() => {
    const now = Date.now();
    const fresh: Analytics = { ...EMPTY_ANALYTICS, firstOpen: now, lastActive: now, sessions: 1 };
    setAnalytics(fresh);
    persistAnalytics(fresh);
  }, [persistAnalytics]);

  const unlockAdmin = useCallback(() => {
    setIsAdmin(true);
    AsyncStorage.setItem(ADMIN_KEY, '1').catch(() => {});
  }, []);
  const lockAdmin = useCallback(() => {
    setIsAdmin(false);
    AsyncStorage.removeItem(ADMIN_KEY).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({
      flags,
      setFlag,
      analytics,
      trackScreen,
      logPayment,
      resetAnalytics,
      isAdmin,
      unlockAdmin,
      lockAdmin,
    }),
    [flags, setFlag, analytics, trackScreen, logPayment, resetAnalytics, isAdmin, unlockAdmin, lockAdmin],
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  return useContext(AdminContext);
}
