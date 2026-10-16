import crypto from 'node:crypto';

/**
 * Devotee pseudonyms for the operator participants list (DESIGN.md section 21.4): `Devotee ••4821`, stable for a uid so one person can
 * be followed across screens without being named. COPIED from services/orders/src/lib/redact.js (same algorithm, same secret
 * `ADMIN_SESSION_SECRET`): the same devotee has the same pseudonym in every service.
 */
export function createRedactor(sessionSecret) {
  const KEY = crypto.createHmac('sha256', sessionSecret).update('devotee-pseudonym/v1').digest();
  const pseudonym = (uid) => `Devotee ••${String(crypto.createHmac('sha256', KEY).update(String(uid ?? '')).digest().readUInt32BE(0) % 10000).padStart(4, '0')}`;
  return { pseudonym };
}
