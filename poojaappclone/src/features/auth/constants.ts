import type { Gender } from '@/lib/api';
import type { StringKey } from '@/i18n';

export const OTP_LEN = 6; // Firebase SMS codes are six digits.
export const RESEND_SECONDS = 45;

/** The four options, in the order they are shown. */
export const GENDERS: { value: Gender; labelKey: StringKey }[] = [
  { value: 'female', labelKey: 'gender_female' },
  { value: 'male', labelKey: 'gender_male' },
  { value: 'other', labelKey: 'gender_other' },
  { value: 'prefer_not_to_say', labelKey: 'gender_private' },
];
