import crypto from 'crypto';

import { config } from '../config/env.js';

/**
 * Personal data is masked at the serializer, not in the browser — DESIGN.md §21.4.
 *
 * An operator without `devotees:view` never receives a devotee's name, phone,
 * e-mail or contact. A devotee appears as a stable pseudonym (`Devotee ••4821`)
 * so a viewer can still follow one story across the call log, wallet and
 * bookings. Admin is never masked.
 *
 * Fail closed: a request with no `req.can` (nothing set it) is treated as
 * NOT allowed to see personal data.
 */

/** Key for the pseudonym HMAC, derived from — but not equal to — the session secret. */
const KEY = crypto.createHmac('sha256', config.sessionSecret).update('devotee-pseudonym/v1').digest();

/** Stable per uid: 4 digits of a keyed hash, so they cannot be brute-forced back to a uid. */
export function pseudonym(uid) {
  const n = crypto.createHmac('sha256', KEY).update(String(uid ?? '')).digest().readUInt32BE(0) % 10000;
  return `Devotee ••${String(n).padStart(4, '0')}`;
}

export const seesDevotees = (req) => !!req?.can?.('devotees:view');
export const seesAstrologerLogins = (req) => !!req?.can?.('astrologers:edit');

/** `r•••@gmail.com` */
export function maskEmail(email) {
  const s = String(email ?? '');
  const at = s.indexOf('@');
  if (!s) return '';
  if (at < 1) return '•••';
  return `${s[0]}•••${s.slice(at)}`;
}

/** `+91••••••1234` — keeps the country code and the last four digits. */
export function maskPhone(phone) {
  const s = String(phone ?? '');
  if (!s) return '';
  const digits = s.replace(/\D/g, '');
  const tail = digits.slice(-4);
  const cc = s.startsWith('+') ? `+${digits.slice(0, 2)}` : '';
  return `${cc}••••••${tail}`;
}

/**
 * Rows that carry `uid` + `who` (wallet transactions, orders, bookings).
 *
 * A ledger row's `note` is free text typed by an operator when they adjust or
 * refund — "refund for Priya, call dropped" — so it can name a devotee even when
 * `who` is masked. For roles that may not see devotees it is replaced by a fixed
 * label; the reason stays visible to admins.
 */
export function redactWho(rows, req) {
  if (seesDevotees(req)) return rows;
  return rows.map((r) => ({
    ...r,
    who: pseudonym(r.uid),
    ...(r.note && (r.createdBy || r.type === 'adjustment') ? { note: 'Adjustment (reason visible to admins)' } : {}),
  }));
}

/** Booking rows also carry the names and gotras typed into the booking, and the prasad address. */
export function redactBookings(rows, req) {
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

/** Call-log row (`toRow`) paired with its source document, which knows the uid. */
export function redactCallRow(row, call, req) {
  if (seesDevotees(req)) return row;
  return { ...row, devoteeName: pseudonym(call.devoteeUid) };
}

/** Astrologer sign-in identifiers: only `astrologers:edit` sees them in full. */
export function redactAstrologerRows(rows, req) {
  if (seesAstrologerLogins(req)) return rows;
  return rows.map((a) => ({ ...a, signInEmail: maskEmail(a.signInEmail), signInPhone: maskPhone(a.signInPhone) }));
}

/** Device push tokens let whoever holds them notify that device; keep them with the people who can edit. */
export function redactVisitors(rows, req) {
  if (req?.can?.('overview:edit')) return rows;
  return rows.map(({ pushToken: _pushToken, ...rest }) => rest);
}
