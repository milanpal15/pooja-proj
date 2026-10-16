import mongoose from 'mongoose';
import { AUDIT_DETAIL_HEADER, BUILTIN_ROLES, encodeAuditDetail, missingPermissions, permissionsFor, sanitizeAuditDetail } from '@bhakti/common';

import { asyncRouter } from '../lib/async-handler.js';
import { HttpError } from '../lib/http-error.js';
import { onlyFrom, requirePerm } from '../lib/perms.js';
import { hashPassword, verifyPassword } from '../lib/passwords.js';
import { findRole, roleIndex } from '../lib/roles.js';
import { AuditLog, Operator } from '../models/index.js';

const PUBLIC_FIELDS = 'username role active lastLogin createdAt';
/** A password longer than this is refused without hashing it: scrypt on a huge string is a free CPU burn. */
const MAX_PASSWORD_LENGTH = 256;

/** True once at least one active operator exists - i.e. sign-in is required. */
export const authRequired = async () => (await Operator.countDocuments({ active: true })) > 0;

/** The role of an operator as `{ role, roleName, permissions }`, resolved from the store (a role that no longer exists holds nothing). */
async function resolved(roleKey) {
  const role = await findRole(roleKey);
  return { role: roleKey, roleName: role?.name ?? roleKey, permissions: role?.permissions ?? [] };
}

