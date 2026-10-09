export type NameEntry = { name: string; gotra: string };
export type NameError = 'name_short' | 'name_long' | 'gotra_long';
export type AddressError = 'line1' | 'city' | 'pincode';
export type Address = { line1: string; city: string; pincode: string };

/** The server's own limits (POOJA_AND_HOME.md §3.1) — checked here only to save a round trip. */
export const NAME_MIN = 2;
export const NAME_MAX = 60;
export const GOTRA_MAX = 40;

export const emptyNames = (persons: number): NameEntry[] =>
  Array.from({ length: persons }, () => ({ name: '', gotra: '' }));

/**
 * Resize the form when the package (and so the number of persons) changes,
 * keeping what was typed. The first name is prefilled from the profile.
 */
export function resizeNames(prev: NameEntry[], persons: number, firstName = ''): NameEntry[] {
  const next = emptyNames(persons);
  for (let i = 0; i < persons; i++) if (prev[i]) next[i] = prev[i];
  if (next[0] && !next[0].name && firstName) next[0] = { ...next[0], name: firstName };
  return next;
}

/** One error (or undefined) per person, in order. */
export function validateNames(names: NameEntry[], persons: number): (NameError | undefined)[] {
  if (names.length !== persons) return Array.from({ length: persons }, () => 'name_short' as const);
  return names.map((n) => {
    const len = n.name.trim().length;
    if (len < NAME_MIN) return 'name_short';
    if (len > NAME_MAX) return 'name_long';
    if (n.gotra.trim().length > GOTRA_MAX) return 'gotra_long';
    return undefined;
  });
}

export function validateAddress(a: Address): Partial<Record<AddressError, true>> {
  const e: Partial<Record<AddressError, true>> = {};
  if (a.line1.trim().length < 3) e.line1 = true;
  if (a.city.trim().length < 2) e.city = true;
  if (!/^\d{6}$/.test(a.pincode.trim())) e.pincode = true;
  return e;
}

/** True when the form can be submitted. */
export function isFormValid(
  names: NameEntry[],
  persons: number,
  prasad: boolean,
  address: Address,
): boolean {
  if (validateNames(names, persons).some(Boolean)) return false;
  return !prasad || Object.keys(validateAddress(address)).length === 0;
}
