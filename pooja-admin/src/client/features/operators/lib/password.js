/**
 * A hint, not a gate: the server's only rule is "at least 8 characters", so
 * this tells the operator how guessable the password is while they type.
 * `level` is 0 (nothing typed) to 4; `ok` mirrors the server's minimum.
 */
export const MIN_PASSWORD = 8;

export function passwordStrength(pw = '') {
  if (!pw) return { level: 0, label: '', ok: false };
  if (pw.length < MIN_PASSWORD) return { level: 1, label: `Too short: ${MIN_PASSWORD - pw.length} more character${MIN_PASSWORD - pw.length === 1 ? '' : 's'} needed`, ok: false };
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(pw)).length;
  const score = kinds + (pw.length >= 12 ? 1 : 0) + (pw.length >= 16 ? 1 : 0) - 1;
  if (score <= 1) return { level: 2, label: 'Weak: mix letters, numbers and symbols', ok: true };
  if (score <= 3) return { level: 3, label: 'Fair: longer is stronger', ok: true };
  return { level: 4, label: 'Strong', ok: true };
}
