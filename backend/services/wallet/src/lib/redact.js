import crypto from 'node:crypto';

/**
 * Devotee personal data is masked at the serializer (DESIGN.md section 21.4): an operator without `devotees:view` never receives a
 * name or contact; a devotee appears as a stable pseudonym (`Devotee ••4821`) so a viewer can still follow one story across the
 * call log, wallet and bookings. Admin is never masked. Fail closed: a request with no `req.can` is NOT allowed to see personal data.
 *
 * COPIED from pooja-api/src/access/redact.js (`pseudonym`, `redactWho`) with the secret passed in instead of read from the
 * environment. The pseudonym algorithm MUST stay identical (the same devotee has the same label in the call log and the wallet);
 * redact.test.mjs checks it against the monolith's file when the checkout is next to this one.
 */
export function createRedactor(sessionSecret) {
  const KEY = crypto.createHmac('sha256', sessionSecret).update('devotee-pseudonym/v1').digest();

  /** Stable per uid: 4 digits of a keyed hash, so they cannot be brute-forced back to a uid. */
  function pseudonym(uid) {
    const n = crypto.createHmac('sha256', KEY).update(String(uid ?? '')).digest().readUInt32BE(0) % 10000;
    return `Devotee ••${String(n).padStart(4, '0')}`;
  }

  const seesDevotees = (req) => !!req?.can?.('devotees:view');

  /**
   * Rows that carry `uid` + `who` (wallet transactions, orders). A ledger row's `note` is free text typed by an operator when they
   * adjust or refund, so it can name a devotee even when `who` is masked: for roles that may not see devotees it is replaced by a
   * fixed label; the reason stays visible to admins.
   */
  function redactWho(rows, req) {
    if (seesDevotees(req)) return rows;
    return rows.map((r) => ({
      ...r,
      who: pseudonym(r.uid),
      ...(r.note && (r.createdBy || r.type === 'adjustment') ? { note: 'Adjustment (reason visible to admins)' } : {}),
    }));
  }

  return { pseudonym, seesDevotees, redactWho };
}
