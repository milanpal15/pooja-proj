import type { Gender } from '@/lib/api';
import type { StringKey } from '@/i18n';

import type { ProfileField } from '../types';
import { isRealDate } from './dob';

export type ProfileFailure = { field: ProfileField; key: StringKey };

/**
 * The first thing wrong with Create Profile, or null. Order matters — it is
 * the order the form reads top to bottom: name, gender, date of birth (shape,
 * then existence, then not in the future), email.
 *
 * `today` is `YYYY-MM-DD`, passed in so this stays pure.
 */
export function validateProfile(
  f: { name: string; gender: Gender | null; dob: string; email: string; needsEmail: boolean },
  today: string,
): ProfileFailure | null {
  if (!f.name.trim()) return { field: 'name', key: 'err_name' };
  if (!f.gender) return { field: 'gender', key: 'err_gender' };
  // Shape AND existence: `2025-02-31` matches the pattern happily.
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(f.dob) ||
    !isRealDate(f.dob.slice(0, 4), f.dob.slice(5, 7), f.dob.slice(8, 10))
  ) {
    return { field: 'dob', key: 'err_dob' };
  }
  if (f.dob > today) return { field: 'dob', key: 'err_dob_future' };
  if (f.needsEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) {
    return { field: 'email', key: 'err_email' };
  }
  return null;
}
