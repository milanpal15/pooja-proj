import { AREA_INFO, AUDIT_DETAIL_HEADER, encodeAuditDetail, missingPermissions, normalizePermissions } from '@bhakti/common';

import { asyncRouter } from '../lib/async-handler.js';
import { HttpError } from '../lib/http-error.js';
import { can, onlyFrom, requirePerm } from '../lib/perms.js';
import { MAX_CUSTOM_ROLES, findRole, isBuiltin, listRoles } from '../lib/roles.js';
import { Operator, Role } from '../models/index.js';

const KEY_RE = /^[a-z][a-z0-9-]{1,28}[a-z0-9]$/; // 3-30 characters, a slug
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const badRole = (fields) => new HttpError(400, 'bad_role', 'This role has problems that need fixing.', { fields });

/** A role as the audit trail keeps it. */
const brief = (r) => (r ? { key: r.key, name: r.name, description: r.description, permissions: r.permissions } : null);
const detail = (res, before, after) => res.setHeader(AUDIT_DETAIL_HEADER, encodeAuditDetail({ before: brief(before), after: brief(after) }));

/**
 * No privilege escalation (docs/ROLES.md section 2, guards 1 and 5): a caller may only grant what they hold themselves - `roles:edit` included,
 * which is just another permission. `already` is what the role holds today (editing a role never "grants" what it already had, so a caller
 * without those rights can still rename it or take rights away).
 */
export function assertNoEscalation(req, wanted, already = []) {
  const offending = missingPermissions(req.auth?.perms, wanted).filter((p) => !already.includes(p));
  if (offending.length) throw new HttpError(403, 'escalation', "You can only grant permissions you hold yourself.", { permissions: offending });
}

function readFields(body, { partial, existing }) {
  const b = isObj(body) ? body : {};
  const errors = {};
  const out = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
  if (!partial || has('name')) {
    const v = typeof b.name === 'string' ? b.name.trim() : '';
    if (!v || v.length > 40) errors.name = 'Required, at most 40 characters.';
    else out.name = v;
  }
  if (has('description')) {
    if (b.description === null) out.description = '';
    else if (typeof b.description !== 'string' || b.description.trim().length > 160) errors.description = 'At most 160 characters.';
    else out.description = b.description.trim();
  }
  if (!partial || has('permissions')) {
    if (!Array.isArray(b.permissions)) errors.permissions = 'A list of "<area>:view" / "<area>:edit" strings.';
    else {
      const n = normalizePermissions(b.permissions);
      if (n.invalid.length) errors.permissions = `Unknown permission${n.invalid.length > 1 ? 's' : ''}: ${n.invalid.slice(0, 5).join(', ')}.`;
      else out.permissions = n.permissions;
    }
  }
  if (existing && Object.keys(out).length === 0 && Object.keys(errors).length === 0) out.name = existing.name;
  return { out, errors };
}

