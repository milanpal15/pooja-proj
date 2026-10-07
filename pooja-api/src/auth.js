import { asyncRouter } from './async.js';
import { firebaseError, firebaseProjectId, firebaseReady, verifyIdToken } from './firebase.js';
import { Booking, User } from './models.js';

export const auth = asyncRouter();

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
 * Identity (uid, phone, method) comes from the token. The body carries only
 * what the devotee types: name, bio, gender, date of birth, device id — and
 * an email, but ONLY for phone sign-ins, where no provider email exists. A
 * Google email always wins over a typed one, because one is verified and
 * the other is a claim.
 */
/**
 * Decide which email the account carries.
 *
 * A token email (Google) is verified by the provider and always wins. A
 * typed one is a claim, accepted only where the provider gave none — phone
 * sign-in — and flagged as unverified so nothing downstream mistakes it
 * for proof of address.
 */
function emailUpdate(existing, decoded, typed) {
  // A provider-supplied address always wins and is the only verified one.
  if (decoded.email) return { email: decoded.email, emailVerified: true };
  // A self-declared one must never overwrite a verified address.
  if (typed && !existing?.emailVerified) return { email: typed, emailVerified: false };
  return {};
}

auth.post('/sync', requireAuth, async (req, res) => {
  const decoded = req.token;
  const { name, bio, deviceId, gender, dob, email } = req.body ?? {};

  /** Only the four we offer; anything else is dropped rather than stored. */
  const GENDERS = ['female', 'male', 'other', 'prefer_not_to_say'];
  const cleanGender = GENDERS.includes(gender) ? gender : undefined;
  /** A calendar date, and a plausible one — not a timestamp, not the future. */
  const cleanDob =
    typeof dob === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dob) && dob <= new Date().toISOString().slice(0, 10)
      ? dob
      : undefined;
  const cleanEmail =
    typeof email === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
      ? email.trim().toLowerCase()
      : undefined;

  const identity = {
    uid: decoded.uid,
    contact: handleFor(decoded),
    method: methodFor(decoded),
    phone: decoded.phone_number || undefined,
    photoUrl: decoded.picture || undefined,
    lastActive: new Date(),
  };

  /*
   * A row may already exist from before this account had a uid (the
   * pre-Firebase dummy sign-in wrote contact-only rows). Adopt it instead
   * of colliding with its unique `contact` index.
   */
  const existing = req.user ?? (await User.findOne({ contact: identity.contact }));

  const $set = { ...identity, ...emailUpdate(existing, decoded, cleanEmail) };
  // Never blank out something the devotee already set by syncing with an
  // empty body — every cold start calls this.
  if (name?.trim()) $set.name = name.trim();
  else if (!existing?.name) $set.name = decoded.name || '';
  if (bio !== undefined) $set.bio = bio;
  if (cleanGender) $set.gender = cleanGender;
  if (cleanDob) $set.dob = cleanDob;
  if (deviceId) $set.deviceId = deviceId;

  /*
   * One atomic upsert, not load-then-save.
   *
   * The old shape read the document, mutated it and called `save()`, which
   * carries Mongoose's version check — and the app fires this on every auth
   * state change, so two land together routinely. If the row moved under
   * the first one it threw `VersionError`, and with no error handler in
   * Express that unhandled rejection took the whole API down. There is no
   * version to disagree about here.
   */
  let doc;
  try {
    doc = await User.findOneAndUpdate(
      existing ? { _id: existing._id } : { uid: decoded.uid },
      { $set },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
  } catch (e) {
    // Two first-time syncs racing: both saw no row, both tried to insert,
    // and the unique index let exactly one through. The loser just reads
    // what the winner wrote.
    if (e?.code !== 11000) throw e;
    doc = await User.findOneAndUpdate({ uid: decoded.uid }, { $set }, { new: true });
    if (!doc) throw e;
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
  const { name, bio, gender, dob, email } = req.body ?? {};

  const GENDERS = ['female', 'male', 'other', 'prefer_not_to_say'];
  const cleanDob =
    typeof dob === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dob) && dob <= new Date().toISOString().slice(0, 10)
      ? dob
      : undefined;
  const cleanEmail =
    typeof email === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
      ? email.trim().toLowerCase()
      : undefined;

  // A verified (Google) address is never overwritten by a typed one.
  const existing = req.user ?? (await User.findOne({ uid: req.token.uid }));
  const maySetEmail = cleanEmail && !existing?.emailVerified;

  const doc = await User.findOneAndUpdate(
    { uid: req.token.uid },
    {
      $set: {
        ...(name?.trim() ? { name: name.trim() } : {}),
        ...(bio !== undefined ? { bio } : {}),
        ...(GENDERS.includes(gender) ? { gender } : {}),
        ...(cleanDob ? { dob: cleanDob } : {}),
        ...(maySetEmail ? { email: cleanEmail, emailVerified: false } : {}),
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
    emailVerified: !!doc.emailVerified,
    phone: doc.phone || null,
    photoUrl: doc.photoUrl || null,
    bio: doc.bio || '',
    gender: doc.gender || null,
    dob: doc.dob || null,
    blocked: !!doc.blocked,
  };
}

/* ───────────────────────────────────────────────────── saved temples ── */

/**
 * The devotee's bookmarked temples.
 *
 * Slugs only — the app already has the temples from `/api/content` and
 * joins them itself, so this stays a tiny list that cannot drift out of
 * date when a temple is renamed.
 */
auth.get('/saved-temples', requireAuth, async (req, res) => {
  res.json({ slugs: req.user?.savedTemples ?? [] });
});

auth.put('/saved-temples', requireAuth, async (req, res) => {
  const { slugs } = req.body ?? {};
  if (!Array.isArray(slugs) || slugs.some((s) => typeof s !== 'string')) {
    return res.status(400).json({ error: 'slugs must be an array of strings' });
  }
  // Deduped and capped: this is written straight from the client, and a
  // list that can grow without bound is a list someone will grow.
  const unique = [...new Set(slugs.map((s) => s.trim()).filter(Boolean))].slice(0, 200);
  const doc = await User.findOneAndUpdate(
    { uid: req.token.uid },
    { $set: { savedTemples: unique } },
    { new: true },
  );
  res.json({ slugs: doc?.savedTemples ?? unique });
});

/* ──────────────────────────────────────────────────────────  bookings ── */

/**
 * Status is derived, never stored.
 *
 * A booking becomes 'completed' because the day passed, not because
 * something remembered to write it down — a stored flag would need a cron
 * job and would be wrong in between runs.
 */
function withStatus(b) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: String(b._id),
    bookingRef: b.bookingRef,
    templeId: b.templeSlug,
    templeName: b.templeName,
    templeLocation: b.templeLocation,
    sevaId: b.sevaSlug,
    sevaName: b.sevaName,
    sevaNameHi: b.sevaNameHi,
    price: b.price,
    totalAmount: b.totalAmount,
    date: b.date,
    devoteeName: b.devoteeName,
    gotra: b.gotra,
    prasad: !!b.prasad,
    status: b.date >= today ? 'upcoming' : 'completed',
    bookedAt: b.createdAt,
  };
}

auth.get('/bookings', requireAuth, async (req, res) => {
  const rows = await Booking.find({ uid: req.token.uid, cancelled: { $ne: true } })
    .sort({ date: -1, createdAt: -1 })
    .lean();
  res.json({ bookings: rows.map(withStatus) });
});

auth.post('/bookings', requireAuth, async (req, res) => {
  const b = req.body ?? {};
  if (!b.date || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  }
  const suffix = Math.floor(1000 + Math.random() * 9000);
  const prefix = String(b.templeId || 'XX').slice(0, 2).toUpperCase();
  try {
    const doc = await Booking.create({
      // Never from the body: the devotee is whoever the token says.
      uid: req.token.uid,
      bookingRef: `SM-${new Date().getFullYear()}-${prefix}-${suffix}`,
      templeSlug: b.templeId,
      templeName: b.templeName,
      templeLocation: b.templeLocation,
      sevaSlug: b.sevaId,
      sevaName: b.sevaName,
      sevaNameHi: b.sevaNameHi,
      price: b.price,
      totalAmount: b.totalAmount,
      date: b.date,
      devoteeName: b.devoteeName,
      gotra: b.gotra,
      prasad: !!b.prasad,
    });
    res.status(201).json({ booking: withStatus(doc) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

auth.delete('/bookings/:id', requireAuth, async (req, res) => {
  // Scoped by uid as well as id, so guessing an id reaches nothing.
  const doc = await Booking.findOneAndUpdate(
    { _id: req.params.id, uid: req.token.uid },
    { $set: { cancelled: true } },
  );
  if (!doc) return res.status(404).json({ error: 'booking not found' });
  res.json({ ok: true });
});
