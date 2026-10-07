import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import type { StringKey } from '@/context/language';
import { ApiError, type Gender, type Profile, syncProfile, updateProfile } from '@/lib/api';
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
  gender?: Gender | null;
  /** YYYY-MM-DD. */
  dob?: string | null;
  /** True only when the provider supplied the email. */
  emailVerified?: boolean;
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
  /**
   * What we already know about the devotee being held at Create Profile.
   *
   * `user` is deliberately null while the profile is incomplete, which left
   * the login screen unable to tell a phone sign-in from a Google one after
   * a reload — and that decides whether it asks for an email. Without the
   * email a phone account can never satisfy `profileComplete`, so Create
   * Profile saved successfully and reappeared, forever.
   */
  pendingProfile: User | null;
  /** Finish a first sign-in by naming the account. */
  completeProfile: (input: {
    name: string;
    bio?: string;
    gender?: Gender;
    /** YYYY-MM-DD. */
    dob?: string;
    /** Phone sign-ins only — Google already supplies a verified address. */
    email?: string;
  }) => Promise<void>;
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
  pendingProfile: null,
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
    emailVerified: p.emailVerified,
    gender: p.gender,
    dob: p.dob,
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

/**
 * Whether we know enough to let someone in.
 *
 * Name, gender and date of birth are asked of everyone. An email is asked
 * only of phone sign-ins, because Google already supplied a verified one —
 * demanding it again would be asking for something we have.
 */
function profileComplete(u: User): boolean {
  if (!u.name.trim() || !u.gender || !u.dob) return false;
  if (u.method === 'phone' && !u.email) return false;
  return true;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [pendingProfile, setPendingProfile] = useState<User | null>(null);
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
      if (u && !profileComplete(u)) {
        // Verified, but we do not know enough about them yet — hold at
        // Create Profile rather than letting a half-made account through.
        // Kept rather than discarded: the form needs it to know which
        // fields are still missing, and to not make them retype the rest.
        setUser(null);
        setPendingProfile(u);
        setNeedsProfile(true);
        return;
      }
      setNeedsProfile(false);
      setPendingProfile(null);
      setUser(u);
      cache(u);
    },
    [cache],
  );

  const hardSignOut = useCallback(
    async (reason: StringKey | null) => {
      activeUid.current = null;
      setUser(null);
      setPendingProfile(null);
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
        setPendingProfile(null);
        setNeedsProfile(false);
        await cache(null);
        setLoading(false);
        return;
      }

      activeUid.current = fu.uid;

      // 1. Show something immediately.
      const raw = await AsyncStorage.getItem(PROFILE_KEY).catch(() => null);
      const stored = raw ? (JSON.parse(raw) as User) : null;
      /*
       * Only this account's cache is usable.
       *
       * The check used to live inline on the `apply` below, which left the
       * sync underneath reading `cached.name` unguarded — so a profile left
       * by a previous devotee on this device could put their name on a
       * different account the first time it signed in. Narrowed once, here,
       * rather than at each use.
       */
      const cached = stored?.uid === fu.uid ? stored : null;
      if (activeUid.current !== fu.uid) return;
      /*
       * Only a cache can shortcut the wait — and only a complete one gets
       * anyone past the gate.
       *
       * This used to fall back to `fromFirebase(fu)`, which can never be a
       * complete profile: Firebase knows no gender, no date of birth and,
       * for a phone sign-in, no email. So every returning devotee was
       * declared incomplete the moment they signed in, Create Profile
       * appeared, and the sync a second later replaced it with Home. A
       * form that flashes up and disappears reads as a glitch — and it is
       * live long enough to start typing into before it is taken away.
       */
      if (cached) {
        apply(cached);
        setLoading(false);
      }

      /*
       * 2. Then reconcile with the backend.
       *
       * With nothing cached this is also what decides the first screen, so
       * the splash stays up until it answers rather than guessing. Bounded
       * by `authedFetch`'s own timeout, and it only happens on a first
       * sign-in or straight after a sign-out — moments when the devotee
       * has just proved they are online.
       */
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
        if (e instanceof ApiError && e.status === 403) {
          await hardSignOut('err_blocked');
          return;
        }
        // Backend unreachable. With a cache, step 1 is already on screen.
        // Without one, Firebase is all we know — enough to hold them at
        // Create Profile, which is the honest state: a new account cannot
        // be created without the backend anyway.
        if (!cached) apply(fromFirebase(fu));
      } finally {
        // Must be in `finally`: every branch above can return early, and
        // on the no-cache path nothing else lowers the splash — missing it
        // leaves the app on the warm orange screen forever.
        setLoading(false);
      }
    });

    return unsubscribe;
  }, [apply, cache, hardSignOut]);

  const completeProfile = useCallback(
    async ({
      name,
      bio,
      gender,
      dob,
      email,
    }: { name: string; bio?: string; gender?: Gender; dob?: string; email?: string }) => {
      const trimmed = name.trim();
      try {
        apply(toUser(await updateProfile({ name: trimmed, bio, gender, dob, email })));
      } catch {
        // Offline: let them in with what they typed. The next successful sync
        // pushes it up, because `syncProfile` sends the cached name.
        setNeedsProfile(false);
        setPendingProfile(null);
        setUser((prev) => {
          const next: User = prev
            ? { ...prev, name: trimmed, bio, gender, dob }
            : { name: trimmed, bio, gender, dob, method: 'phone', contact: '', uid: '' };
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
      pendingProfile,
      completeProfile,
      refreshProfile,
      signOut,
      authError,
      clearAuthError,
    }),
    [
      user,
      loading,
      needsProfile,
      pendingProfile,
      completeProfile,
      refreshProfile,
      signOut,
      authError,
      clearAuthError,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
