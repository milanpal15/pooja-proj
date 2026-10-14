import crypto from 'node:crypto';

/**
 * Personal data is masked at the serializer (DESIGN.md section 21.4): an operator without `devotees:view` never receives a devotee's name; a
 * devotee appears as a stable pseudonym (`Devotee ••4821`) so a viewer can still follow one story across the call log, wallet and bookings.
 * An astrologer's sign-in identifiers (e-mail / mobile) are shown in full only to `astrologers:edit`. Admin is never masked. Fail closed: a request
 * with no `req.can` is NOT allowed to see personal data.
 *
 * COPIED from pooja-api/src/access/redact.js (`pseudonym`, `maskEmail`, `maskPhone`, `redactCallRow`, `redactAstrologerRows`) with the secret passed
 * in instead of read from the environment. The algorithm MUST stay identical; parity.test.mjs checks it against the monolith's file when it is
 * checked out next to this one.
 */
export function createRedactor(sessionSecret) {
  const KEY = crypto.createHmac('sha256', sessionSecret).update('devotee-pseudonym/v1').digest();

  function pseudonym(uid) {
    const n = crypto.createHmac('sha256', KEY).update(String(uid ?? '')).digest().readUInt32BE(0) % 10000;
    return `Devotee ••${String(n).padStart(4, '0')}`;
  }

  const seesDevotees = (req) => !!req?.can?.('devotees:view');
  const seesAstrologerLogins = (req) => !!req?.can?.('astrologers:edit');

  /** `r•••@gmail.com` */
  function maskEmail(email) {
    const s = String(email ?? '');
    const at = s.indexOf('@');
    if (!s) return '';
    if (at < 1) return '•••';
    return `${s[0]}•••${s.slice(at)}`;
  }

  /** `+91••••••1234` - keeps the country code and the last four digits. */
  function maskPhone(phone) {
    const s = String(phone ?? '');
    if (!s) return '';
    const digits = s.replace(/\D/g, '');
    const tail = digits.slice(-4);
    const cc = s.startsWith('+') ? `+${digits.slice(0, 2)}` : '';
    return `${cc}••••••${tail}`;
  }

  /** Call-log row (`toRow`) paired with its source document, which knows the uid. */
  function redactCallRow(row, call, req) {
    if (seesDevotees(req)) return row;
    return { ...row, devoteeName: pseudonym(call.devoteeUid) };
  }

  /** Astrologer sign-in identifiers: only `astrologers:edit` sees them in full. */
  function redactAstrologerRows(rows, req) {
    if (seesAstrologerLogins(req)) return rows;
    return rows.map((a) => ({ ...a, signInEmail: maskEmail(a.signInEmail), signInPhone: maskPhone(a.signInPhone) }));
  }

  return { pseudonym, seesDevotees, seesAstrologerLogins, maskEmail, maskPhone, redactCallRow, redactAstrologerRows };
}
