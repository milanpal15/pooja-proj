import { useCallback, useState } from 'react';

import { useLanguage } from '@/i18n';
import type { AuthError } from '@/lib/firebase-auth';
import { useAuth } from '@/providers/auth';

import type { ProfileField } from '../types';

/**
 * The one error the sign-in flow shows, local or provider-side.
 *
 * `errorField` says which field the message belongs to, or null for a
 * general failure. There used to be one shared string and the Full Name
 * field rendered it, so "Enter a valid email address" appeared under Full
 * Name — the one field that was filled in correctly.
 */
export function useAuthErrors() {
  const { authError, clearAuthError } = useAuth();
  const { t } = useLanguage();
  const [error, setError] = useState('');
  const [errorField, setErrorField] = useState<ProfileField | null>(null);

  const shownError = authError ? t(authError) : error;

  /** Any fresh attempt clears the last failure, local or provider-side. */
  const resetError = useCallback(() => {
    setError('');
    setErrorField(null);
    clearAuthError();
  }, [clearAuthError]);

  /** Fail with a message attached to the field it is actually about. */
  const failField = useCallback((field: ProfileField, message: string) => {
    setError(message);
    setErrorField(field);
  }, []);

  /** Turn an AuthError into a shown message; cancellations stay silent. */
  const show = useCallback(
    (e: unknown) => {
      const err = e as AuthError;
      if (err?.code === 'cancelled') return;
      const key = err?.message || 'err_signin_failed';
      if (err?.detail) console.warn('[auth]', err.code, err.detail);
      setError(t(key));
      // Belongs to no field — and clearing this matters, or a sign-in
      // failure after a validation failure renders under whichever field
      // the last one pointed at.
      setErrorField(null);
    },
    [t],
  );

  // `setError` is exposed raw on purpose: a plain message leaves `errorField`
  // as it was, exactly as the single-file screen did.
  return { shownError, errorField, setError, resetError, failField, show };
}

export type AuthErrors = ReturnType<typeof useAuthErrors>;
