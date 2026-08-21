import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { ADMIN_API } from '@/constants/config';

export type AuthMethod = 'email' | 'phone';

export type User = {
  name: string;
  method: AuthMethod;
  /** email address or phone number */
  contact: string;
  /** optional short bio from Create Profile */
  bio?: string;
};

type AuthContextValue = {
  user: User | null;
  /** True until the persisted session has been read from storage. */
  loading: boolean;
  signIn: (user: User) => Promise<void>;
  signOut: () => Promise<void>;
};

const STORAGE_KEY = 'pooja.auth.user';
const DEVICE_KEY = 'pooja.deviceId';

/**
 * Best-effort: register/refresh this user in the admin backend so they appear
 * on the dashboard's Users page. Silently ignored if the backend is offline.
 */
async function registerUser(u: User) {
  try {
    const deviceId = (await AsyncStorage.getItem(DEVICE_KEY).catch(() => null)) || undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    await fetch(`${ADMIN_API}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        name: u.name,
        contact: u.contact,
        method: u.method,
        bio: u.bio,
        deviceId,
        model: Device.modelName ?? undefined,
      }),
    }).finally(() => clearTimeout(timer));
  } catch {
    // offline / backend down — non-fatal
  }
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setUser(JSON.parse(raw) as User);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async (next: User) => {
    setUser(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
    registerUser(next);
  }, []);

  const signOut = useCallback(async () => {
    setUser(null);
    await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ user, loading, signIn, signOut }),
    [user, loading, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
