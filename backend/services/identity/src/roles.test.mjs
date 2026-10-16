// Custom roles, role resolution from the store, the guards, operators with custom roles, and the audit log with before/after (docs/ROLES.md, docs/RELEASES.md section 5).
// Run: TEST_MONGODB_URI=mongodb://127.0.0.1:27161/x node --test --test-concurrency=1 src/roles.test.mjs
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, beforeEach, describe, test } from 'node:test';

import { AREAS, ROLE_PERMISSIONS, decodeAuditDetail, signServiceToken } from '@bhakti/common';
import mongoose from 'mongoose';

import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { connectDb } from './db.js';
import { permissionsOfRole } from './lib/roles.js';
import { hashPassword } from './lib/passwords.js';
import { AuditLog, Operator, Role } from './models/index.js';
import { migrateOperatorRoles, seedIdentity } from './seed.js';

const SECRET = 'test-secret-test-secret-1234';
const base = new URL(process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27161/x');
const config = loadConfig({ INTERNAL_JWT_SECRET: SECRET, MONGODB_URI: `${base.protocol}//${base.host}`, DB_NAME: 'identity_roles_test', ADMIN_PASSWORD: 'first-admin-pass', ADMIN_USERNAME: 'root' });

const ADMIN = ROLE_PERMISSIONS.admin;
const EDITOR = ROLE_PERMISSIONS.editor;
const VIEWER = ROLE_PERMISSIONS.viewer;
let server;
let url;
let rootId;

before(async () => {
  await connectDb(config);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  const app = createApp(config, { isReady: () => true, logger: { info() {}, warn() {}, error() {} }, firebase: {}, astrologers: { claim: async () => null, active: async () => null } });
  server = http.createServer(app);
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((ok) => server.close(ok));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
beforeEach(async () => {
  await Promise.all([Role.deleteMany({}), Operator.deleteMany({}), AuditLog.deleteMany({})]);
  await seedIdentity(config);
  rootId = String((await Operator.findOne({ username: 'root' }))._id);
});

const tok = (o = {}) => signServiceToken({ iss: 'admin-bff', sub: rootId, role: 'admin', perms: ADMIN, ctx: { username: 'root' }, ...o }, { secret: SECRET });
const as = (perms = ADMIN, sub = rootId, iss = 'admin-bff') => ({ authorization: `Bearer ${tok({ perms, sub, iss })}` });
async function call(method, path, { headers = as(), body } = {}) {
  const res = await fetch(`${url}/internal/identity${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, audit: decodeAuditDetail(res.headers.get('x-audit-detail')) };
}
const mkRole = (b, h) => call('POST', '/admin/roles', { headers: h, body: b });
const mkOp = (username, role, active = true) => Operator.create({ username, passwordHash: hashPassword('long-enough-1'), role, active });
/** A caller who may manage roles and operators but holds only the given extra rights. */
const caller = (...extra) => as(['roles:view', 'roles:edit', 'operators:view', 'operators:edit', ...extra], 'someone-else');

describe('resolution: role key -> permissions, from the store', () => {
  test('built-ins come from code, customs from the collection, unknown keys hold nothing, edit implies view', async () => {
    assert.deepEqual(await permissionsOfRole('admin'), ROLE_PERMISSIONS.admin);
    assert.deepEqual(await permissionsOfRole('viewer'), ROLE_PERMISSIONS.viewer);
    assert.deepEqual(await permissionsOfRole('ghost'), []);
    assert.deepEqual(await permissionsOfRole(''), []);
    assert.deepEqual(await permissionsOfRole(undefined), []);
    assert.equal((await mkRole({ key: 'support', name: 'Support', permissions: ['orders:edit', 'overview:view'] })).status, 201);
    assert.deepEqual(await permissionsOfRole('support'), ['overview:view', 'orders:view', 'orders:edit']);
    assert.deepEqual(await permissionsOfRole(' SUPPORT '), ['overview:view', 'orders:view', 'orders:edit'], 'the key is normalised');
  });

  test('login and session answer role, roleName and permissions from the store; an edit to the role shows on the very next call', async () => {
    await mkRole({ key: 'support', name: 'Support desk', permissions: ['orders:view'] });
    const op = await mkOp('sam', 'support');
    const login = (await call('POST', '/operators/login', { body: { username: 'sam', password: 'long-enough-1' } })).body;
    assert.deepEqual([login.role, login.roleName, login.permissions], ['support', 'Support desk', ['orders:view']]);
    let s = (await call('GET', `/operators/session?id=${op._id}`)).body;
    assert.deepEqual([s.authed, s.role, s.roleName, s.permissions], [true, 'support', 'Support desk', ['orders:view']]);
    await call('PUT', '/admin/roles/support', { body: { permissions: ['orders:edit', 'calls:view'], name: 'Support' } });
    s = (await call('GET', `/operators/session?id=${op._id}`)).body;
    assert.deepEqual([s.roleName, s.permissions], ['Support', ['orders:view', 'orders:edit', 'calls:view']]);
    const builtin = (await call('GET', `/operators/session?id=${rootId}`)).body;
    assert.deepEqual([builtin.role, builtin.roleName, builtin.permissions], ['admin', 'Administrator', ROLE_PERMISSIONS.admin]);
  });

  test('an operator whose role no longer resolves is still signed in but holds NO permissions (fail closed)', async () => {
    await mkRole({ key: 'temp', name: 'Temp', permissions: ['overview:view'] });
    const op = await mkOp('tess', 'temp');
    await Role.deleteOne({ key: 'temp' }); // removed behind the API's back
    const s = (await call('GET', `/operators/session?id=${op._id}`)).body;
    assert.deepEqual([s.authed, s.role, s.permissions], [true, 'temp', []]);
    const login = (await call('POST', '/operators/login', { body: { username: 'tess', password: 'long-enough-1' } })).body;
    assert.deepEqual(login.permissions, []);
  });
});

describe('GET /admin/roles', () => {
  test('built-ins first (locked, with their permissions), then customs; operator counts; the area registry for the matrix', async () => {
    await mkRole({ key: 'support', name: 'Support', description: 'Answers devotees', permissions: ['orders:edit'] });
    await mkOp('sam', 'support');
    await mkOp('ed', 'editor');
    const r = (await call('GET', '/admin/roles')).body;
    assert.deepEqual(r.roles.map((x) => [x.key, x.builtin]), [['admin', true], ['editor', true], ['viewer', true], ['support', false]]);
    assert.deepEqual(r.roles.map((x) => x.operatorCount), [1, 1, 0, 1]);
    assert.deepEqual(r.roles[0].permissions, ADMIN);
    assert.deepEqual(r.roles[3].permissions, ['orders:view', 'orders:edit']);
    assert.deepEqual([r.roles[3].name, r.roles[3].description], ['Support', 'Answers devotees']);
    assert.ok(r.roles[3].updatedAt && r.roles[3].updatedBy === 'root');
    assert.deepEqual(r.areas.map((a) => a.key), AREAS);
    for (const a of r.areas) assert.deepEqual([typeof a.label, typeof a.description, typeof a.group, a.levels], ['string', 'string', 'string', ['view', 'edit']]);
  });

  test('operators:view alone may READ the list (for role names) but never sees the permissions; nothing at all is 403; a non-admin-bff caller is 403', async () => {
    await mkRole({ key: 'support', name: 'Support', permissions: ['orders:edit'] });
    const r = await call('GET', '/admin/roles', { headers: as(['operators:view']) });
    assert.equal(r.status, 200);
    assert.equal(r.body.roles.length, 4);
    for (const x of r.body.roles) assert.equal('permissions' in x, false, x.key);
    assert.equal(r.body.roles[3].name, 'Support');
    assert.equal((await call('GET', '/admin/roles', { headers: as(['roles:view']) })).body.roles[3].permissions.length, 2);
    assert.equal((await call('GET', '/admin/roles', { headers: as(EDITOR) })).status, 403);
    assert.equal((await call('GET', '/admin/roles', { headers: as(VIEWER) })).status, 403);
    assert.equal((await call('GET', '/admin/roles', { headers: as([]) })).status, 403);
    assert.equal((await call('GET', '/admin/roles', { headers: as(ADMIN, rootId, 'mobile-bff') })).status, 403);
  });
});

describe('create and edit: validation', () => {
  const bad = async (body, field, h) => {
    const r = await mkRole(body, h);
    assert.deepEqual([r.status, r.body.code], [400, 'bad_role'], JSON.stringify(body));
    assert.ok(r.body.fields[field], `${field} in ${JSON.stringify(r.body.fields)}`);
  };
  test('key: 3-30 slug, not a built-in, unique; name required <= 40; description <= 160; permissions known', async () => {
    const ok = { name: 'N', permissions: [] };
    for (const key of ['ab', 'a'.repeat(31), 'Has Space', '1abc', 'under_score', '-abc', 'abc-', 'ünï', '', undefined, 7]) await bad({ ...ok, key }, 'key');
    for (const key of ['admin', 'editor', 'viewer', 'ADMIN']) await bad({ ...ok, key }, 'key');
    await bad({ key: 'good-key', permissions: [] }, 'name');
    await bad({ key: 'good-key', name: ' ', permissions: [] }, 'name');
    await bad({ key: 'good-key', name: 'n'.repeat(41), permissions: [] }, 'name');
    await bad({ key: 'good-key', name: 'N', description: 'd'.repeat(161), permissions: [] }, 'description');
    await bad({ key: 'good-key', name: 'N' }, 'permissions');
    await bad({ key: 'good-key', name: 'N', permissions: 'orders:view' }, 'permissions');
    await bad({ key: 'good-key', name: 'N', permissions: ['orders:view', 'orders:delete'] }, 'permissions');
    await bad({ key: 'good-key', name: 'N', permissions: ['nothing:view'] }, 'permissions');
    await bad({ key: 'good-key', name: 'N', permissions: [5] }, 'permissions');
    assert.equal(await Role.countDocuments(), 0);
    for (const key of ['abc', 'a'.repeat(30), 'support-2']) assert.equal((await mkRole({ key, name: 'N', permissions: [] })).status, 201, key);
    assert.equal((await mkRole({ key: 'abc', name: 'N', permissions: [] })).body.code, 'key_taken');
    assert.equal((await mkRole({ key: 'ABC', name: 'N', permissions: [] })).status, 409, 'keys are case-insensitive');
  });

  test('edit implies view: both are stored, duplicates collapse, the response and the store agree', async () => {
    const r = await mkRole({ key: 'ops', name: 'Ops', permissions: ['flags:edit', 'orders:view', 'flags:view', 'orders:view'] });
    assert.deepEqual(r.body.permissions, ['flags:view', 'flags:edit', 'orders:view']);
    assert.deepEqual((await Role.findOne({ key: 'ops' })).permissions, ['flags:view', 'flags:edit', 'orders:view']);
    assert.equal(r.body.operatorCount, 0);
  });

  test('at most 40 custom roles', async () => {
    await Role.insertMany(Array.from({ length: 40 }, (_, i) => ({ key: `role-${i}`, name: `R${i}`, permissions: [] })));
    const r = await mkRole({ key: 'one-too-many', name: 'X', permissions: [] });
    assert.deepEqual([r.status, r.body.code], [400, 'bad_role']);
    assert.match(r.body.fields.key, /40/);
    assert.equal((await call('POST', '/admin/roles/role-1/duplicate', { body: { key: 'dup', name: 'Dup' } })).status, 400);
  });

  test('PUT changes name / description / permissions (partial is fine); the key cannot change; unknown role is 404', async () => {
    await mkRole({ key: 'ops', name: 'Ops', description: 'old', permissions: ['flags:view'] });
    const r = await call('PUT', '/admin/roles/ops', { body: { name: 'Operations' } });
    assert.deepEqual([r.status, r.body.name, r.body.description, r.body.permissions], [200, 'Operations', 'old', ['flags:view']]);
    assert.equal((await call('PUT', '/admin/roles/ops', { body: { description: '' } })).body.description, '');
    assert.equal((await call('PUT', '/admin/roles/ops', { body: { permissions: ['orders:edit'] } })).body.permissions.join(), 'orders:view,orders:edit');
    assert.equal((await call('PUT', '/admin/roles/ops', { body: { key: 'other' } })).status, 400);
    assert.equal((await call('PUT', '/admin/roles/ops', { body: { name: '' } })).status, 400);
    assert.equal((await call('PUT', '/admin/roles/ops', { body: { permissions: ['x:y'] } })).status, 400);
    assert.equal((await call('PUT', '/admin/roles/nope', { body: { name: 'x' } })).status, 404);
    assert.equal((await call('DELETE', '/admin/roles/nope')).status, 404);
    assert.equal((await call('POST', '/admin/roles/nope/duplicate', { body: { key: 'abc', name: 'A' } })).status, 404);
  });
});

describe('guards', () => {
  test('GUARD 1/5 escalation: a caller can only grant what they hold - roles:edit included - and the answer lists the offending permissions', async () => {
    const me = caller('content:edit', 'orders:view');
    let r = await mkRole({ key: 'ok-role', name: 'Ok', permissions: ['content:edit', 'orders:view'] }, me);
    assert.equal(r.status, 201, 'everything held');
    r = await mkRole({ key: 'bad-1', name: 'Bad', permissions: ['content:view', 'money:edit', 'orders:edit', 'roles:edit'] }, me);
    assert.deepEqual([r.status, r.body.code], [403, 'escalation']);
    assert.deepEqual(r.body.permissions, ['money:view', 'money:edit', 'orders:edit'], 'roles:edit is held, the rest are listed in registry order');
    assert.equal(await Role.countDocuments({ key: 'bad-1' }), 0);
    const noRolesEdit = as(['roles:view', 'content:edit']);
    r = await mkRole({ key: 'bad-2', name: 'Bad', permissions: ['content:view'] }, noRolesEdit);
    assert.deepEqual([r.status, r.body.code], [403, 'forbidden'], 'without roles:edit nobody can create a role, so nobody can hand it out');
    r = await mkRole({ key: 'bad-3', name: 'Bad', permissions: ['roles:edit'] }, as(['roles:view', 'roles:edit']));
    assert.equal(r.status, 201, 'a caller who holds roles:edit may grant it');
    r = await mkRole({ key: 'bad-4', name: 'Bad', permissions: ['audit:view'] }, as(['roles:edit']));
    assert.deepEqual([r.status, r.body.code, r.body.permissions], [403, 'escalation', ['audit:view']]);
  });

  test('escalation on edit: only NEW rights are checked - a caller can rename a role, or take rights away, without holding what it already grants', async () => {
    await mkRole({ key: 'strong', name: 'Strong', permissions: ['money:edit', 'flags:view'] });
    const weak = as(['roles:view', 'roles:edit', 'flags:view']);
    assert.equal((await call('PUT', '/admin/roles/strong', { headers: weak, body: { name: 'Renamed', permissions: ['money:edit', 'flags:view'] } })).status, 200, 'unchanged rights are not a grant');
    assert.equal((await call('PUT', '/admin/roles/strong', { headers: weak, body: { permissions: ['flags:view'] } })).status, 200, 'taking rights away is fine');
    const r = await call('PUT', '/admin/roles/strong', { headers: weak, body: { permissions: ['flags:view', 'money:edit'] } });
    assert.deepEqual([r.status, r.body.code, r.body.permissions], [403, 'escalation', ['money:view', 'money:edit']], 'putting it back is a grant');
  });

  test('escalation on duplicate: copying a role you could not have built is refused', async () => {
    const weak = as(['roles:edit', 'overview:view']);
    const ok = await call('POST', '/admin/roles/viewer/duplicate', { headers: weak, body: { key: 'v-copy', name: 'Copy' } });
    assert.deepEqual([ok.status, ok.body.code], [403, 'escalation']);
    assert.ok(ok.body.permissions.length > 3);
    assert.equal(await Role.countDocuments(), 0);
  });

  test('GUARD built-ins are immutable: PUT / DELETE are 403 builtin; they can be duplicated into a custom role', async () => {
    for (const k of ['admin', 'editor', 'viewer']) {
      for (const [m, b] of [['PUT', { name: 'x' }], ['DELETE', undefined]]) {
        const r = await call(m, `/admin/roles/${k}`, { body: b });
        assert.deepEqual([r.status, r.body.code], [403, 'builtin'], `${m} ${k}`);
      }
    }
    const d = await call('POST', '/admin/roles/editor/duplicate', { body: { key: 'editor-plus', name: 'Editor plus' } });
    assert.equal(d.status, 201);
    assert.deepEqual([d.body.builtin, d.body.permissions], [false, ROLE_PERMISSIONS.editor]);
    assert.equal((await call('PUT', '/admin/roles/editor-plus', { body: { permissions: [...ROLE_PERMISSIONS.editor, 'flags:edit'] } })).status, 200);
    assert.deepEqual(await permissionsOfRole('editor'), ROLE_PERMISSIONS.editor, 'the preset is untouched');
  });

  test('GUARD 2 in-use: a role operators hold cannot be deleted (409 with the count); once they move it can', async () => {
    await mkRole({ key: 'support', name: 'Support', permissions: [] });
    const a = await mkOp('a1', 'support');
    await mkOp('a2', 'support');
    const r = await call('DELETE', '/admin/roles/support');
    assert.deepEqual([r.status, r.body.code, r.body.operators], [409, 'in_use', 2]);
    assert.equal(await Role.countDocuments({ key: 'support' }), 1);
    assert.equal((await call('PUT', `/admin/operators/${a._id}`, { body: { role: 'viewer' } })).status, 200);
    assert.equal((await call('DELETE', '/admin/roles/support')).body.operators, 1);
    await Operator.deleteOne({ username: 'a2' });
    assert.deepEqual((await call('DELETE', '/admin/roles/support')).body, { ok: true });
    assert.equal(await Role.countDocuments(), 0);
  });

  test('every role route needs roles:edit (writes) and the admin BFF', async () => {
    await mkRole({ key: 'support', name: 'Support', permissions: [] });
    for (const [m, p, b] of [['POST', '/admin/roles', { key: 'zzz', name: 'Z', permissions: [] }], ['PUT', '/admin/roles/support', { name: 'x' }], ['DELETE', '/admin/roles/support'], ['POST', '/admin/roles/support/duplicate', { key: 'zzz', name: 'Z' }]]) {
      for (const perms of [['roles:view'], ['operators:edit'], EDITOR, VIEWER]) assert.equal((await call(m, p, { headers: as(perms), body: b })).status, 403, `${m} ${p} ${perms.length}`);
      assert.equal((await call(m, p, { headers: as(ADMIN, rootId, 'monolith'), body: b })).status, 403, `${m} ${p} wrong issuer`);
    }
    assert.equal(await Role.countDocuments(), 1);
  });
});

describe('operators with custom roles', () => {
  test('create / update accept any EXISTING role key (400 unknown_role otherwise); the list carries roleName', async () => {
    await mkRole({ key: 'support', name: 'Support desk', permissions: ['orders:view'] });
    const mk = (b) => call('POST', '/admin/operators', { body: { username: 'newbie', password: 'long-enough-1', ...b } });
    const bad = await mk({ role: 'ghost' });
    assert.deepEqual([bad.status, bad.body.code], [400, 'unknown_role']);
    assert.equal((await mk({ role: 'support' })).status, 201);
    assert.equal((await Operator.findOne({ username: 'newbie' })).role, 'support');
    const up = await call('PUT', `/admin/operators/${(await Operator.findOne({ username: 'newbie' }))._id}`, { body: { role: 'viewer' } });
    assert.deepEqual([up.status, up.body.role, up.body.roleName], [200, 'viewer', 'Viewer']);
    assert.equal((await call('PUT', `/admin/operators/${(await Operator.findOne({ username: 'newbie' }))._id}`, { body: { role: 'ghost' } })).body.code, 'unknown_role');
    const list = (await call('GET', '/admin/operators')).body;
    assert.deepEqual(list.map((o) => [o.username, o.role, o.roleName]), [['root', 'admin', 'Administrator'], ['newbie', 'viewer', 'Viewer']]);
    await call('PUT', `/admin/operators/${(await Operator.findOne({ username: 'newbie' }))._id}`, { body: { role: 'support' } });
    assert.equal((await call('GET', '/admin/operators')).body[1].roleName, 'Support desk');
    assert.equal((await mkOp('x', 'editor')).role, 'editor', 'the model no longer restricts the role to three values');
    assert.equal((await mk({ username: 'default-role' })).status, 201);
    assert.equal((await Operator.findOne({ username: 'newbie' })).role, 'support');
  });

  test('GUARD escalation on assignment: you can only give a role whose permissions you hold; admin included', async () => {
    await mkRole({ key: 'mid', name: 'Mid', permissions: ['content:edit'] });
    const me = caller('content:edit');
    const mk = (role) => call('POST', '/admin/operators', { headers: me, body: { username: `u-${role}`, password: 'long-enough-1', role } });
    assert.equal((await mk('mid')).status, 201);
    const r = await mk('admin');
    assert.deepEqual([r.status, r.body.code], [403, 'escalation']);
    assert.ok(r.body.permissions.includes('operators:edit') || r.body.permissions.length > 5);
    assert.equal((await mk('viewer')).status, 403, 'viewer includes views this caller lacks');
    const target = await Operator.findOne({ username: 'u-mid' });
    assert.equal((await call('PUT', `/admin/operators/${target._id}`, { headers: me, body: { role: 'admin' } })).body.code, 'escalation');
    assert.equal((await Operator.findById(target._id)).role, 'mid');
  });

  test('GUARD escalation on takeover: an operator manager cannot reset the password, deactivate or delete someone who outranks them', async () => {
    const me = caller();
    const boss = await Operator.findOne({ username: 'root' });
    for (const [m, b] of [['PUT', { password: 'new-password-1' }], ['PUT', { active: false }], ['PUT', { role: 'viewer' }], ['DELETE', undefined]]) {
      const r = await call(m, `/admin/operators/${boss._id}`, { headers: me, body: b });
      assert.deepEqual([r.status, r.body.code], [403, 'escalation'], `${m} ${JSON.stringify(b)}`);
    }
    const peer = await mkOp('peer', 'viewer');
    await mkRole({ key: 'mini', name: 'Mini', permissions: ['overview:view'] });
    const meMini = as(['roles:view', 'roles:edit', 'operators:view', 'operators:edit', ...VIEWER.filter((p) => p !== 'overview:view')], 'x');
    assert.equal((await call('PUT', `/admin/operators/${peer._id}`, { headers: meMini, body: { password: 'new-password-1' } })).status, 403, 'a viewer is above this caller (overview:view is missing)');
    assert.equal((await call('PUT', `/admin/operators/${peer._id}`, { headers: as(ADMIN, 'someone'), body: { password: 'new-password-1' } })).status, 200);
    assert.equal(JSON.stringify((await Operator.findById(boss._id)).passwordHash).includes('new-password'), false);
  });

  test('GUARD 4 own role: you cannot change your own role (own_role), even to a "better" one; staying put is fine', async () => {
    const op = await mkOp('selfish', 'editor');
    const self = as(ADMIN, String(op._id));
    for (const role of ['admin', 'viewer']) {
      const r = await call('PUT', `/admin/operators/${op._id}`, { headers: self, body: { role } });
      assert.deepEqual([r.status, r.body.code], [400, 'own_role'], role);
    }
    assert.equal((await call('PUT', `/admin/operators/${op._id}`, { headers: self, body: { role: 'editor' } })).status, 200);
    const root = await call('PUT', `/admin/operators/${rootId}`, { headers: as(ADMIN, rootId), body: { role: 'editor' } });
    assert.deepEqual([root.status, root.body.error], [400, 'You cannot remove your own admin access']);
  });

  test('GUARD 3 last admin: the only active built-in admin can be neither demoted, deactivated nor deleted by someone else; custom roles do not count as admin', async () => {
    await mkRole({ key: 'almost-admin', name: 'Almost', permissions: ADMIN });
    const stand = await mkOp('stand-in', 'almost-admin');
    const by = as(ADMIN, String(stand._id));
    for (const [m, b] of [['PUT', { role: 'viewer' }], ['PUT', { active: false }], ['DELETE', undefined]]) {
      const r = await call(m, `/admin/operators/${rootId}`, { headers: by, body: b });
      assert.deepEqual([r.status, r.body.error], [400, 'This is the only admin left'], `${m}`);
    }
    const second = await mkOp('admin2', 'admin');
    assert.equal((await call('PUT', `/admin/operators/${rootId}`, { headers: as(ADMIN, String(second._id)), body: { role: 'editor' } })).status, 200);
    assert.equal((await call('PUT', `/admin/operators/${second._id}`, { headers: as(ADMIN, rootId), body: { active: false } })).status, 400, 'now admin2 is the last one');
  });

  test('a deactivated admin does not count towards "another admin exists"', async () => {
    await mkOp('sleeper', 'admin', false);
    const r = await call('PUT', `/admin/operators/${rootId}`, { headers: as(ADMIN, 'someone-else'), body: { role: 'viewer' } });
    assert.equal(r.body.error, 'This is the only admin left');
  });
});

describe('audit: before / after on role and operator writes', () => {
  test('role create / edit / duplicate / delete each report before and after (no extra fields)', async () => {
    const c = await mkRole({ key: 'ops', name: 'Ops', permissions: ['flags:view'] });
    assert.deepEqual(c.audit, { before: null, after: { key: 'ops', name: 'Ops', description: '', permissions: ['flags:view'] } });
    const u = await call('PUT', '/admin/roles/ops', { body: { permissions: ['flags:edit'] } });
    assert.deepEqual([u.audit.before.permissions, u.audit.after.permissions], [['flags:view'], ['flags:view', 'flags:edit']]);
    const d = await call('POST', '/admin/roles/ops/duplicate', { body: { key: 'ops-2', name: 'Ops 2' } });
    assert.deepEqual([d.audit.before, d.audit.after.key], [null, 'ops-2']);
    const x = await call('DELETE', '/admin/roles/ops-2');
    assert.deepEqual([x.audit.before.key, x.audit.after], ['ops-2', null]);
  });

  test('operator role changes report the role, never a password', async () => {
    const op = await mkOp('sam', 'viewer');
    const r = await call('PUT', `/admin/operators/${op._id}`, { body: { role: 'editor', password: 'brand-new-password' } });
    assert.deepEqual([r.audit.before.role, r.audit.after.role], ['viewer', 'editor']);
    assert.equal(JSON.stringify(r.audit).toLowerCase().includes('password'), false);
    assert.equal(JSON.stringify(r.audit).includes('brand-new'), false);
    const c = await call('POST', '/admin/operators', { body: { username: 'created-op', password: 'long-enough-1', role: 'viewer' } });
    assert.deepEqual([c.audit.after.username, c.audit.after.role], ['created-op', 'viewer']);
  });
});

describe('GET /admin/audit-log: filters, cursor paging, before/after (area audit)', () => {
  const entry = (i, over = {}) => ({ operator: 'root', role: 'admin', area: 'content', method: 'PUT', path: `/api/content/deities/${i}`, targetId: String(i), status: 200, ...over });
  const post = (b) => call('POST', '/audit', { body: b });

  test('admin only (audit:view): editors, viewers and operators:view holders are 403', async () => {
    for (const perms of [EDITOR, VIEWER, ['operators:view', 'operators:edit'], ['roles:edit']]) assert.equal((await call('GET', '/admin/audit-log', { headers: as(perms) })).status, 403);
    assert.equal((await call('GET', '/admin/audit-log', { headers: as(['audit:view']) })).status, 200);
    assert.equal((await call('GET', '/admin/audit-log', { headers: as(ADMIN, rootId, 'monolith') })).status, 403);
  });

  test('items are newest first with the contract fields; before/after/selfApproved come back; secrets never get in', async () => {
    await post(entry(1));
    await post(entry(2, { operator: 'bob', area: 'releases', method: 'PUT', path: '/api/admin/version-policy', targetId: undefined, before: { minVersionCode: 3 }, after: { minVersionCode: 5, password: 'leak', maintenance: { allowUids: ['u'], phone: '+91' } }, selfApproved: true }));
    const r = (await call('GET', '/admin/audit-log')).body;
    assert.deepEqual(r.items.map((x) => x.operator), ['bob', 'root']);
    assert.equal(r.next, null);
    const [a, b] = r.items;
    assert.deepEqual(Object.keys(b).sort(), ['area', 'at', 'id', 'method', 'operator', 'path', 'role', 'status', 'targetId']);
    assert.equal(b.targetId, '1');
    assert.deepEqual([a.before, a.after, a.selfApproved, a.area, a.targetId], [{ minVersionCode: 3 }, { minVersionCode: 5, maintenance: { allowUids: ['u'] } }, true, 'releases', null]);
    assert.equal(JSON.stringify(r).includes('leak'), false);
    assert.equal(JSON.stringify(r).includes('+91'), false);
    assert.match(a.id, /^[0-9a-f]{24}$/);
  });

  test('cursor paging: `next` is an opaque id, walks every row exactly once newest-first, and is null on the last page', async () => {
    for (let i = 0; i < 7; i++) await post(entry(i));
    const seen = [];
    let cursor;
    let pages = 0;
    do {
      const r = (await call('GET', `/admin/audit-log?limit=3${cursor ? `&before=${cursor}` : ''}`)).body;
      seen.push(...r.items.map((x) => x.targetId));
      cursor = r.next;
      pages++;
    } while (cursor && pages < 10);
    assert.deepEqual(seen, ['6', '5', '4', '3', '2', '1', '0']);
    assert.equal(pages, 3);
    const exact = (await call('GET', '/admin/audit-log?limit=7')).body;
    assert.deepEqual([exact.items.length, exact.next], [7, null], 'a page that ends exactly at the last row has no next');
    assert.equal((await call('GET', '/admin/audit-log?limit=0')).body.items.length, 7, 'a bad limit falls back to the default');
    assert.equal((await call('GET', '/admin/audit-log?limit=99999')).status, 200);
    assert.equal((await call('GET', '/admin/audit-log?limit=abc')).status, 200);
  });

  test('filters: operator, area, method (case-insensitive), from / to on the time; they combine', async () => {
    await post(entry(1, { operator: 'bob', area: 'releases', method: 'POST' }));
    await post(entry(2, { operator: 'bob', area: 'content', method: 'PUT' }));
    await post(entry(3, { operator: 'root', area: 'releases', method: 'PUT' }));
    const ids = async (q) => (await call('GET', `/admin/audit-log?${q}`)).body.items.map((x) => x.targetId).sort();
    assert.deepEqual(await ids('operator=bob'), ['1', '2']);
    assert.deepEqual(await ids('operator=BOB'), ['1', '2']);
    assert.deepEqual(await ids('area=releases'), ['1', '3']);
    assert.deepEqual(await ids('method=put'), ['2', '3']);
    assert.deepEqual(await ids('operator=bob&area=releases&method=POST'), ['1']);
    assert.deepEqual(await ids('operator=nobody'), []);
    const rows = await AuditLog.find().sort({ _id: 1 }).lean();
    await AuditLog.updateOne({ _id: rows[0]._id }, { $set: { at: new Date('2026-01-01T00:00:00Z') } });
    await AuditLog.updateOne({ _id: rows[1]._id }, { $set: { at: new Date('2026-02-01T00:00:00Z') } });
    await AuditLog.updateOne({ _id: rows[2]._id }, { $set: { at: new Date('2026-03-01T00:00:00Z') } });
    assert.deepEqual(await ids('from=2026-01-15'), ['2', '3']);
    assert.deepEqual(await ids('to=2026-02-15'), ['1', '2']);
    assert.deepEqual(await ids('from=2026-01-15&to=2026-02-15'), ['2']);
    assert.deepEqual(await ids('from=2026-02-01T00:00:00Z&to=2026-02-01T00:00:00Z'), ['2'], 'inclusive');
  });

  test('bad filters are a 400 bad_filter with the field', async () => {
    for (const [q, f] of [['from=yesterday', 'from'], ['to=never', 'to'], ['before=zzz', 'before'], ['before=123', 'before']]) {
      const r = await call('GET', `/admin/audit-log?${q}`);
      assert.deepEqual([r.status, r.body.code, Object.keys(r.body.fields)], [400, 'bad_filter', [f]], q);
    }
  });

  test('POST /audit stores before/after sanitised and bounded, never trusts the caller to have cleaned them', async () => {
    await post(entry(1, { before: { password: 'x', ok: 1 }, after: { big: 'z'.repeat(20000) } }));
    const row = await AuditLog.findOne().lean();
    assert.deepEqual(row.before, { ok: 1 });
    assert.ok(JSON.stringify(row.after).length < 1000, 'clipped');
    assert.equal((await call('POST', '/audit', { headers: as(ADMIN, rootId, 'mobile-bff'), body: entry(2) })).status, 403);
  });
});

describe('directory: how many may approve', () => {
  test('counts ACTIVE operators whose resolved role holds the permission - built-in and custom; engagement only; counts only', async () => {
    const eng = as([], 'x', 'engagement');
    assert.equal((await call('GET', '/directory/approvers?perm=approvals:edit', { headers: eng })).body.count, 1, 'root');
    await mkRole({ key: 'approver', name: 'Approver', permissions: ['approvals:edit'] });
    await mkRole({ key: 'looker', name: 'Looker', permissions: ['approvals:view'] });
    await mkOp('a', 'approver');
    await mkOp('b', 'approver', false);
    await mkOp('c', 'looker');
    await mkOp('d', 'editor');
    await mkOp('e', 'ghost');
    await mkOp('f', 'admin');
    const r = await call('GET', '/directory/approvers?perm=approvals:edit', { headers: eng });
    assert.deepEqual(r.body, { perm: 'approvals:edit', count: 3 });
    assert.equal((await call('GET', '/directory/approvers?perm=approvals:view', { headers: eng })).body.count, 5, 'edit implies view: root, a, c, d (editor), f; not inactive b or ghost e');
    assert.equal((await call('GET', '/directory/approvers?perm=nonsense', { headers: eng })).status, 400);
    assert.equal((await call('GET', '/directory/approvers', { headers: eng })).body.perm, 'approvals:edit', 'defaults to the approver permission');
    for (const iss of ['admin-bff', 'mobile-bff', 'events']) assert.equal((await call('GET', '/directory/approvers', { headers: as([], 'x', iss) })).status, 403, iss);
  });
});

describe('boot migration of operator roles', () => {
  test('rows without a role become editor, stray case / spaces are normalised, custom and built-in keys are untouched; idempotent', async () => {
    await Operator.collection.insertMany([
      { username: 'norole', passwordHash: 'x', active: true },
      { username: 'shouty', passwordHash: 'x', role: 'Editor ', active: true },
      { username: 'custom', passwordHash: 'x', role: 'support-desk', active: true },
      { username: 'viewer1', passwordHash: 'x', role: 'viewer', active: true },
    ]);
    await migrateOperatorRoles();
    await migrateOperatorRoles();
    const roles = Object.fromEntries((await Operator.collection.find().toArray()).map((o) => [o.username, o.role]));
    assert.deepEqual([roles.norole, roles.shouty, roles.custom, roles.viewer1, roles.root], ['editor', 'editor', 'support-desk', 'viewer', 'admin']);
  });

  test('the seed runs it, and an existing database with only the three built-in roles needs no Role rows', async () => {
    assert.equal(await Role.countDocuments(), 0);
    assert.equal((await call('GET', '/admin/roles')).body.roles.length, 3);
  });
});
