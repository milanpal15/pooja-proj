import { Button, Field, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import type { Gender } from '@/lib/api';

import type { DobParts, ProfileField } from '../types';
import { AuthStack } from './AuthStack';
import { AvatarPicker } from './AvatarPicker';
import { DobField } from './DobField';
import { GenderChips } from './GenderChips';

type Props = {
  name: string;
  onName: (v: string) => void;
  gender: Gender | null;
  onGender: (g: Gender) => void;
  dobParts: DobParts;
  onDob: (p: DobParts) => void;
  /** The joined YYYY-MM-DD, or '' while incomplete. */
  dob: string;
  /** Phone sign-in gives us no email; Google already did. */
  needsEmail: boolean;
  email: string;
  onEmail: (v: string) => void;
  errorField: ProfileField | null;
  error: string;
  busy: boolean;
  onSubmit: () => void;
};

export function ProfileForm(p: Props) {
  const { t } = useLanguage();
  const at = (f: ProfileField) => (p.errorField === f ? p.error : undefined);
  return (
    // No back: Create Profile is only ever reached because the provider says
    // the account is half-finished, so there is nowhere to go back to.
    <AuthStack title={t('create_profile')}>
      <AvatarPicker label={t('change_photo')} initial={p.name.trim()[0]} />
      <Field
        label={t('full_name')}
        value={p.name}
        onChangeText={p.onName}
        placeholder={t('ph_full_name')}
        error={at('name')}
      />
      <GenderChips value={p.gender} onChange={p.onGender} error={at('gender')} />

      <DobField label={t('dob_label')} parts={p.dobParts} onChange={p.onDob} />
      {p.errorField === 'dob' && (
        <Type v="labelMd" tone="error">
          {p.error}
        </Type>
      )}

      {p.needsEmail && (
        <Field
          label={t('email_label')}
          value={p.email}
          onChangeText={p.onEmail}
          placeholder={t('ph_email')}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          error={at('email')}
        />
      )}
      {p.needsEmail && (
        <Type v="bodySm" tone="onSurfaceFaint">
          {t('email_why')}
        </Type>
      )}

      {/* A failure that belongs to no single field — the save
          itself, or a dropped session — still has to be said. */}
      {!!p.error && !p.errorField && (
        <Type v="labelMd" tone="error" center>
          {p.error}
        </Type>
      )}
      <Button
        label={t('complete_profile')}
        size="lg"
        block
        loading={p.busy}
        disabled={!p.name.trim() || !p.gender || p.dob.length !== 10 || p.busy}
        onPress={p.onSubmit}
      />
    </AuthStack>
  );
}
