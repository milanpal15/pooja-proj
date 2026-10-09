import { Astrologer } from '../astrologers/astrologer.model.js';

/**
 * Turn a verified Firebase token into the handle the dashboard shows.
 *
 * Phone sign-ins carry `phone_number` (E.164, e.g. +919876543210) and Google
 * sign-ins carry `email`. One of the two is always present for the providers
 * this app enables; `uid` is the fallback so a row can never fail to save.
 */
export function handleFor(decoded) {
  return decoded.phone_number || decoded.email || decoded.uid;
}

export function methodFor(decoded) {
  if (decoded.phone_number) return 'phone';
  if (decoded.firebase?.sign_in_provider === 'google.com') return 'google';
  return decoded.firebase?.sign_in_provider || 'unknown';
}

/**
 * Decide which email the account carries.
 *
 * A token email (Google) is verified by the provider and always wins. A
 * typed one is a claim, accepted only where the provider gave none — phone
 * sign-in — and flagged as unverified so nothing downstream mistakes it
 * for proof of address.
 */
export function emailUpdate(existing, decoded, typed) {
  // A provider-supplied address always wins and is the only verified one.
  if (decoded.email) return { email: decoded.email, emailVerified: true };
  // A self-declared one must never overwrite a verified address.
  if (typed && !existing?.emailVerified) return { email: typed, emailVerified: false };
  return {};
}

/** Shape handed back to the app — deliberately not the raw Mongo document. */
export async function activeAstrologer(doc) {
  return doc.uid ? Astrologer.findOne({ uid: doc.uid, status: 'active' }).select('name').lean() : null;
}

/**
 * `astrologer` is the active Astrologer row for this account, or null. The
 * role follows it, so a suspended astrologer reads as a plain devotee.
 */
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
    blocked: !!doc.blocked,
    role: astrologer ? 'astrologer' : 'devotee',
    astrologer: astrologer ? { id: String(astrologer._id), name: astrologer.name } : null,
  };
}
