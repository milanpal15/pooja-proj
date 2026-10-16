import { isBlocked } from './blocks.js';

/**
 * Turn a verified Firebase token into the handle the dashboard shows. (Moved from pooja-api/modules/auth/profile.js.)
 *
 * Phone sign-ins carry `phone_number` (E.164) and Google sign-ins carry `email`; `uid` is the fallback so a row can
 * never fail to save.
 */
export const handleFor = (decoded) => decoded.phone_number || decoded.email || decoded.uid;

export function methodFor(decoded) {
  if (decoded.phone_number) return 'phone';
  if (decoded.firebase?.sign_in_provider === 'google.com') return 'google';
  return decoded.firebase?.sign_in_provider || 'unknown';
}

/**
 * Which email the account carries. A token email (Google) is verified by the provider and always wins. A typed one is
 * a claim, accepted only where the provider gave none - phone sign-in - and flagged unverified.
 */
export function emailUpdate(existing, decoded, typed) {
  if (decoded.email) return { email: decoded.email, emailVerified: true };
  if (typed && !existing?.emailVerified) return { email: typed, emailVerified: false };
  return {};
}

/** Shape handed back to the app - deliberately not the raw Mongo document. `astrologer` = the active row or null. */
export function toProfile(doc, astrologer = null) {
  return {
    id: doc._id,
    uid: doc.uid,
    name: doc.name || '',
    contact: doc.contact,
    method: doc.method,
    email: doc.email || null,
    emailVerified: !!doc.emailVerified,
    phone: doc.phone || null,
    photoUrl: doc.photoUrl || null,
    bio: doc.bio || '',
    gender: doc.gender || null,
    dob: doc.dob || null,
    blocked: isBlocked(doc),
    // When the account was first created: the app uses it for the "new user" Home audience (decided on the device).
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
    role: astrologer ? 'astrologer' : 'devotee',
    astrologer: astrologer ? { id: String(astrologer.id ?? astrologer._id), name: astrologer.name } : null,
  };
}

export const GENDERS = ['female', 'male', 'other', 'prefer_not_to_say'];
export const cleanGender = (g) => (GENDERS.includes(g) ? g : undefined);
/** A calendar date, and a plausible one - not a timestamp, not the future. */
export const cleanDob = (d) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= new Date().toISOString().slice(0, 10) ? d : undefined);
export const cleanEmail = (e) => (typeof e === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.trim()) ? e.trim().toLowerCase() : undefined);
