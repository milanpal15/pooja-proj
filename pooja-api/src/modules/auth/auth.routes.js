import { asyncRouter } from '../../lib/async-handler.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { User } from '../../models.js';
import { claimAstrologer } from '../astrologers/claim.js';
import { activeAstrologer, emailUpdate, handleFor, methodFor, toProfile } from './profile.js';

export const auth = asyncRouter();

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

  // Sign-in claim: a verified e-mail/number an operator invited becomes the
  // astrologer role here — and a suspended one is a devotee again.
  const claimed = await claimAstrologer(decoded, doc);
  res.json(toProfile(claimed.user, claimed.astrologer));
});

/** The signed-in devotee's own profile. */
auth.get('/me', requireAuth, async (req, res) => {
  const doc = req.user ?? (await User.findOne({ uid: req.token.uid }));
  if (!doc) return res.status(404).json({ error: 'profile not found — call /auth/sync first' });
  res.json(toProfile(doc, await activeAstrologer(doc)));
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
  res.json(toProfile(doc, await activeAstrologer(doc)));
});


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
