import { Router } from 'express';

import { firebaseError, firebaseProjectId, firebaseReady, verifyIdToken } from './firebase.js';
import { User } from './models.js';

export const auth = Router();

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
 * Turn a verified Firebase token into the handle the dashboard shows.
 *
 * Phone sign-ins carry `phone_number` (E.164, e.g. +919876543210) and Google
 * sign-ins carry `email`. One of the two is always present for the providers
 * this app enables; `uid` is the fallback so a row can never fail to save.
 */
function handleFor(decoded) {
  return decoded.phone_number || decoded.email || decoded.uid;
}

function methodFor(decoded) {
  if (decoded.phone_number) return 'phone';
  if (decoded.firebase?.sign_in_provider === 'google.com') return 'google';
  return decoded.firebase?.sign_in_provider || 'unknown';
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
  next();
}

/* ------------------------------------------------------------------ sync -- */

/**
 * Called by the app right after Firebase sign-in, and on every cold start.
 *
 * Creates the account on first sign-in and refreshes `lastActive` after that.
 * Identity (uid, phone, email, method) comes from the token; only `name`,
 * `bio` and `deviceId` are taken from the body, because those are the only
 * things the devotee actually types.
 */
auth.post('/sync', requireAuth, async (req, res) => {
  const decoded = req.token;
  const { name, bio, deviceId } = req.body ?? {};

  const identity = {
    uid: decoded.uid,
    contact: handleFor(decoded),
    method: methodFor(decoded),
    email: decoded.email || undefined,
    phone: decoded.phone_number || undefined,
    photoUrl: decoded.picture || undefined,
    lastActive: new Date(),
  };

  // A row may already exist from before this account had a uid (the pre-Firebase
  // dummy sign-in wrote contact-only rows). Adopt it instead of colliding with
  // its unique `contact` index.
  let doc = req.user ?? (await User.findOne({ contact: identity.contact }));

  if (doc) {
    Object.assign(doc, identity);
    // Never blank out a name the devotee already set by syncing with no body.
    if (name?.trim()) doc.name = name.trim();
    else if (!doc.name) doc.name = decoded.name || '';
    if (bio !== undefined) doc.bio = bio;
    if (deviceId) doc.deviceId = deviceId;
    await doc.save();
  } else {
    doc = await User.create({
      ...identity,
      name: name?.trim() || decoded.name || '',
      bio: bio || '',
      deviceId,
    });
  }

  res.json(toProfile(doc));
});

/** The signed-in devotee's own profile. */
auth.get('/me', requireAuth, async (req, res) => {
  const doc = req.user ?? (await User.findOne({ uid: req.token.uid }));
  if (!doc) return res.status(404).json({ error: 'profile not found — call /auth/sync first' });
  res.json(toProfile(doc));
});

/** Edit the parts of the profile the devotee owns. */
auth.put('/me', requireAuth, async (req, res) => {
  const { name, bio } = req.body ?? {};
  const doc = await User.findOneAndUpdate(
    { uid: req.token.uid },
    {
      $set: {
        ...(name?.trim() ? { name: name.trim() } : {}),
        ...(bio !== undefined ? { bio } : {}),
        lastActive: new Date(),
      },
    },
    { new: true },
  );
  if (!doc) return res.status(404).json({ error: 'profile not found — call /auth/sync first' });
  res.json(toProfile(doc));
});

/** Shape handed back to the app — deliberately not the raw Mongo document. */
function toProfile(doc) {
  return {
    id: doc._id,
    uid: doc.uid,
    name: doc.name || '',
    contact: doc.contact,
    method: doc.method,
    email: doc.email || null,
    phone: doc.phone || null,
    photoUrl: doc.photoUrl || null,
    bio: doc.bio || '',
    blocked: !!doc.blocked,
  };
}
