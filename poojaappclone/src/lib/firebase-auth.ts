import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import {
  type ConfirmationResult,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPhoneNumber,
  signOut,
  type User,
} from '@react-native-firebase/auth';

import type { StringKey } from '@/i18n';

import { GOOGLE_WEB_CLIENT_ID } from '@/constants/config';

/**
 * Every Firebase call the app makes, in one place.
 *
 * Nothing above this file imports `@react-native-firebase/*` directly — the
 * screens deal in `requestOtp` / `confirmOtp` / `signInWithGoogle` and in
 * plain `AuthError` values, so the provider SDK stays swappable and, more
 * usefully, so Firebase's error codes get translated exactly once.
 *
 * Requires a development build (`npx expo run:android`). These are native
 * modules; they do not exist in Expo Go.
 */

export const auth = () => getAuth();

/** A phone sign-in awaiting its code. Opaque to callers — pass it back to `confirmOtp`. */
export type OtpConfirmation = ConfirmationResult;
export type FirebaseUser = User;

/**
 * A sign-in failure the UI can act on.
 *
 * `code` is ours, not Firebase's, so the screens never switch on vendor
 * strings. `message` is an i18n key from `STRINGS`.
 */
export type AuthError = {
  code:
    | 'invalid-phone'
    | 'invalid-code'
    | 'code-expired'
    | 'too-many-requests'
    | 'network'
    | 'cancelled'
    | 'play-services'
    | 'not-configured'
    | 'sms-region'
    | 'billing'
    | 'unknown';
  message: StringKey | '';
  /** The raw provider message, for the dev console — never shown to devotees. */
  detail?: string;
};

function fail(code: AuthError['code'], message: AuthError['message'], detail?: string): AuthError {
  return { code, message, detail };
}

/** Map a Firebase error code onto ours + the i18n key the screen should show. */
function toAuthError(e: unknown): AuthError {
  const code = (e as { code?: string })?.code ?? '';
  const detail = (e as { message?: string })?.message;

  // Firebase buries two whole classes of project misconfiguration in generic
  // codes, so the message is the only thing that identifies them. Both are
  // things the operator must fix in the console; neither is the devotee's
  // fault, and neither is retryable, so saying "please try again" is a lie.
  if (/BILLING_NOT_ENABLED/i.test(detail ?? '')) {
    return fail('billing', 'err_sms_billing', detail);
  }

  switch (code) {
    case 'auth/invalid-phone-number':
    case 'auth/missing-phone-number':
      return fail('invalid-phone', 'err_phone', detail);
    case 'auth/invalid-verification-code':
      return fail('invalid-code', 'err_otp', detail);
    case 'auth/session-expired':
    case 'auth/code-expired':
      return fail('code-expired', 'err_otp_expired', detail);
    case 'auth/too-many-requests':
      return fail('too-many-requests', 'err_too_many', detail);
    case 'auth/network-request-failed':
      return fail('network', 'err_network', detail);
    case 'auth/operation-not-allowed':
      // Firebase returns this for two unrelated setup mistakes and the code
      // alone cannot tell them apart — only the message can. Worth splitting:
      // the region one sends you hunting through Sign-in method, where the
      // provider is already enabled and everything looks correct.
      //   · provider switched off  → Authentication → Sign-in method
      //   · region not allowed     → Authentication → Settings → SMS region policy
      if (/region/i.test(detail ?? '')) return fail('sms-region', 'err_sms_region', detail);
      return fail('not-configured', 'err_auth_unavailable', detail);
    default:
      return fail('unknown', 'err_signin_failed', detail || String(e));
  }
}

/* ------------------------------------------------------------------ phone -- */

/**
 * Normalise a 10-digit Indian number to E.164, which is the only form Firebase
 * accepts. A number the devotee typed with +91, 0, or spaces already still
 * ends up as +91XXXXXXXXXX.
 */
function toE164(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  const local = digits.startsWith('91') && digits.length === 12
    ? digits.slice(2)
    : digits.startsWith('0') && digits.length === 11
      ? digits.slice(1)
      : digits;
  if (local.length !== 10) return null;
  return `+91${local}`;
}

/** Send a real SMS. Resolves with the handle you pass to `confirmOtp`. */
export async function requestOtp(phone: string): Promise<OtpConfirmation> {
  const e164 = toE164(phone);
  if (!e164) throw fail('invalid-phone', 'err_phone');
  try {
    return await signInWithPhoneNumber(auth(), e164);
  } catch (e) {
    throw toAuthError(e);
  }
}

/** Complete a phone sign-in. Throws an `AuthError` if the code is wrong. */
export async function confirmOtp(confirmation: OtpConfirmation, code: string) {
  try {
    return await confirmation.confirm(code);
  } catch (e) {
    throw toAuthError(e);
  }
}

/* ----------------------------------------------------------------- google -- */

let googleConfigured = false;

function configureGoogle() {
  if (googleConfigured) return;
  GoogleSignin.configure({
    // The **web** client id from google-services.json — not the Android one.
    // Firebase will not accept the credential without it, and the failure
    // ("DEVELOPER_ERROR") says nothing about which id is missing.
    webClientId: GOOGLE_WEB_CLIENT_ID,
    offlineAccess: false,
  });
  googleConfigured = true;
}

/** Native account picker → Firebase credential. Throws an `AuthError`. */
export async function signInWithGoogle() {
  configureGoogle();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();

    if (!isSuccessResponse(response)) {
      // The devotee backed out of the picker — not an error worth showing.
      throw fail('cancelled', '');
    }

    const idToken = response.data.idToken;
    if (!idToken) {
      // Almost always a webClientId that doesn't match the Firebase project.
      throw fail('not-configured', 'err_auth_unavailable', 'Google returned no idToken');
    }

    return await signInWithCredential(auth(), GoogleAuthProvider.credential(idToken));
  } catch (e) {
    if ((e as AuthError)?.code && typeof (e as AuthError).message === 'string') throw e;
    if (isErrorWithCode(e)) {
      switch (e.code) {
        case statusCodes.SIGN_IN_CANCELLED:
          throw fail('cancelled', '');
        case statusCodes.IN_PROGRESS:
          throw fail('cancelled', '');
        case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
          throw fail('play-services', 'err_play_services');
      }
    }
    throw toAuthError(e);
  }
}

/* ----------------------------------------------------------------- session -- */

export function watchAuthState(cb: (user: FirebaseUser | null) => void) {
  return onAuthStateChanged(auth(), cb);
}

/**
 * A fresh ID token for the backend. Firebase caches it for an hour and
 * refreshes on its own; `force` is for the one case that matters — the server
 * said 401, so the cached token may have been revoked.
 */
export async function getIdToken(force = false): Promise<string | null> {
  const user = auth().currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken(force);
  } catch {
    return null;
  }
}

export async function firebaseSignOut() {
  // Clear the Google session too, or the next sign-in silently reuses the same
  // account instead of showing the picker.
  //
  // `configure()` must have run in THIS process first: the native module's
  // `signOut` rejects with "apiClient is null — call configure() first" otherwise,
  // and the catch below would swallow it. Configuration used to happen only inside
  // `signInWithGoogle`, so after any app restart a logout did nothing to Google's
  // session and the next "Continue with Google" signed straight back in as the
  // same account, with no chooser — a devotee could never switch accounts.
  configureGoogle();
  await GoogleSignin.signOut().catch((e) => {
    if (__DEV__) console.warn('[auth] Google sign-out failed:', e);
  });
  await signOut(auth()).catch(() => {});
}
