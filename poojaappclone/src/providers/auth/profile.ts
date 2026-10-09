import type { Profile } from '@/lib/api';
import type { FirebaseUser } from '@/lib/firebase-auth';

import type { AuthMethod, User } from './types';

export function toUser(p: Profile): User {
  return {
    name: p.name,
    method: (p.method === 'google' ? 'google' : 'phone') as AuthMethod,
    contact: p.contact,
    bio: p.bio,
    uid: p.uid,
    email: p.email,
    emailVerified: p.emailVerified,
    gender: p.gender,
    dob: p.dob,
    photoUrl: p.photoUrl,
    role: p.role === 'astrologer' ? 'astrologer' : 'devotee',
    astrologer: p.astrologer ?? null,
  };
}

/**
 * What we can show without the backend.
 *
 * The app has always worked with the API down (flags and content both fall
 * back), and sign-in should not be the one thing that breaks on a bad train
 * connection. Firebase already verified this person offline — the only thing
 * the backend adds is the stored name/bio, so a cached copy is enough.
 */
export function fromFirebase(fu: FirebaseUser): User {
  return {
    name: fu.displayName?.trim() || '',
    method: fu.phoneNumber ? 'phone' : 'google',
    contact: fu.phoneNumber || fu.email || fu.uid,
    uid: fu.uid,
    email: fu.email,
    photoUrl: fu.photoURL,
  };
}

/**
 * Whether we know enough to let someone in.
 *
 * Name, gender and date of birth are asked of everyone. An email is asked
 * only of phone sign-ins, because Google already supplied a verified one —
 * demanding it again would be asking for something we have.
 */
export function profileComplete(u: User): boolean {
  // An operator vetted this person; Create Profile is never shown to them.
  if (u.role === 'astrologer') return true;
  if (!u.name.trim() || !u.gender || !u.dob) return false;
  if (u.method === 'phone' && !u.email) return false;
  return true;
}
