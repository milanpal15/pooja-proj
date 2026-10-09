import { asyncRouter } from '../../lib/async-handler.js';
import { User } from '../../models.js';
import { deleteFirebaseUser, revokeUser } from '../auth/firebase.js';

export const users = asyncRouter();

/**
 * Accounts are created by `POST /api/auth/sync`, which requires a verified
 * Firebase ID token. This endpoint used to accept any `{contact, name}` body
 * from anyone — that is exactly how a stranger got to be any account — so it
 * is kept only to give an old build a clear answer instead of a 404.
 */
users.post('/', (_req, res) =>
  res.status(410).json({
    error: 'gone',
    detail: 'Sign-in now goes through Firebase. Use POST /api/auth/sync with a Bearer ID token.',
  }),
);

users.get('/', async (_req, res) => res.json(await User.find().sort({ lastActive: -1 }).lean()));

/**
 * Dashboard edits. Blocking is enforced on the API by `requireAuth`, but the
 * app could keep using an already-minted ID token for up to an hour, so the
 * refresh tokens are revoked too — that logs the device out for real.
 */
users.put('/:id', async (req, res) => {
  const { name, bio, blocked } = req.body ?? {};
  const doc = await User.findByIdAndUpdate(
    req.params.id,
    {
      $set: {
        ...(name !== undefined ? { name } : {}),
        ...(bio !== undefined ? { bio } : {}),
        ...(blocked !== undefined ? { blocked: !!blocked } : {}),
      },
    },
    { new: true },
  );
  if (!doc) return res.status(404).json({ error: 'user not found' });
  if (blocked) await revokeUser(doc.uid);
  res.json(doc);
});

// Removing the devotee here removes the Firebase account too — otherwise the
// next sign-in would silently recreate the row from the surviving credential.
users.delete('/:id', async (req, res) => {
  const doc = await User.findByIdAndDelete(req.params.id);
  if (doc?.uid) await deleteFirebaseUser(doc.uid);
  res.json({ ok: true });
});