const detailHeader = (res, before, after) => res.setHeader(AUDIT_DETAIL_HEADER, encodeAuditDetail({ before, after }));

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
    res.json({ id: String(operator._id), username: operator.username, ...(await resolved(operator.role)) });
  });

  /**
   * What `GET /api/admin/session` and every gated request need: is sign-in required at all, and is this operator still
   * active - with the role READ FROM THE RECORD (a demotion takes effect on the next call), never from the cookie.
   */
  session.get('/session', async (req, res) => {
    const required = await authRequired();
    if (!required) return res.json({ required: false, authed: true, role: 'admin', roleName: BUILTIN_ROLES[0].name, permissions: permissionsFor('admin') });
    const id = String(req.query.id ?? '');
    const operator = mongoose.isValidObjectId(id) ? await Operator.findById(id).lean() : null;
    if (!operator || !operator.active) return res.json({ required: true, authed: false });
    res.json({ required: true, authed: true, id: String(operator._id), username: operator.username, ...(await resolved(operator.role)) });
  });

  /* ---------------------------------------------------- CRUD (area operators) -- */
  const crud = asyncRouter(); // mounted at /admin/operators
  crud.use(onlyFrom('admin-bff'));
  const view = requirePerm('operators:view');
  const edit = requirePerm('operators:edit');

  const withRoleName = (o, roles) => ({ ...o, roleName: roles.get(o.role)?.name ?? o.role });

  crud.get('/', view, async (_req, res) => {
    const [rows, roles] = await Promise.all([Operator.find().select(PUBLIC_FIELDS).sort({ createdAt: 1 }).lean(), roleIndex()]);
    res.json(rows.map((o) => withRoleName(o, roles)));
  });

  /**
   * Role assignment guards (docs/ROLES.md section 2): the role must exist (`unknown_role`), and you can only hand out rights you hold
   * yourself (`escalation`) - assigning `admin` as an editor-with-operators:edit would be the back door around the role matrix.
   */
  async function assignable(req, roleKey) {
    const role = await findRole(roleKey);
    if (!role) throw new HttpError(400, 'unknown_role', 'That role does not exist.');
    const offending = missingPermissions(req.auth?.perms, role.permissions);
    if (offending.length) throw new HttpError(403, 'escalation', 'You can only assign a role whose permissions you hold yourself.', { permissions: offending });
    return role;
  }

  /** Touching someone who outranks you (password, role, active, delete) is escalation too: a password reset is a takeover. */
  async function assertCanTouch(req, target) {
    const theirs = (await findRole(target.role))?.permissions ?? [];
    const offending = missingPermissions(req.auth?.perms, theirs);
    if (offending.length) throw new HttpError(403, 'escalation', 'You cannot change an operator who holds permissions you do not have.', { permissions: offending });
  }

  crud.post('/', edit, async (req, res) => {
    const username = String(req.body?.username ?? '').toLowerCase().trim();
    const password = String(req.body?.password ?? '');
    const role = req.body?.role === undefined ? 'editor' : String(req.body.role).trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) return res.status(400).json({ error: 'Username: 3–32 characters, a–z 0–9 . _ -' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    if (await Operator.findOne({ username })) return res.status(409).json({ error: 'That username is taken' });
    const r = await assignable(req, role);
    const created = await Operator.create({ username, passwordHash: hashPassword(password), role });
    detailHeader(res, null, { username: created.username, role: created.role });
    res.status(201).json({ _id: created._id, username: created.username, role: created.role, roleName: r.name, active: true });
  });

  crud.put('/:id', edit, async (req, res) => {
    const target = mongoose.isValidObjectId(req.params.id) ? await Operator.findById(req.params.id) : null;
    if (!target) return res.status(404).json({ error: 'No such operator' });
    const isSelf = String(req.auth.sub) === String(target._id);
    if (!isSelf) await assertCanTouch(req, target);
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
      const role = String(req.body.role).trim().toLowerCase();
      if (role !== target.role) {
        if (isSelf) return res.status(400).json({ error: target.role === 'admin' ? 'You cannot remove your own admin access' : 'You cannot change your own role', code: 'own_role' });
        await assignable(req, role);
        if (target.role === 'admin' && role !== 'admin' && (await lastAdmin(target._id))) return res.status(400).json({ error: 'This is the only admin left' });
        $set.role = role;
      } else if (!(await findRole(role))) throw new HttpError(400, 'unknown_role', 'That role does not exist.');
    }
    if (req.body?.active !== undefined) {
      const active = !!req.body.active;
      if (isSelf && !active) return res.status(400).json({ error: 'You cannot deactivate yourself' });
      if (!active && target.role === 'admin' && (await lastAdmin(target._id))) return res.status(400).json({ error: 'This is the only admin left' });
      $set.active = active;
    }
    await Operator.updateOne({ _id: target._id }, { $set });
    const after = await Operator.findById(target._id).select(PUBLIC_FIELDS).lean();
    // Never the password: only the fields an auditor needs to see move.
    detailHeader(res, { username: target.username, role: target.role, active: target.active }, { username: after.username, role: after.role, active: after.active });
    res.json(withRoleName(after, await roleIndex()));
  });

  crud.delete('/:id', edit, async (req, res) => {
    const target = mongoose.isValidObjectId(req.params.id) ? await Operator.findById(req.params.id) : null;
    if (!target) return res.status(404).json({ error: 'No such operator' });
    if (String(req.auth.sub) === String(target._id)) return res.status(400).json({ error: 'You cannot delete your own account' });
    await assertCanTouch(req, target);
    if (target.role === 'admin' && (await lastAdmin(target._id))) return res.status(400).json({ error: 'This is the only admin left' });
    await Operator.deleteOne({ _id: target._id });
    detailHeader(res, { username: target.username, role: target.role, active: target.active }, null);
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
    const d = sanitizeAuditDetail({ before: b.before, after: b.after, selfApproved: b.selfApproved }); // re-sanitised here: this service never trusts the caller to have done it
    await AuditLog.create({
      operator, role: s(b.role, 30), area: s(b.area, 40), method: s(b.method, 10), path: s(b.path, 300), targetId: s(b.targetId, 100),
      status: Number.isInteger(b.status) ? b.status : undefined,
      ...(d ? { before: d.before, after: d.after, ...(d.selfApproved ? { selfApproved: true } : {}) } : {}),
    });
    res.json({ ok: true });
  });

  const auditRead = asyncRouter();
  const auditView = (e) => ({
    id: String(e._id), at: e.at, operator: e.operator, role: e.role ?? null, area: e.area ?? null, method: e.method ?? null, path: e.path ?? null,
    targetId: e.targetId ?? null, status: e.status ?? null,
    ...(e.selfApproved ? { selfApproved: true } : {}), ...(e.before !== undefined && e.before !== null ? { before: e.before } : {}), ...(e.after !== undefined && e.after !== null ? { after: e.after } : {}),
  });
  const badFilter = (field, message) => new HttpError(400, 'bad_filter', message, { fields: { [field]: message } });

  /**
   * Newest first, cursor-paged (docs/RELEASES.md section 5): `GET /?operator=&area=&method=&from=&to=&limit=&before=` -> `{ items, next }`.
   * `before` is the `next` of the previous page (an id); `next` is null on the last page. `from` / `to` are ISO dates on `at`.
   */
  auditRead.get('/', onlyFrom('admin-bff'), requirePerm('audit:view'), async (req, res) => {
    const q = req.query;
    const filter = {};
    const str = (k, max = 64) => (typeof q[k] === 'string' && q[k].trim() ? q[k].trim().slice(0, max) : undefined);
    if (str('operator')) filter.operator = str('operator').toLowerCase();
    if (str('area')) filter.area = str('area', 40);
    if (str('method')) filter.method = str('method', 10).toUpperCase();
    const range = {};
    for (const [k, op] of [['from', '$gte'], ['to', '$lte']]) {
      if (str(k, 40) === undefined) continue;
      const t = Date.parse(q[k]);
      if (!Number.isFinite(t)) throw badFilter(k, 'Must be a valid date.');
      range[op] = new Date(t);
    }
    if (Object.keys(range).length) filter.at = range;
    if (str('before', 40) !== undefined) {
      if (!mongoose.isValidObjectId(q.before) || String(q.before).length !== 24) throw badFilter('before', 'Not a valid cursor.');
      filter._id = { $lt: q.before };
    }
    const n = Number(q.limit);
    const limit = Number.isInteger(n) && n >= 1 ? Math.min(n, 200) : 50;
    const rows = await AuditLog.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
    const page = rows.slice(0, limit);
    res.json({ items: page.map(auditView), next: rows.length > limit ? String(page[page.length - 1]._id) : null });
  });

  return { session, crud, audit, auditRead };
}
