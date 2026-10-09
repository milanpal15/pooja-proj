import { firebaseError, firebaseProjectId, firebaseReady, verifyIdToken } from '../modules/auth/firebase.js';
import { User } from '../models.js';

/**
 * Read `aud` out of an UNVERIFIED token. Only ever used to make a mismatch
 * error legible in the server log — never to make a trust decision.
 */
function decodeAudience(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).aud ?? null;
  } catch {
    return null;
  }
}

/**
 * Require a valid Firebase ID token.
 *
 * Attaches `req.token` (the decoded claims) and `req.user` (the Mongo row, if
 * one exists yet). A blocked user is rejected here rather than in each route,
 * so blocking from the dashboard takes effect everywhere at once.
 */
export async function requireAuth(req, res, next) {
  if (!firebaseReady()) {
    return res.status(503).json({
      error: 'auth unavailable',
      detail: `Firebase Admin is not configured on the server (${firebaseError()}).`,
    });
  }

  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return res.status(401).json({ error: 'missing bearer token' });

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (e) {
    // The client is told nothing useful on purpose. The server operator,
    // however, gets the one diagnosis that is otherwise near-impossible to
    // read off an "incorrect aud claim" message: the app and the backend are
    // pointed at two different Firebase projects. It is a setup mistake that
    // looks exactly like a broken token.
    if (/audience|aud.*claim/i.test(e.message || '')) {
      const appProject = decodeAudience(token);
      console.error(
        '✗ PROJECT MISMATCH — this token is not for the project this server holds a key for.\n' +
          `    app  mints tokens for: ${appProject ?? '(unreadable)'}  (poojaappclone/google-services.json)\n` +
          `    server verifies for  : ${firebaseProjectId()}  (FIREBASE_SERVICE_ACCOUNT_PATH)\n` +
          '    Both must be the same Firebase project. See docs/FIREBASE_SETUP.md.',
      );
    }
    return res.status(401).json({ error: 'invalid token', detail: e.message });
  }

  const user = await User.findOne({ uid: decoded.uid });
  if (user?.blocked) return res.status(403).json({ error: 'account blocked' });

  req.token = decoded;
  req.user = user;
  // Read fresh from the database on every call (never from the client). The
  // astrologer endpoints additionally re-check the Astrologer row itself.
  req.role = user?.role ?? 'devotee';
  next();
}
