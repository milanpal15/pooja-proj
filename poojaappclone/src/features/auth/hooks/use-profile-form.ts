import { useCallback, useState } from 'react';

import { useLanguage } from '@/i18n';
import type { Gender } from '@/lib/api';
import { useAuth } from '@/providers/auth';

import { joinDob, splitDob } from '../lib/dob';
import { validateProfile } from '../lib/validate-profile';
import type { DobParts, SignedInBy } from '../types';
import type { AuthAction } from './use-auth-action';
import type { AuthErrors } from './use-auth-errors';

/**
 * Create Profile's fields and its save.
 *
 * Each `…Edit` is an overlay: `null` means "not touched yet", so whatever
 * the backend already knows shows through until the devotee types over it.
 * Derived at render rather than copied in by an effect (or initialised from
 * `pendingProfile` in `useState`): the pending profile arrives after mount,
 * and copying it in would both fight `react-hooks/set-state-in-effect` and
 * clobber anything typed in the meantime.
 */
export function useProfileForm(errs: AuthErrors, { run }: AuthAction, signedInBy: SignedInBy | null) {
  const { pendingProfile, completeProfile } = useAuth();
  const { t } = useLanguage();
  const { resetError, failField } = errs;

  const [nameEdit, setName] = useState<string | null>(null);
  const [genderEdit, setGender] = useState<Gender | null>(null);
  /** YYYY-MM-DD, typed as three parts so no date picker native module is needed. */
  const [dobEdit, setDobParts] = useState<DobParts | null>(null);
  const [emailEdit, setEmail] = useState<string | null>(null);

  const name = nameEdit ?? pendingProfile?.name ?? '';
  const gender = genderEdit ?? pendingProfile?.gender ?? null;
  const dobParts = dobEdit ?? splitDob(pendingProfile?.dob ?? '');
  const dob = joinDob(dobParts);
  const email = emailEdit ?? pendingProfile?.email ?? '';

  /**
   * Phone sign-in carries no email, so we ask for one; Google already
   * supplied a verified address.
   *
   * Read from the pending profile first, because `signedInBy` is local
   * state and does not survive a reload — and a phone devotee who relaunched
   * here got a form with no email field, which is exactly what held them
   * on this screen. Mirrors `profileComplete`.
   */
  const method = pendingProfile?.method ?? signedInBy;
  const needsEmail = method === 'phone' && !pendingProfile?.email;

  const complete = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const bad = validateProfile({ name, gender, dob, email, needsEmail }, today);
    if (bad) return failField(bad.field, t(bad.key));
    await run(() =>
      completeProfile({
        name: name.trim(),
        gender: gender!,
        dob,
        ...(needsEmail ? { email: email.trim() } : {}),
      }),
    );
  }, [name, gender, dob, email, needsEmail, completeProfile, failField, run, t]);

  // Every edit clears the last failure.
  const edited = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    resetError();
  };

  return {
    name,
    gender,
    dobParts,
    dob,
    email,
    needsEmail,
    onName: edited(setName),
    onGender: edited(setGender),
    onDob: edited(setDobParts),
    onEmail: edited(setEmail),
    complete,
  };
}
