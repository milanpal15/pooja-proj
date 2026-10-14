import { firebaseError, firebaseProjectId, firebaseReady, verifyIdToken } from '../modules/auth/firebase.js';
import { User } from '../models.js';
import { identityEnabled } from '../lib/identity-client.js';
import { DEVOTEE_ISSUER, hasBearer, trustedClaims } from '../lib/trusted-claims.js';

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
  if (identityEnabled()) return requireTrustedDevotee(req, res, next);
  // No credentials is 401 whatever the server's configuration: a stranger is a stranger even on a
  // box with no Firebase key (CI boots exactly that way, and the smoke test relies on this).
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return res.status(401).json({ error: 'missing bearer token' });

  // A token was presented but this server cannot verify it: say so rather than trust it.
  if (!firebaseReady()) {
    return res.status(503).json({
      error: 'auth unavailable',
      detail: `Firebase Admin is not configured on the server (${firebaseError()}).`,
    });
  }

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

/**
 * IDENTITY_URL set: the mobile BFF already verified the Firebase token, checked `blocked` against identity (failing
 * closed) and signed the answer into a service token. This reproduces requireAuth's responses from that token, so
 * the app sees the same 401 / 403 / 503 it always did:
 *   no bearer                -> 401 missing bearer token
 *   not a mobile-bff token   -> 401 invalid token   (a raw Firebase token sent straight here is NOT accepted)
 *   ctx.authError=invalid    -> 401 invalid token
 *   ctx.authError=blocked    -> 403 account blocked
 *   ctx.authError=unavailable-> 503 auth unavailable
 */
function requireTrustedDevotee(req, res, next) {
  if (!hasBearer(req)) return res.status(401).json({ error: 'missing bearer token' });
  const claims = trustedClaims(req, DEVOTEE_ISSUER);
  if (!claims) return res.status(401).json({ error: 'invalid token' });
  const err = claims.ctx?.authError;
  if (err === 'blocked') return res.status(403).json({ error: 'account blocked' });
  if (err === 'unavailable') return res.status(503).json({ error: 'auth unavailable', detail: claims.ctx?.detail || 'identity is unavailable' });
  if (err || !claims.sub) return res.status(401).json({ error: 'invalid token', ...(claims.ctx?.detail ? { detail: claims.ctx.detail } : {}) });
  const role = claims.ctx?.role === 'astrologer' ? 'astrologer' : 'devotee';
  req.token = { uid: claims.sub, ...(claims.ctx?.tok || {}) };
  req.user = { uid: claims.sub, name: claims.ctx?.name ?? '', role, blocked: false };
  req.role = role;
  next();
}
