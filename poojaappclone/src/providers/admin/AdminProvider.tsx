import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { type Analytics, EMPTY_ANALYTICS } from './analytics';
import { bootstrapAdmin } from './bootstrap';
import { AdminContext } from './context';
import { DEFAULT_FLAGS, type FeatureKey, type Flags } from './flags';
import { post } from './ingest';
import { ADMIN_KEY, ANALYTICS_KEY, FLAGS_KEY } from './storage';

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [flags, setFlags] = useState<Flags>(DEFAULT_FLAGS);
  const [analytics, setAnalytics] = useState<Analytics>(EMPTY_ANALYTICS);
  const [isAdmin, setIsAdmin] = useState(false);
  const loaded = useRef(false);
  const deviceId = useRef<string>('');

  // Load persisted state + start a session on mount, then sync with backend.
  useEffect(() => {
    bootstrapAdmin({ setFlags, setAnalytics, setIsAdmin, loaded, deviceId });
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
      resetAnalytics,
      isAdmin,
      unlockAdmin,
      lockAdmin,
    }),
    [flags, setFlag, analytics, trackScreen, resetAnalytics, isAdmin, unlockAdmin, lockAdmin],
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}
