import mongoose from 'mongoose';
import { ROLES, permissionsFor } from '@bhakti/common';

import { asyncRouter } from '../lib/async-handler.js';
import { onlyFrom, requirePerm } from '../lib/perms.js';
import { hashPassword, verifyPassword } from '../lib/passwords.js';
import { AuditLog, Operator } from '../models/index.js';

const PUBLIC_FIELDS = 'username role active lastLogin createdAt';
/** A password longer than this is refused without hashing it: scrypt on a huge string is a free CPU burn. */
const MAX_PASSWORD_LENGTH = 256;

/** True once at least one active operator exists - i.e. sign-in is required. */
export const authRequired = async () => (await Operator.countDocuments({ active: true })) > 0;

/** True when removing this one would leave no active admin behind. */
const lastAdmin = async (id) => (await Operator.countDocuments({ role: 'admin', active: true, _id: { $ne: id } })) === 0;

/**
 * Operators (dashboard logins), their sessions' server side, and the audit log - moved from pooja-api/modules/operators.
 * What stays in the admin BFF: the cookie (signing, SameSite) and the failed-login throttle. What lives here: the
 * credentials, the role records, the lockout refusals and the log.
 *
 * Nothing here ever returns a password hash.
 */
export function operatorRoutes() {
  /* ----------------------------------------------- session side (admin-bff) -- */
  const session = asyncRouter(); // mounted at /operators
  session.use(onlyFrom('admin-bff'));

  /** Credentials check. 401 is deliberately the same for an unknown user, a wrong password and a deactivated operator. */
  session.post('/login', async (req, res) => {
    const username = String(req.body?.username ?? '').toLowerCase().trim().slice(0, 64);
    const password = String(req.body?.password ?? '');
    const tooLong = password.length > MAX_PASSWORD_LENGTH;
    const operator = tooLong ? null : await Operator.findOne({ username, active: true });
    let ok = false;
    if (operator) ok = verifyPassword(password, operator.passwordHash);
    else if (!tooLong) verifyPassword(password, hashPassword('never-matches')); // same time for a missing user and a wrong password
    if (!operator || !ok) return res.status(401).json({ error: 'Wrong username or password', code: 'bad_credentials' });
    await Operator.updateOne({ _id: operator._id }, { $set: { lastLogin: new Date() } });
    res.json({ id: String(operator._id), username: operator.username, role: operator.role, permissions: permissionsFor(operator.role) });
  });

  /**
   * What `GET /api/admin/session` and every gated request need: is sign-in required at all, and is this operator still
   * active - with the role READ FROM THE RECORD (a demotion takes effect on the next call), never from the cookie.
   */
  session.get('/session', async (req, res) => {
    const required = await authRequired();
    if (!required) return res.json({ required: false, authed: true, role: 'admin', permissions: permissionsFor('admin') });
    const id = String(req.query.id ?? '');
    const operator = mongoose.isValidObjectId(id) ? await Operator.findById(id).lean() : null;
    if (!operator || !operator.active) return res.json({ required: true, authed: false });
    res.json({ required: true, authed: true, id: String(operator._id), username: operator.username, role: operator.role, permissions: permissionsFor(operator.role) });
  });

  /* ---------------------------------------------------- CRUD (area operators) -- */
  const crud = asyncRouter(); // mounted at /admin/operators
  crud.use(onlyFrom('admin-bff'));
  const view = requirePerm('operators:view');
  const edit = requirePerm('operators:edit');

  crud.get('/', view, async (_req, res) => res.json(await Operator.find().select(PUBLIC_FIELDS).sort({ createdAt: 1 }).lean()));

  crud.post('/', edit, async (req, res) => {
    const username = String(req.body?.username ?? '').toLowerCase().trim();
    const password = String(req.body?.password ?? '');
    const role = req.body?.role === undefined ? 'editor' : req.body.role;
    if (!ROLES.includes(role)) return res.status(400).json({ error: `Role must be one of: ${ROLES.join(', ')}` });
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) return res.status(400).json({ error: 'Username: 3–32 characters, a–z 0–9 . _ -' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    if (await Operator.findOne({ username })) return res.status(409).json({ error: 'That username is taken' });
    const created = await Operator.create({ username, passwordHash: hashPassword(password), role });
    res.status(201).json({ _id: created._id, username: created.username, role: created.role, active: true });
  });

  crud.put('/:id', edit, async (req, res) => {
    const target = mongoose.isValidObjectId(req.params.id) ? await Operator.findById(req.params.id) : null;
    if (!target) return res.status(404).json({ error: 'No such operator' });
    const isSelf = String(req.auth.sub) === String(target._id);
    const $set = {};
    if (req.body?.password !== undefined) {
      const password = String(req.body.password);
      if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
      $set.passwordHash = hashPassword(password);
    }
    /*
     * You cannot demote or deactivate yourself, nor remove the last admin. Not politeness - it is the lockout: with one
     * admin a mis-click would leave a dashboard nobody can administer and no way back in short of editing the database.
     */
    if (req.body?.role !== undefined) {
      const role = req.body.role;
      if (!ROLES.includes(role)) return res.status(400).json({ error: `Role must be one of: ${ROLES.join(', ')}` });
      if (isSelf && role !== 'admin') return res.status(400).json({ error: 'You cannot remove your own admin access' });
      if (target.role === 'admin' && role !== 'admin' && (await lastAdmin(target._id))) return res.status(400).json({ error: 'This is the only admin left' });
      $set.role = role;
    }
    if (req.body?.active !== undefined) {
      const active = !!req.body.active;
      if (isSelf && !active) return res.status(400).json({ error: 'You cannot deactivate yourself' });
      if (!active && target.role === 'admin' && (await lastAdmin(target._id))) return res.status(400).json({ error: 'This is the only admin left' });
      $set.active = active;
    }
    await Operator.updateOne({ _id: target._id }, { $set });
    res.json(await Operator.findById(target._id).select(PUBLIC_FIELDS).lean());
  });

  crud.delete('/:id', edit, async (req, res) => {
    const target = mongoose.isValidObjectId(req.params.id) ? await Operator.findById(req.params.id) : null;
    if (!target) return res.status(404).json({ error: 'No such operator' });
    if (String(req.auth.sub) === String(target._id)) return res.status(400).json({ error: 'You cannot delete your own account' });
    if (target.role === 'admin' && (await lastAdmin(target._id))) return res.status(400).json({ error: 'This is the only admin left' });
    await Operator.deleteOne({ _id: target._id });
    res.json({ ok: true });
  });

  /* --------------------------------------------------------------- audit log -- */
  const audit = asyncRouter(); // mounted at /audit  (write: admin-bff) and /admin/audit-log (read)
  const s = (v, max = 200) => (typeof v === 'string' && v ? v.slice(0, max) : undefined);

  /** Append one entry. Same fields the monolith's `auditWrites` recorded; never a request body. */
  audit.post('/', onlyFrom('admin-bff'), async (req, res) => {
    const b = req.body ?? {};
    const operator = s(b.operator, 64);
    if (!operator) return res.status(400).json({ error: 'operator required', code: 'bad_request' });
    await AuditLog.create({
      operator, role: s(b.role, 20), area: s(b.area, 40), method: s(b.method, 10), path: s(b.path, 300), targetId: s(b.targetId, 100),
      status: Number.isInteger(b.status) ? b.status : undefined,
    });
    res.json({ ok: true });
  });

  const auditRead = asyncRouter();
  auditRead.get('/', onlyFrom('admin-bff'), view, async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    res.json({ entries: await AuditLog.find().sort({ at: -1, _id: -1 }).limit(limit).lean() });
  });

  return { session, crud, audit, auditRead };
}
