import crypto from 'node:crypto';

/**
 * Devotee personal data is masked at the serializer (DESIGN.md section 21.4): an operator without `devotees:view` never receives a name or
 * contact; a devotee appears as a stable pseudonym (`Devotee ••4821`).
 *
 * The pseudonym algorithm is COPIED from the wallet / orders / calls / events services (services/wallet/src/lib/redact.js) and MUST stay identical:
 * the same devotee has the same label in the wallet, the call log and here. identity.users.test.mjs checks it against the wallet's copy.
 */
export function createRedactor(sessionSecret) {
  const KEY = crypto.createHmac('sha256', sessionSecret).update('devotee-pseudonym/v1').digest();

  function pseudonym(uid) {
    const n = crypto.createHmac('sha256', KEY).update(String(uid ?? '')).digest().readUInt32BE(0) % 10000;
    return `Devotee ••${String(n).padStart(4, '0')}`;
  }

  /** The profile fields that identify a person, replaced by the pseudonym / blanks. Everything else (role, block, tags, dates, counts) is left. */
  function maskUser(u) {
    const label = pseudonym(u.uid);
    return {
      ...u,
      name: label,
      contact: label,
      ...('phone' in u ? { phone: null } : {}),
      ...('email' in u ? { email: null } : {}),
      ...('photoUrl' in u ? { photoUrl: null } : {}),
      ...('bio' in u ? { bio: '' } : {}),
      ...('dob' in u ? { dob: null } : {}),
      ...('gender' in u ? { gender: null } : {}),
    };
  }
  return { pseudonym, maskUser };
}
