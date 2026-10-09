import { useCallback, useState } from 'react';

import { GOOGLE_WEB_CLIENT_ID } from '@/constants/config';
import { useLanguage } from '@/i18n';
import { signInWithGoogle } from '@/lib/firebase-auth';
import { useAdmin } from '@/providers/admin';
import { useAuth } from '@/providers/auth';

import { deriveStep } from '../lib/step';
import type { SignedInBy, Step } from '../types';
import { useAuthAction } from './use-auth-action';
import { useAuthErrors } from './use-auth-errors';
import { useOtpFlow } from './use-otp-flow';

/** Navigation among select → entry → otp, and the sign-in calls behind it. */
export function useLoginFlow(onSignedIn?: (by: SignedInBy) => void) {
  const { needsProfile, authError } = useAuth();
  /*
   * SMS OTP is gated because Firebase bills per message and refuses to send
   * at all without a Blaze billing account. Off, the screen offers Google
   * only rather than a button that always fails.
   */
  const { flags } = useAdmin();
  const phoneEnabled = flags.phoneAuth;
  const { t } = useLanguage();

  // Never 'profile': Create Profile is reached only through `needsProfile`.
  const [localStep, setStep] = useState<Step>('select');
  const errs = useAuthErrors();
  const action = useAuthAction(errs);
  const { resetError, setError } = errs;
  const { run, busy } = action;

  const otp = useOtpFlow(
    errs,
    action,
    useCallback(() => setStep('otp'), []),
    useCallback(() => onSignedIn?.('phone'), [onSignedIn]),
  );

  // Derived during render, never copied into state by an effect.
  const step = deriveStep({ needsProfile, authError, phoneEnabled, localStep });

  const google = useCallback(async () => {
    if (!GOOGLE_WEB_CLIENT_ID) return setError(t('err_google_not_configured'));
    await run(async () => {
      await signInWithGoogle();
      onSignedIn?.('google');
    });
  }, [run, setError, t, onSignedIn]);

  const goTo = useCallback(
    (next: Step) => {
      resetError();
      setStep(next);
    },
    [resetError],
  );

  /** Choosing mobile also clears any number left from a previous visit. */
  const chooseMobile = () => {
    otp.setPhone('');
    goTo('entry');
  };

  return { step, phoneEnabled, errs, busy, otp, google, goTo, chooseMobile };
}
