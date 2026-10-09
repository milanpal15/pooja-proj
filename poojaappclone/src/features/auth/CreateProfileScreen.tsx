import { AuthScroll } from './components/AuthScroll';
import { AuthShell } from './components/AuthShell';
import { ProfileForm } from './components/ProfileForm';
import { useAuthAction } from './hooks/use-auth-action';
import { useAuthErrors } from './hooks/use-auth-errors';
import { useProfileForm } from './hooks/use-profile-form';
import type { SignedInBy } from './types';

/**
 * Create Profile: Firebase already accepted the credential but the account
 * has no name. We open straight here; making the devotee redo the SMS would
 * cost another verification for nothing.
 */
export function CreateProfileScreen({ signedInBy }: { signedInBy: SignedInBy | null }) {
  const errs = useAuthErrors();
  const action = useAuthAction(errs);
  const form = useProfileForm(errs, action, signedInBy);

  return (
    <AuthShell>
      <AuthScroll>
        <ProfileForm
          {...form}
          onSubmit={form.complete}
          errorField={errs.errorField}
          error={errs.shownError}
          busy={action.busy}
        />
      </AuthScroll>
    </AuthShell>
  );
}
