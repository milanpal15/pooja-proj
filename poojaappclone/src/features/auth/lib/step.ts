import type { Step } from '../types';

/**
 * The provider outranks local navigation, so the step is derived rather than
 * copied into state by an effect:
 *  - `needsProfile` — Firebase accepted the credential but the account has
 *    no name, so Create Profile is the only step that makes sense.
 *  - `authError` — the session was just dropped (a blocked account), so
 *    whatever step we were on no longer exists to go back to.
 *  - phone sign-in switched off — fall back rather than strand the devotee
 *    on a step whose Send OTP can no longer work.
 */
export function deriveStep(a: {
  needsProfile: boolean;
  authError: unknown;
  phoneEnabled: boolean;
  localStep: Step;
}): Step {
  if (a.needsProfile) return 'profile';
  if (a.authError) return 'select';
  if (!a.phoneEnabled && (a.localStep === 'entry' || a.localStep === 'otp')) return 'select';
  return a.localStep;
}