/** /internal/identity/admin/roles (docs/ROLES.md section 2), operator-only (admin-bff). */
export function roleRoutes() {
  const r = asyncRouter();
  r.use(onlyFrom('admin-bff'));

  // Anyone who may view operators can read the list (the Operators screen names roles); only `roles:view` sees what each role holds.
  r.get('/', requirePerm('roles:view', 'operators:view'), async (req, res) => {
    const full = can(req, 'roles:view');
    const roles = await listRoles();
    res.json({
      roles: roles.map((x) => (full ? x : { key: x.key, name: x.name, description: x.description, builtin: x.builtin, operatorCount: x.operatorCount })),
      areas: AREA_INFO.map((a) => ({ key: a.key, label: a.label, description: a.description, group: a.group, levels: ['view', 'edit'] })),
    });
  });

  const edit = requirePerm('roles:edit');

  r.post('/', edit, async (req, res) => {
    const b = isObj(req.body) ? req.body : {};
    const { out, errors } = readFields(b, { partial: false });
    const key = typeof b.key === 'string' ? b.key.trim().toLowerCase() : '';
    if (!KEY_RE.test(key)) errors.key = 'Required: 3-30 characters, lowercase letters, digits and -, starting with a letter.';
    else if (isBuiltin(key)) errors.key = 'That key belongs to a built-in role.';
    if (Object.keys(errors).length) throw badRole(errors);
    if ((await Role.countDocuments()) >= MAX_CUSTOM_ROLES) throw badRole({ key: `At most ${MAX_CUSTOM_ROLES} custom roles.` });
    if (await Role.exists({ key })) throw new HttpError(409, 'key_taken', 'Another role already uses that key.', { fields: { key: 'Already used.' } });
    assertNoEscalation(req, out.permissions);
    const by = String(req.auth?.ctx?.username ?? req.auth?.sub ?? '');
    const doc = await Role.create({ key, name: out.name, description: out.description ?? '', permissions: out.permissions, createdBy: by, updatedBy: by });
    const created = await findRole(doc.key);
    detail(res, null, created);
    res.status(201).json({ ...created, operatorCount: 0 });
  });

  r.put('/:key', edit, async (req, res) => {
    const key = String(req.params.key).toLowerCase();
    if (isBuiltin(key)) throw new HttpError(403, 'builtin', 'The built-in roles cannot be changed. Duplicate one to customise it.');
    const existing = await findRole(key);
    if (!existing) throw new HttpError(404, 'not_found', 'No such role.');
    const { out, errors } = readFields(req.body, { partial: true, existing });
    if (isObj(req.body) && 'key' in req.body && String(req.body.key).toLowerCase() !== key) errors.key = 'A role key cannot be changed.';
    if (Object.keys(errors).length) throw badRole(errors);
    if (out.permissions) assertNoEscalation(req, out.permissions, existing.permissions);
    const $set = { ...out, updatedBy: String(req.auth?.ctx?.username ?? req.auth?.sub ?? '') };
    await Role.updateOne({ key }, { $set });
    const after = await findRole(key);
    detail(res, existing, after);
    res.json({ ...after, operatorCount: await Operator.countDocuments({ role: key }) });
  });

  r.delete('/:key', edit, async (req, res) => {
    const key = String(req.params.key).toLowerCase();
    if (isBuiltin(key)) throw new HttpError(403, 'builtin', 'The built-in roles cannot be deleted.');
    const existing = await findRole(key);
    if (!existing) throw new HttpError(404, 'not_found', 'No such role.');
    const operators = await Operator.countDocuments({ role: key });
    if (operators > 0) throw new HttpError(409, 'in_use', `${operators} operator${operators === 1 ? ' uses' : 's use'} this role. Give them another role first.`, { operators, operatorCount: operators });
    await Role.deleteOne({ key });
    detail(res, existing, null);
    res.json({ ok: true });
  });

  r.post('/:key/duplicate', edit, async (req, res) => {
    const source = await findRole(String(req.params.key));
    if (!source) throw new HttpError(404, 'not_found', 'No such role.');
    const b = isObj(req.body) ? req.body : {};
    const errors = {};
    const key = typeof b.key === 'string' ? b.key.trim().toLowerCase() : '';
    if (!KEY_RE.test(key)) errors.key = 'Required: 3-30 characters, lowercase letters, digits and -, starting with a letter.';
    else if (isBuiltin(key)) errors.key = 'That key belongs to a built-in role.';
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    if (!name || name.length > 40) errors.name = 'Required, at most 40 characters.';
    if (Object.keys(errors).length) throw badRole(errors);
    if ((await Role.countDocuments()) >= MAX_CUSTOM_ROLES) throw badRole({ key: `At most ${MAX_CUSTOM_ROLES} custom roles.` });
    if (await Role.exists({ key })) throw new HttpError(409, 'key_taken', 'Another role already uses that key.', { fields: { key: 'Already used.' } });
    assertNoEscalation(req, source.permissions);
    const by = String(req.auth?.ctx?.username ?? req.auth?.sub ?? '');
    await Role.create({ key, name, description: source.description, permissions: source.permissions, createdBy: by, updatedBy: by });
    const created = await findRole(key);
    detail(res, null, created);
    res.status(201).json({ ...created, operatorCount: 0 });
  });

  return r;
}
