import { HttpError } from './http-error.js';
import * as identity from './identity-client.js';
import { User } from '../models.js';

/**
 * Every question the rest of the monolith asks about a DEVOTEE (name, device id, role, search), in one place.
 *
 * IDENTITY_URL unset: answered from the local `users` collection, with the exact queries the call sites used to run.
 * IDENTITY_URL set: answered by the identity service through `identity-client.js` - non-critical reads degrade to
 * "absent", the wallet search fails with a clear 503. Call sites never import the User model again.
 */

/** The profile name. `hint` is the name the verified token already carried (preferred: no call at all). */
export async function userName(uid, hint) {
  if (identity.identityEnabled()) {
    if (typeof hint === 'string') return hint;
    return (await identity.getUser(uid))?.name || '';
  }
  return (await User.findOne({ uid }).select('name').lean())?.name || '';
}

/** The device id the app registered for push (links a devotee to a push token), or undefined. */
export async function deviceIdOf(uid) {
  if (identity.identityEnabled()) return (await identity.getUser(uid))?.deviceId || undefined;
  return (await User.findOne({ uid }).select('deviceId').lean())?.deviceId;
}

/** Map uid -> `name || contact` for the admin `who` column. A uid with no row is absent (the caller falls back to the uid). */
export async function whoByUid(uids) {
  const list = [...new Set(uids)];
  if (identity.identityEnabled()) {
    const found = await identity.lookupUsers(list);
    return new Map([...found].map(([uid, u]) => [uid, u.name || u.contact]));
  }
  const rows = await User.find({ uid: { $in: list } }).select('uid name contact').lean();
  return new Map(rows.map((u) => [u.uid, u.name || u.contact]));
}

/** Devotees matching a free-text query (wallet lookup). Rows carry uid, name, contact. `as` = the operator's claims. */
export async function searchDevotees(q, as) {
  if (identity.identityEnabled()) {
    try {
      return await identity.searchUsers(q, as);
    } catch (e) {
      throw new HttpError(503, 'identity_unavailable', e.message);
    }
  }
  const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return User.find({ $or: [{ name: rx }, { contact: rx }, { email: rx }, { phone: rx }] }).limit(20).lean();
}

/** Keep the user's convenience role in step with the astrologer lifecycle. */
export async function setUserRole(uid, role) {
  if (!uid) return;
  if (identity.identityEnabled()) return identity.setRole(uid, role);
  await User.updateOne({ uid }, { $set: { role } });
}
