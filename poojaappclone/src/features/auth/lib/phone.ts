/**
 * Normalise whatever arrived — typed, pasted, or autofilled — down to the
 * ten digits the field accepts. Autofill hands over `+91 98765 43210`.
 */
export function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const local = digits.startsWith('91') && digits.length > 10 ? digits.slice(2) : digits;
  return local.slice(0, 10);
}

export const isValidPhone = (phone: string): boolean => phone.replace(/\D/g, '').length === 10;
