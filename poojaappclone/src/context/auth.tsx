import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import type { StringKey } from '@/context/language';
import { ApiError, type Profile, syncProfile, updateProfile } from '@/lib/api';
import { firebaseSignOut, type FirebaseUser, watchAuthState } from '@/lib/firebase-auth';

/** How the devotee proved who they are. */
export type AuthMethod = 'phone' | 'google';

export type User = {
  name: string;
  method: AuthMethod;
  /** Display handle — E.164 phone number, or the Google account's email. */
  contact: string;
  /** optional short bio from Create Profile */
  bio?: string;
  /** Firebase uid. Stable across sign-ins; the backend's real key. */
  uid: string;
  email?: string | null;
  photoUrl?: string | null;
};

type AuthContextValue = {
  /** The signed-in devotee, or null. Null also while the profile is incomplete. */
  user: User | null;
  /** True until Firebase has reported its first auth state. */
  loading: boolean;
  /**
   * Firebase accepted the credential but this devotee has no name yet — the
   * login screen should jump straight to Create Profile rather than ask them
   * to verify all over again.
   */
  needsProfile: boolean;
  /** Finish a first sign-in by naming the account. */
  completeProfile: (input: { name: string; bio?: string }) => Promise<void>;
  /** Re-read the profile from the backend (e.g. after an admin edit). */
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * Why the last sign-in attempt ended badly, as an i18n key. Currently only
   * `err_blocked` — the admin blocked this account, so the app signed it out.
   */
  authError: StringKey | null;
  clearAuthError: () => void;
};

const PROFILE_KEY = 'pooja.auth.profile';
const DEVICE_KEY = 'pooja.deviceId';

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  needsProfile: false,
  completeProfile: async () => {},
  refreshProfile: async () => {},
  signOut: async () => {},
  authError: null,
  clearAuthError: () => {},
});

function toUser(p: Profile): User {
  return {
    name: p.name,
    method: (p.method === 'google' ? 'google' : 'phone') as AuthMethod,
    contact: p.contact,
    bio: p.bio,
    uid: p.uid,
    email: p.email,
    photoUrl: p.photoUrl,
  };
}

/**
 * What we can show without the backend.
 *
 * The app has always worked with the API down (flags and content both fall
 * back), and sign-in should not be the one thing that breaks on a bad train
 * connection. Firebase already verified this person offline — the only thing
 * the backend adds is the stored name/bio, so a cached copy is enough.
 */
function fromFirebase(fu: FirebaseUser): User {
  return {
    name: fu.displayName?.trim() || '',
    method: fu.phoneNumber ? 'phone' : 'google',
    contact: fu.phoneNumber || fu.email || fu.uid,
    uid: fu.uid,
    email: fu.email,
    photoUrl: fu.photoURL,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<StringKey | null>(null);

  // Guards the async sync against a sign-out that lands mid-flight.
  const activeUid = useRef<string | null>(null);

  const cache = useCallback(async (u: User | null) => {
    if (u) await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(u)).catch(() => {});
    else await AsyncStorage.removeItem(PROFILE_KEY).catch(() => {});
  }, []);

  const apply = useCallback(
    (u: User | null) => {
      if (u && !u.name.trim()) {
        // Verified, but nameless — hold at Create Profile.
        setUser(null);
        setNeedsProfile(true);
        return;
      }
      setNeedsProfile(false);
      setUser(u);
      cache(u);
    },
    [cache],
  );

  const hardSignOut = useCallback(
    async (reason: StringKey | null) => {
      activeUid.current = null;
      setUser(null);
      setNeedsProfile(false);
      setAuthError(reason);
      await cache(null);
      await firebaseSignOut();
    },
    [cache],
  );

  /**
   * Firebase is the source of truth; the backend row follows it.
   *
   * The cached profile is shown FIRST and the sync runs behind it. Waiting on
   * the network here would hold the splash for the full request timeout on
   * every cold start with the backend unreachable — and this app is expected
   * to work with the backend unreachable. The sync still lands a moment later
   * and corrects whatever the cache got wrong.
   */
  useEffect(() => {
    const unsubscribe = watchAuthState(async (fu) => {
      if (!fu) {
        activeUid.current = null;
        setUser(null);
        setNeedsProfile(false);
        await cache(null);
        setLoading(false);
        return;
      }

      activeUid.current = fu.uid;

      // 1. Show something immediately.
      const raw = await AsyncStorage.getItem(PROFILE_KEY).catch(() => null);
      const cached = raw ? (JSON.parse(raw) as User) : null;
      if (activeUid.current !== fu.uid) return;
      apply(cached?.uid === fu.uid ? cached : fromFirebase(fu));
      setLoading(false);

      // 2. Then reconcile with the backend.
      const deviceId = (await AsyncStorage.getItem(DEVICE_KEY).catch(() => null)) ?? undefined;
      try {
        const profile = await syncProfile({
          deviceId,
          // Google hands us a name; phone sign-ins have none until the devotee
          // types one. Sending it here means Google users skip Create Profile.
          // A name already typed offline rides up from the cache.
          name: cached?.name?.trim() || fu.displayName?.trim() || undefined,
          ...(cached?.bio ? { bio: cached.bio } : {}),
        });
        if (activeUid.current !== fu.uid) return; // signed out while we waited
        apply(toUser(profile));
      } catch (e) {
        if (activeUid.current !== fu.uid) return;
        // 403 means an admin blocked this account — not survivable offline-style,
        // so drop the session rather than keep serving the cached copy.
        if (e instanceof ApiError && e.status === 403) await hardSignOut('err_blocked');
        // Anything else (backend down, no network, 503 because Firebase Admin
        // is not configured yet) — keep what step 1 already put on screen.
      }
    });

    return unsubscribe;
  }, [apply, cache, hardSignOut]);

  const completeProfile = useCallback(
    async ({ name, bio }: { name: string; bio?: string }) => {
      const trimmed = name.trim();
      try {
        apply(toUser(await updateProfile({ name: trimmed, bio })));
      } catch {
        // Offline: let them in with what they typed. The next successful sync
        // pushes it up, because `syncProfile` sends the cached name.
        setNeedsProfile(false);
        setUser((prev) => {
          const next: User = prev
            ? { ...prev, name: trimmed, bio }
            : { name: trimmed, bio, method: 'phone', contact: '', uid: '' };
          cache(next);
          return next;
        });
      }
    },
    [apply, cache],
  );

  const refreshProfile = useCallback(async () => {
    try {
      apply(toUser(await syncProfile({})));
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) await hardSignOut('err_blocked');
    }
  }, [apply, hardSignOut]);

  const signOut = useCallback(() => hardSignOut(null), [hardSignOut]);
  const clearAuthError = useCallback(() => setAuthError(null), []);

  const value = useMemo(
    () => ({
      user,
      loading,
      needsProfile,
      completeProfile,
      refreshProfile,
      signOut,
      authError,
      clearAuthError,
    }),
    [user, loading, needsProfile, completeProfile, refreshProfile, signOut, authError, clearAuthError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
