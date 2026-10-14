import { User } from '../../models.js';
import { Astrologer } from './astrologer.model.js';

/**
 * Sign-in claim (DESIGN.md §19.6a), called from `POST /auth/sync`.
 *
 * Matches an `invited|active` astrologer by the identifier Firebase VERIFIED —
 * the token's phone number, or its e-mail only when the provider vouches for it
 * (Google, or `email_verified`). An e-mail a phone user merely typed on their
 * profile is never in the token, so it can never claim an invite.
 *
 * Returns the (possibly updated) `User` and the astrologer if the account is
 * currently an ACTIVE one. A suspended astrologer is a plain devotee again.
 * `User.role` is brought in line either way, so it can never drift.
 */
export async function claimAstrologer(decoded, user) {
  const active = await claimActiveAstrologer(decoded);
  const role = active ? 'astrologer' : 'devotee';
  const $set = {};
  if ((user.role || 'devotee') !== role) $set.role = role;
  if (active && !user.name?.trim()) $set.name = active.name;

  if (Object.keys($set).length) {
    user = (await User.findOneAndUpdate({ _id: user._id }, { $set }, { new: true })) ?? user;
  }
  return { user, astrologer: active };
}

/**
 * The Astrologer half of the claim, with no User involved: match (and atomically take) the invite for the
 * verified identifiers in `decoded`, and return the astrologer row if the account is currently ACTIVE one.
 * Used directly by the identity service's call (POST /internal/astrologers/claim), which then applies the
 * role/name to ITS users collection.
 */
export async function claimActiveAstrologer(decoded) {
  let mine = await Astrologer.findOne({ uid: decoded.uid });

  if (!mine) {
    const emailVerified =
      !!decoded.email && (decoded.email_verified === true || decoded.firebase?.sign_in_provider === 'google.com');
    const or = [];
    if (emailVerified) or.push({ signInEmail: String(decoded.email).toLowerCase() });
    if (decoded.phone_number) or.push({ signInPhone: decoded.phone_number });
    if (or.length) {
      // Atomic: two devices signing in together cannot both claim one invite.
      mine = await Astrologer.findOneAndUpdate(
        { status: { $in: ['invited', 'active'] }, uid: { $in: [null] }, $or: or },
        { $set: { uid: decoded.uid, status: 'active', lastSignInAt: new Date() } },
        { new: true },
      );
    }
  } else if (mine.status === 'active') {
    await Astrologer.updateOne({ _id: mine._id }, { $set: { lastSignInAt: new Date() } });
  }

  return mine && mine.status === 'active' ? mine : null;
}
