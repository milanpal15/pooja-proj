import { Astrologer } from './astrologer.model.js';

/**
 * Sign-in claim (DESIGN.md section 19.6a), asked by the identity service from `POST /auth/sync` (`POST /internal/calls/directory/astrologers/claim`).
 * It used to be the monolith's `claimAstrologer`, which also rewrote the `User`; here only the Astrologer half remains, because the user is
 * identity's and identity applies the role and name to it.
 *
 * Matches an `invited|active` astrologer by the identifier Firebase VERIFIED - the token's phone number, or its e-mail only when the provider vouches
 * for it (Google, or `email_verified`). An e-mail a phone user merely typed on their profile is never in the token, so it can never claim an invite.
 * Atomic: two devices signing in together cannot both claim one invite.
 *
 * Returns the astrologer row if the account is currently an ACTIVE one, else null. A suspended astrologer is a plain devotee again.
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
