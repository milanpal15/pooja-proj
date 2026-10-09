import { HttpError } from '../../lib/http-error.js';
import { Astrologer } from './astrologer.model.js';

/**
 * Gate for the astrologer-only endpoints. Runs AFTER `requireAuth`.
 *
 * The role is looked up in the database by the verified `uid` on every call —
 * a claim from the client (or a stale `User.role`) never grants anything. Only
 * an `active` astrologer passes; invited and suspended ones get 403.
 */
export async function requireAstrologer(req, _res, next) {
  const a = req.token?.uid ? await Astrologer.findOne({ uid: req.token.uid, status: 'active' }) : null;
  if (!a) return next(new HttpError(403, 'not_an_astrologer', 'This account is not an active astrologer.'));
  req.astrologer = a;
  next();
}
