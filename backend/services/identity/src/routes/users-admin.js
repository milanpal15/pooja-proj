import mongoose from 'mongoose';

import { asyncRouter } from '../lib/async-handler.js';
import { onlyFrom, requirePerm } from '../lib/perms.js';
import { User } from '../models/index.js';

/**
 * Devotee administration (the dashboard's Devotees tab) - moved from pooja-api/modules/users. Mounted at /admin/users.
 * Area `devotees` is admin-only, so no row is ever masked here: a role that may not see devotees never gets this far
 * (the admin BFF refuses it, and requirePerm refuses it again from the token). Masking of devotees that appear in OTHER
 * services' rows (`Devotee ••4821`) stays where those rows are serialised.
 */
export function userAdminRoutes({ firebase }) {
  const r = asyncRouter();
  r.use(onlyFrom('admin-bff'));

  /** Accounts are created by auth sync with a verified Firebase token. `POST /users` answers 410 so an old build gets a clear reply. */
  r.post('/', requirePerm('devotees:edit'), (_req, res) =>
    res.status(410).json({
      error: 'gone',
      detail: 'Sign-in now goes through Firebase. Use POST /api/auth/sync with a Bearer ID token.',
    }),
  );

  r.get('/', requirePerm('devotees:view'), async (_req, res) => res.json(await User.find().sort({ lastActive: -1 }).lean()));

  /**
   * Blocking is enforced at the mobile BFF (it asks identity per request, failing closed), but the app could keep using an
   * already-minted ID token for up to an hour, so the refresh tokens are revoked too - that logs the device out for real.
   */
  r.put('/:id', requirePerm('devotees:edit'), async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'user not found' });
    const { name, bio, blocked } = req.body ?? {};
    const doc = await User.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          ...(typeof name === 'string' ? { name } : {}),
          ...(typeof bio === 'string' ? { bio } : {}),
          ...(blocked !== undefined ? { blocked: !!blocked } : {}),
        },
      },
      { new: true },
    );
    if (!doc) return res.status(404).json({ error: 'user not found' });
    if (blocked) await firebase.revokeUser(doc.uid);
    res.json(doc);
  });

  // Removing the devotee removes the Firebase account too - otherwise the next sign-in would silently recreate the row.
  r.delete('/:id', requirePerm('devotees:edit'), async (req, res) => {
    const doc = mongoose.isValidObjectId(req.params.id) ? await User.findByIdAndDelete(req.params.id) : null;
    if (doc?.uid) await firebase.deleteFirebaseUser(doc.uid);
    res.json({ ok: true });
  });
  return r;
}
