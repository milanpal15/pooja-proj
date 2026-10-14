import crypto from 'node:crypto';

/**
 * Devotee personal data is masked at the serializer (DESIGN.md section 21.4): an operator without `devotees:view` never receives a
 * name, a typed name/gotra or a delivery address; a devotee appears as a stable pseudonym (`Devotee ••4821`) so a viewer can still follow
 * one story across the call log, wallet and bookings. Admin is never masked. Fail closed: a request with no `req.can` is NOT allowed
 * to see personal data.
 *
 * COPIED from pooja-api/src/access/redact.js (`pseudonym`, `redactWho`, `redactBookings`) with the secret passed in instead of read from
 * the environment. The algorithm MUST stay identical; redact.test.mjs checks it against the monolith's file when it is checked out next to this one.
 */
export function createRedactor(sessionSecret) {
  const KEY = crypto.createHmac('sha256', sessionSecret).update('devotee-pseudonym/v1').digest();

  function pseudonym(uid) {
    const n = crypto.createHmac('sha256', KEY).update(String(uid ?? '')).digest().readUInt32BE(0) % 10000;
    return `Devotee ••${String(n).padStart(4, '0')}`;
  }

  const seesDevotees = (req) => !!req?.can?.('devotees:view');

  function redactWho(rows, req) {
    if (seesDevotees(req)) return rows;
    return rows.map((r) => ({
      ...r,
      who: pseudonym(r.uid),
      ...(r.note && (r.createdBy || r.type === 'adjustment') ? { note: 'Adjustment (reason visible to admins)' } : {}),
    }));
  }

  /** Booking rows also carry the names and gotras typed into the booking, and the prasad address. */
  function redactBookings(rows, req) {
    if (seesDevotees(req)) return rows;
    return rows.map((r) => ({
      ...r,
      who: pseudonym(r.uid),
      devoteeName: pseudonym(r.uid),
      gotra: '',
      ...(Array.isArray(r.names) ? { names: r.names.map(() => ({ name: pseudonym(r.uid), gotra: '' })) } : {}),
      ...('address' in r ? { address: null } : {}),
    }));
  }

  return { pseudonym, seesDevotees, redactWho, redactBookings };
}
