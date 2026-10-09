import type { StringKey } from '@/i18n';
import type { Gender } from '@/lib/api';

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
  /** Server-granted. A cached profile from before roles existed means `devotee`. */
  role?: 'devotee' | 'astrologer';
  astrologer?: { id: string; name: string } | null;
};

export type AuthContextValue = {
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
  /**
   * Local, cosmetic: an astrologer looking at the devotee app. The server
   * role is untouched and nothing is granted or removed by this.
   */
  devoteeView: boolean;
  setDevoteeView: (on: boolean) => void;
};
