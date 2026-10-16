import { asyncRouter } from '../lib/async-handler.js';
import { HttpError } from '../lib/http-error.js';
import { devoteeOf, onlyFrom } from '../lib/perms.js';
import { cleanDob, cleanEmail, cleanGender, emailUpdate, handleFor, methodFor, toProfile } from '../lib/profile.js';
import { isBlocked, phoneBlock } from '../lib/blocks.js';
import { User } from '../models/index.js';

const str = (v) => (typeof v === 'string' ? v : undefined);

/**
 * The devotee's own account: /internal/identity/auth/*  (moved from pooja-api/modules/auth/auth.routes.js).
 * Every route here is mobile-bff only; the devotee is the token's `sub`, never anything in a body.
 * (The BFF has already refused a blocked uid; the checks below are the second line.)
 */
export function authRoutes({ astrologers, now = () => new Date() }) {
  const r = asyncRouter();
  r.use(onlyFrom('mobile-bff'));

  /** The astrologer for an account, honouring the failure policy described in lib/astrologer-client.js. */
  async function astrologerFor(doc, reqId) {
    if (doc.role !== 'astrologer') return null; // `User.role` is kept in step by the claim and the astrologer lifecycle
    try {
      return await astrologers.active(doc.uid, reqId);
    } catch {
      throw new HttpError(503, 'astrologer_unavailable', 'Your astrologer profile could not be loaded right now. Try again shortly.');
    }
  }

  /**
   * Called by the app right after Firebase sign-in, and on every cold start: creates the account on first sign-in,
   * refreshes `lastActive` after. Identity (uid, phone, method) comes from the token; the body carries only what the
   * devotee typed. A pre-Firebase row is adopted by `contact`.
   */
  r.post('/sync', async (req, res) => {
    const decoded = devoteeOf(req);
    const b = req.body ?? {};
    const name = str(b.name);
    const identity = {
      uid: decoded.uid,
      contact: handleFor(decoded),
      method: methodFor(decoded),
      phone: decoded.phone_number || undefined,
      photoUrl: decoded.picture || undefined,
      lastActive: new Date(),
    };

    const existing = (await User.findOne({ uid: decoded.uid })) ?? (await User.findOne({ contact: identity.contact }));
    // The same 403 body the BFF answers with (docs/USERS.md section 3); the BFF adds the support contact it reads from the settings table.
    if (existing && isBlocked(existing, now())) throw new HttpError(403, 'account_blocked', 'account blocked', { ...phoneBlock(existing.block), support: {} });

    const $set = { ...identity, ...emailUpdate(existing, decoded, cleanEmail(b.email)) };
    if (name?.trim()) $set.name = name.trim();
    else if (!existing?.name) $set.name = decoded.name || '';
    if (b.bio !== undefined) $set.bio = str(b.bio) ?? '';
    const gender = cleanGender(b.gender);
    if (gender) $set.gender = gender;
    const dob = cleanDob(b.dob);
    if (dob) $set.dob = dob;
    if (str(b.deviceId)) $set.deviceId = b.deviceId.slice(0, 200);

    // One atomic upsert (see the monolith's note: the app fires this on every auth change, so two land together).
    let doc;
    try {
      doc = await User.findOneAndUpdate(existing ? { _id: existing._id } : { uid: decoded.uid }, { $set }, { new: true, upsert: true, setDefaultsOnInsert: true });
    } catch (e) {
      if (e?.code !== 11000) throw e;
      doc = await User.findOneAndUpdate({ uid: decoded.uid }, { $set }, { new: true });
      if (!doc) throw e;
    }

    // Sign-in claim: a verified e-mail/number an operator invited becomes the astrologer role - and a suspended
    // one is a devotee again. The invite lives in the monolith; see lib/astrologer-client.js for the failure policy.
    let astrologer = null;
    try {
      astrologer = await astrologers.claim(decoded, req.id);
    } catch {
      astrologer = await astrologerFor(doc, req.id); // throws 503 only for an account that is an astrologer
      res.setHeader('x-degraded', 'astrologers');
      return res.json(toProfile(doc, astrologer));
    }
    const role = astrologer ? 'astrologer' : 'devotee';
    const $role = {};
    if ((doc.role || 'devotee') !== role) $role.role = role;
    if (astrologer && !doc.name?.trim()) $role.name = astrologer.name;
    if (Object.keys($role).length) doc = (await User.findOneAndUpdate({ _id: doc._id }, { $set: $role }, { new: true })) ?? doc;
    res.json(toProfile(doc, astrologer));
  });

  r.get('/me', async (req, res) => {
    const doc = await User.findOne({ uid: devoteeOf(req).uid });
    if (!doc) return res.status(404).json({ error: 'profile not found — call /auth/sync first' });
    res.json(toProfile(doc, await astrologerFor(doc, req.id)));
  });

  r.put('/me', async (req, res) => {
    const { uid } = devoteeOf(req);
    const b = req.body ?? {};
    const existing = await User.findOne({ uid });
    const typed = cleanEmail(b.email);
    const maySetEmail = typed && !existing?.emailVerified; // a verified (Google) address is never overwritten by a typed one
    const name = str(b.name);
    const gender = cleanGender(b.gender);
    const dob = cleanDob(b.dob);
    const doc = await User.findOneAndUpdate(
      { uid },
      {
        $set: {
          ...(name?.trim() ? { name: name.trim() } : {}),
          ...(b.bio !== undefined ? { bio: str(b.bio) ?? '' } : {}),
          ...(gender ? { gender } : {}),
          ...(dob ? { dob } : {}),
          ...(maySetEmail ? { email: typed, emailVerified: false } : {}),
          lastActive: new Date(),
        },
      },
      { new: true },
    );
    if (!doc) return res.status(404).json({ error: 'profile not found — call /auth/sync first' });
    res.json(toProfile(doc, await astrologerFor(doc, req.id)));
  });

  /** Slugs only: the app already has the temples from /api/content and joins them itself. */
  r.get('/saved-temples', async (req, res) => {
    res.json({ slugs: (await User.findOne({ uid: devoteeOf(req).uid }).select('savedTemples').lean())?.savedTemples ?? [] });
  });

  r.put('/saved-temples', async (req, res) => {
    const { slugs } = req.body ?? {};
    if (!Array.isArray(slugs) || slugs.some((s) => typeof s !== 'string')) return res.status(400).json({ error: 'slugs must be an array of strings' });
    const unique = [...new Set(slugs.map((s) => s.trim()).filter(Boolean))].slice(0, 200); // deduped and capped
    const doc = await User.findOneAndUpdate({ uid: devoteeOf(req).uid }, { $set: { savedTemples: unique } }, { new: true });
    res.json({ slugs: doc?.savedTemples ?? unique });
  });

  return r;
}
