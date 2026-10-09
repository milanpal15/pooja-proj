/**
 * The sign-in handle an astrologer is matched on: ONE of email or mobile.
 * -> { kind: 'email'|'phone', value } or { error }.
 *
 * Email is lower-cased (the API matches case-insensitively on the verified
 * address). A mobile must end up E.164: "+919876543210". A bare 10-digit
 * Indian number is accepted and prefixed with +91, because that is how an
 * operator will type it.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function parseSignIn(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return { error: 'Enter the email or mobile number the astrologer will sign in with.' };
  if (raw.includes('@')) {
    return EMAIL.test(raw) ? { kind: 'email', value: raw.toLowerCase() } : { error: 'That does not look like an email address.' };
  }
  const digits = raw.replace(/[\s\-().]/g, '');
  if (/^\+\d{8,15}$/.test(digits)) return { kind: 'phone', value: digits };
  if (/^[6-9]\d{9}$/.test(digits)) return { kind: 'phone', value: `+91${digits}` };
  return { error: 'Use a mobile number with country code, like +919876543210, or an email address.' };
}
