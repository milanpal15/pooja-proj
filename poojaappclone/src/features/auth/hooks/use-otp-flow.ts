import { useCallback, useRef, useState } from 'react';
import type { TextInput } from 'react-native';

import { useLanguage } from '@/i18n';
import { confirmOtp, type OtpConfirmation, requestOtp } from '@/lib/firebase-auth';

import { RESEND_SECONDS } from '../constants';
import { isValidPhone, normalisePhone } from '../lib/phone';
import type { AuthAction } from './use-auth-action';
import type { AuthErrors } from './use-auth-errors';
import { useResendCountdown } from './use-resend-countdown';

/** Phone number, OTP, and the two calls that move them along. */
export function useOtpFlow(
  errs: AuthErrors,
  { run }: AuthAction,
  /** Called once the SMS is on its way. */
  onSent: () => void,
  /** Called once Firebase accepts the code. */
  onVerified: () => void,
) {
  const { t } = useLanguage();
  const { setError, resetError } = errs;
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const confirmation = useRef<OtpConfirmation | null>(null);
  // Owned here, not by the step: the boxes focus it from outside the input.
  const otpRef = useRef<TextInput>(null);
  const { resendIn, start: startCountdown } = useResendCountdown();
  const phoneValid = isValidPhone(phone);

  const acceptPhone = useCallback(
    (raw: string) => {
      setPhone(normalisePhone(raw));
      resetError();
    },
    [resetError],
  );

  /** Also the Resend handler. */
  const sendOtp = useCallback(async () => {
    if (!phoneValid) return setError(t('err_phone'));
    await run(async () => {
      confirmation.current = await requestOtp(phone);
      setOtp('');
      startCountdown(RESEND_SECONDS);
      onSent();
    });
  }, [phone, phoneValid, run, setError, t, startCountdown, onSent]);

  const verifyOtp = useCallback(async () => {
    if (!confirmation.current) return setError(t('err_otp_expired'));
    const pending = confirmation.current;
    await run(async () => {
      await confirmOtp(pending, otp);
      // The auth provider takes over: it syncs the backend profile and
      // either signs us in or flips `needsProfile`. Nothing more to do.
      onVerified();
    });
  }, [otp, run, setError, t, onVerified]);

  const changeOtp = useCallback(
    (v: string) => {
      setOtp(v);
      resetError();
    },
    [resetError],
  );

  return {
    phone,
    setPhone,
    phoneValid,
    acceptPhone,
    otp,
    changeOtp,
    otpRef,
    resendIn,
    sendOtp,
    verifyOtp,
  };
}
