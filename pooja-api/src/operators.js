import { asyncRouter } from './async.js';
import { hashPassword, sessionOf } from './admin.js';
import { Operator } from './models.js';

/**
 * Managing the people who sign in to the dashboard.
 *
 * Admin-only — the path is in ADMIN_ONLY in admin.js, so an editor reaching
 * any of this is already turned away with 403 before it runs.
 *
 * Nothing here ever returns a password hash. There is no reason for one to
 * cross the wire, and a hash on screen is a hash in someone's clipboard.
 */
export const operators = asyncRouter();

const PUBLIC_FIELDS = 'username role active lastLogin createdAt';

operators.get('/admin/operators', async (_req, res) => {
  res.json(await Operator.find().select(PUBLIC_FIELDS).sort({ createdAt: 1 }).lean());
});

operators.post('/admin/operators', async (req, res) => {
  const username = String(req.body?.username ?? '').toLowerCase().trim();
  const password = String(req.body?.password ?? '');
  const role = req.body?.role === 'admin' ? 'admin' : 'editor';

  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    return res.status(400).json({ error: 'Username: 3–32 characters, a–z 0–9 . _ -' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  if (await Operator.findOne({ username })) {
    return res.status(409).json({ error: 'That username is taken' });
  }

  const created = await Operator.create({ username, passwordHash: hashPassword(password), role });
  res.status(201).json({ _id: created._id, username: created.username, role: created.role, active: true });
});

operators.put('/admin/operators/:id', async (req, res) => {
  const target = await Operator.findById(req.params.id);
  if (!target) return res.status(404).json({ error: 'No such operator' });

  const me = sessionOf(req);
  const isSelf = me && String(me.uid) === String(target._id);
  const $set = {};

  if (req.body?.password !== undefined) {
    const password = String(req.body.password);
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    $set.passwordHash = hashPassword(password);
  }

  /*
   * You cannot demote or deactivate yourself.
   *
   * Not politeness — it is the lockout. With one admin, a mis-click would
   * leave a dashboard nobody can administer and no way back in short of
   * editing the database by hand.
   */
  if (req.body?.role !== undefined) {
    const role = req.body.role === 'admin' ? 'admin' : 'editor';
    if (isSelf && role !== 'admin') {
      return res.status(400).json({ error: 'You cannot remove your own admin access' });
    }
    if (target.role === 'admin' && role !== 'admin' && (await lastAdmin(target._id))) {
      return res.status(400).json({ error: 'This is the only admin left' });
    }
    $set.role = role;
  }

  if (req.body?.active !== undefined) {
    const active = !!req.body.active;
    if (isSelf && !active) {
      return res.status(400).json({ error: 'You cannot deactivate yourself' });
    }
    if (!active && target.role === 'admin' && (await lastAdmin(target._id))) {
      return res.status(400).json({ error: 'This is the only admin left' });
    }
    $set.active = active;
  }

  await Operator.updateOne({ _id: target._id }, { $set });
  res.json(await Operator.findById(target._id).select(PUBLIC_FIELDS).lean());
});

operators.delete('/admin/operators/:id', async (req, res) => {
  const target = await Operator.findById(req.params.id);
  if (!target) return res.status(404).json({ error: 'No such operator' });

  const me = sessionOf(req);
  if (me && String(me.uid) === String(target._id)) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }
  if (target.role === 'admin' && (await lastAdmin(target._id))) {
    return res.status(400).json({ error: 'This is the only admin left' });
  }

  await Operator.deleteOne({ _id: target._id });
  res.json({ ok: true });
});

/** True when removing this one would leave no active admin behind. */
async function lastAdmin(id) {
  return (await Operator.countDocuments({ role: 'admin', active: true, _id: { $ne: id } })) === 0;
}
