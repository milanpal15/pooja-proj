// Run: TEST_MONGODB_URI=mongodb://127.0.0.1:27161/x node --test --test-concurrency=1 src/identity.test.mjs
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, test } from 'node:test';

import { ROLE_PERMISSIONS, signServiceToken } from '@bhakti/common';
import mongoose from 'mongoose';

import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { connectDb } from './db.js';
import { hashPassword } from './lib/passwords.js';
import { AuditLog, Operator, Policy, User } from './models/index.js';
import { ensureFirstOperator, seedIdentity } from './seed.js';

const SECRET = 'test-secret-test-secret-1234';
const base = new URL(process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27161/x');
const config = loadConfig({ INTERNAL_JWT_SECRET: SECRET, MONGODB_URI: `${base.protocol}//${base.host}`, DB_NAME: 'identity_test', ADMIN_PASSWORD: 'first-admin-pass', ADMIN_USERNAME: 'Root' });

const ADMIN = ROLE_PERMISSIONS.admin;
const EDITOR = ROLE_PERMISSIONS.editor;

let server;
let url;
let ready = false;
const fb = { revoked: [], deleted: [], async revokeUser(u) { this.revoked.push(u); }, async deleteFirebaseUser(u) { this.deleted.push(u); } };
/** Fake monolith astrologer lookups. */
const astro = {
  mode: 'none', // none | active | down
  claims: [],
  async claim(decoded) {
    this.claims.push(decoded);
    if (this.mode === 'down') throw new Error('down');
    return this.mode === 'active' ? { id: 'a1', name: 'Pandit Ji' } : null;
  },
  async active() {
    if (this.mode === 'down') throw new Error('down');
    return this.mode === 'active' ? { id: 'a1', name: 'Pandit Ji' } : null;
  },
};

before(async () => {
  await connectDb(config);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  const app = createApp(config, { isReady: () => ready, logger: { info() {}, warn() {}, error() {} }, firebase: fb, astrologers: astro });
  server = http.createServer(app);
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((ok) => server.close(ok));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const tok = (o = {}) => signServiceToken({ iss: 'mobile-bff', sub: 'uid-1', ...o }, { secret: SECRET });
const devotee = (uid = 'uid-1', tokInfo = {}, extra = {}) => ({ authorization: `Bearer ${tok({ sub: uid, role: 'devotee', ctx: { tok: { phone_number: '+919800000001', provider: 'phone', ...tokInfo } }, ...extra })}` });
const admin = (perms = ADMIN, sub = 'op-self', extra = {}) => ({ authorization: `Bearer ${tok({ iss: 'admin-bff', sub, role: 'admin', perms, ...extra })}` });
const svc = (iss = 'monolith', perms = []) => ({ authorization: `Bearer ${tok({ iss, sub: null, perms })}` });

async function call(method, path, { headers = devotee(), body } = {}) {
  const res = await fetch(`${url}/internal/identity${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { status: res.status, body: json };
}

describe('health, seeding and the first operator', () => {
  test('/health is 503 until seeded, then 200 (no token needed)', async () => {
    let r = await fetch(`${url}/health`);
    assert.equal(r.status, 503);
    assert.equal(await seedIdentity(config), 'created');
    ready = true;
    r = await fetch(`${url}/health`);
    assert.equal(r.status, 200);
    assert.equal((await fetch(`${url}/health/deps`)).status, 200);
  });

  test('seeds the default policy and the first admin (username lower-cased); a second run changes nothing', async () => {
    const op = await Operator.findOne();
    assert.equal(op.username, 'root');
    assert.equal(op.role, 'admin');
    assert.match(op.passwordHash, /^scrypt\$/);
    assert.equal((await Policy.findOne({ key: 'terms' })).version, 1);
    await Policy.updateOne({ key: 'terms' }, { $set: { title: 'Edited by an operator' } });
    assert.equal(await seedIdentity(config), 'exists');
    assert.equal((await Policy.findOne({ key: 'terms' })).title, 'Edited by an operator', 'never overwrites an edit');
    assert.equal(await Operator.countDocuments(), 1);
  });

  test('no operators and no ADMIN_PASSWORD is reported, so the server can refuse to run in production', async () => {
    await Operator.deleteMany({});
    assert.equal(await ensureFirstOperator({ ...config, adminPassword: '' }), 'none');
    assert.equal(await Operator.countDocuments(), 0);
    await ensureFirstOperator(config); // restore
    assert.equal(await Operator.countDocuments(), 1);
  });
});

describe('who may call (service JWT)', () => {
  test('no token / garbage / bad signature / expired / unlisted issuer -> 401', async () => {
    assert.equal((await call('GET', '/auth/me', { headers: {} })).status, 401);
    assert.equal((await call('GET', '/auth/me', { headers: { authorization: 'Bearer not.a.jwt' } })).status, 401);
    const forged = signServiceToken({ iss: 'mobile-bff', sub: 'x' }, { secret: 'a-different-secret-1234567' });
    assert.equal((await call('GET', '/auth/me', { headers: { authorization: `Bearer ${forged}` } })).status, 401);
    const old = signServiceToken({ iss: 'mobile-bff', sub: 'x' }, { secret: SECRET, now: Date.now() - 120_000 });
    const r = await call('GET', '/auth/me', { headers: { authorization: `Bearer ${old}` } });
    assert.equal(r.status, 401);
    assert.equal(r.body.code, 'token_expired');
    const stranger = signServiceToken({ iss: 'evil', sub: 'x' }, { secret: SECRET });
    assert.equal((await call('GET', '/auth/me', { headers: { authorization: `Bearer ${stranger}` } })).body.code, 'wrong_issuer');
  });

  test('a Firebase-looking token is never accepted', async () => {
    const fake = `${Buffer.from('{"alg":"RS256"}').toString('base64url')}.${Buffer.from('{"user_id":"u"}').toString('base64url')}.sig`;
    assert.equal((await call('GET', '/auth/me', { headers: { authorization: `Bearer ${fake}` } })).status, 401);
  });

  test('devotee routes are mobile-bff only; operator routes admin-bff only; directory is for services only', async () => {
    assert.equal((await call('GET', '/auth/me', { headers: admin() })).status, 403);
    assert.equal((await call('POST', '/auth/sync', { headers: svc('monolith'), body: {} })).status, 403);
    assert.equal((await call('GET', '/admin/users', { headers: devotee() })).status, 403);
    assert.equal((await call('GET', '/admin/operators', { headers: svc('monolith') })).status, 403);
    assert.equal((await call('POST', '/audit', { headers: devotee(), body: { operator: 'x' } })).status, 403);
    assert.equal((await call('GET', '/directory/users/uid-1', { headers: devotee() })).status, 403);
    assert.equal((await call('GET', '/directory/users/uid-1', { headers: admin() })).status, 403);
    assert.equal((await call('GET', '/auth/me', { headers: { authorization: `Bearer ${tok({ sub: null })}` } })).status, 401, 'a devotee token with no subject');
  });
});

describe('auth sync', () => {
  test('creates the account from the verified token; the body cannot set identity, role or blocked', async () => {
    const r = await call('POST', '/auth/sync', {
      headers: devotee('uid-1', { phone_number: '+919800000001', name: 'Token Name' }),
      body: { name: '  Asha  ', bio: 'hi', deviceId: 'dev-1', uid: 'evil', contact: 'evil', role: 'astrologer', blocked: true, phone: '+1' },
    });
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.uid, r.body.contact, r.body.method, r.body.phone, r.body.name, r.body.role, r.body.blocked], ['uid-1', '+919800000001', 'phone', '+919800000001', 'Asha', 'devotee', false]);
    const u = await User.findOne({ uid: 'uid-1' }).lean();
    assert.equal(u.deviceId, 'dev-1');
    assert.equal(u.role, 'devotee');
    // The account's creation time is handed to the app (the "new user" Home audience is decided on the device), as an ISO string.
    assert.equal(r.body.createdAt, new Date(u.createdAt).toISOString());
    const again = await call('POST', '/auth/sync', { headers: devotee('uid-1', { phone_number: '+919800000001' }), body: {} });
    assert.equal(again.body.createdAt, r.body.createdAt, 'a later sync never moves it');
    assert.equal(await User.countDocuments({ contact: 'evil' }), 0);
  });

  test('an empty body never blanks what the devotee already set; first sync falls back to the token name', async () => {
    await call('POST', '/auth/sync', { headers: devotee('uid-1'), body: {} });
    assert.equal((await User.findOne({ uid: 'uid-1' })).name, 'Asha');
    const r = await call('POST', '/auth/sync', { headers: devotee('uid-2', { phone_number: undefined, email: 'g@example.com', email_verified: true, provider: 'google.com', name: 'Gita G', picture: 'http://p' }), body: {} });
    assert.deepEqual([r.body.name, r.body.method, r.body.email, r.body.emailVerified, r.body.photoUrl, r.body.contact], ['Gita G', 'google', 'g@example.com', true, 'http://p', 'g@example.com']);
  });

  test('a provider email always wins; a typed email is unverified and only for phone sign-ins; dob/gender are validated', async () => {
    const typed = await call('POST', '/auth/sync', { headers: devotee('uid-3', { phone_number: '+919800000003' }), body: { email: 'Typed@Example.com', gender: 'female', dob: '1990-05-17' } });
    assert.deepEqual([typed.body.email, typed.body.emailVerified, typed.body.gender, typed.body.dob], ['typed@example.com', false, 'female', '1990-05-17']);
    const bad = await call('POST', '/auth/sync', { headers: devotee('uid-3', { phone_number: '+919800000003' }), body: { email: 'nope', gender: 'robot', dob: '2999-01-01' } });
    assert.deepEqual([bad.body.email, bad.body.gender, bad.body.dob], ['typed@example.com', 'female', '1990-05-17']);
    const google = await call('POST', '/auth/sync', { headers: devotee('uid-2', { phone_number: undefined, email: 'g@example.com', email_verified: true, provider: 'google.com' }), body: { email: 'other@example.com' } });
    assert.equal(google.body.email, 'g@example.com', 'a verified address is never overwritten by a typed one');
  });

  test('non-string body fields do not crash the service', async () => {
    const r = await call('POST', '/auth/sync', { headers: devotee('uid-1'), body: { name: { $ne: 1 }, bio: ['x'], deviceId: 42, email: { a: 1 } } });
    assert.equal(r.status, 200);
  });

  test('a pre-Firebase row (contact only, no uid) is ADOPTED, not duplicated', async () => {
    await User.collection.insertOne({ contact: '+919811111111', name: 'Old Devotee', createdAt: new Date() });
    const r = await call('POST', '/auth/sync', { headers: devotee('uid-adopt', { phone_number: '+919811111111' }), body: {} });
    assert.equal(r.status, 200);
    assert.equal(r.body.name, 'Old Devotee');
    assert.equal(await User.countDocuments({ contact: '+919811111111' }), 1);
    assert.equal((await User.findOne({ contact: '+919811111111' })).uid, 'uid-adopt');
  });

  test('two first-time syncs racing end in exactly one row', async () => {
    const h = devotee('uid-race', { phone_number: '+919822222222' });
    const rs = await Promise.all([1, 2, 3, 4].map(() => call('POST', '/auth/sync', { headers: h, body: { name: 'Race' } })));
    assert.ok(rs.every((r) => r.status === 200));
    assert.equal(await User.countDocuments({ uid: 'uid-race' }), 1);
  });

  test('a blocked account is refused 403 (second line behind the BFF)', async () => {
    await User.updateOne({ uid: 'uid-1' }, { $set: { blocked: true } });
    const r = await call('POST', '/auth/sync', { headers: devotee('uid-1'), body: {} });
    assert.equal(r.status, 403);
    assert.equal(r.body.error, 'account blocked');
    await User.updateOne({ uid: 'uid-1' }, { $set: { blocked: false } });
  });
});

describe('astrologer claim at sign-in', () => {
  test('an invited astrologer becomes one: role stored, name filled when empty, the token fields reach the claim', async () => {
    astro.mode = 'active';
    astro.claims = [];
    const r = await call('POST', '/auth/sync', { headers: devotee('uid-astro', { phone_number: '+919833333333', email: 'p@example.com', email_verified: true, provider: 'google.com' }), body: {} });
    assert.deepEqual([r.body.role, r.body.astrologer, r.body.name], ['astrologer', { id: 'a1', name: 'Pandit Ji' }, 'Pandit Ji']);
    assert.equal((await User.findOne({ uid: 'uid-astro' })).role, 'astrologer');
    assert.deepEqual(astro.claims[0], { uid: 'uid-astro', phone_number: '+919833333333', email: 'p@example.com', email_verified: true, picture: undefined, name: undefined, firebase: { sign_in_provider: 'google.com' } });
    const me = await call('GET', '/auth/me', { headers: devotee('uid-astro') });
    assert.equal(me.body.role, 'astrologer');
  });

  test('suspended (claim answers null) -> a devotee again', async () => {
    astro.mode = 'none';
    const r = await call('POST', '/auth/sync', { headers: devotee('uid-astro', { phone_number: '+919833333333' }), body: {} });
    assert.deepEqual([r.body.role, r.body.astrologer], ['devotee', null]);
    assert.equal((await User.findOne({ uid: 'uid-astro' })).role, 'devotee');
  });

  test('monolith unreachable: a devotee still signs in (degraded); an astrologer gets a clear 503, never a wrong shell', async () => {
    astro.mode = 'down';
    const ok = await call('POST', '/auth/sync', { headers: devotee('uid-1'), body: {} });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.role, 'devotee');
    await User.updateOne({ uid: 'uid-astro' }, { $set: { role: 'astrologer' } });
    const bad = await call('POST', '/auth/sync', { headers: devotee('uid-astro', { phone_number: '+919833333333' }), body: {} });
    assert.equal(bad.status, 503);
    assert.equal(bad.body.code, 'astrologer_unavailable');
    assert.equal((await call('GET', '/auth/me', { headers: devotee('uid-astro') })).status, 503);
    assert.equal((await call('GET', '/auth/me', { headers: devotee('uid-1') })).status, 200, 'a devotee needs no astrologer lookup for /me');
    astro.mode = 'none';
    await User.updateOne({ uid: 'uid-astro' }, { $set: { role: 'devotee' } });
  });
});

describe('profile and saved temples', () => {
  test('GET/PUT /me', async () => {
    assert.equal((await call('GET', '/auth/me', { headers: devotee('nobody') })).status, 404);
    const r = await call('PUT', '/auth/me', { headers: devotee('uid-1'), body: { name: 'Asha K', bio: 'b', gender: 'other', dob: '2001-02-03', email: 'asha@example.com' } });
    assert.deepEqual([r.body.name, r.body.bio, r.body.gender, r.body.dob, r.body.email, r.body.emailVerified], ['Asha K', 'b', 'other', '2001-02-03', 'asha@example.com', false]);
    assert.equal((await call('PUT', '/auth/me', { headers: devotee('nobody'), body: { name: 'x' } })).status, 404);
  });

  test('saved temples: validated, deduped, capped at 200, scoped to the token subject', async () => {
    assert.equal((await call('PUT', '/auth/saved-temples', { headers: devotee('uid-1'), body: { slugs: 'x' } })).status, 400);
    assert.equal((await call('PUT', '/auth/saved-temples', { headers: devotee('uid-1'), body: { slugs: [1] } })).status, 400);
    const r = await call('PUT', '/auth/saved-temples', { headers: devotee('uid-1'), body: { slugs: [' kashi ', 'kashi', '', 'puri'] } });
    assert.deepEqual(r.body.slugs, ['kashi', 'puri']);
    assert.deepEqual((await call('GET', '/auth/saved-temples', { headers: devotee('uid-1') })).body.slugs, ['kashi', 'puri']);
    assert.deepEqual((await call('GET', '/auth/saved-temples', { headers: devotee('uid-3') })).body.slugs, []);
    const big = await call('PUT', '/auth/saved-temples', { headers: devotee('uid-1'), body: { slugs: Array.from({ length: 300 }, (_, i) => `t${i}`) } });
    assert.equal(big.body.slugs.length, 200);
  });
});

describe('policies', () => {
  test('public read by both BFFs; 404 for an unknown key', async () => {
    assert.equal((await call('GET', '/policy/terms', { headers: devotee() })).body.key, 'terms');
    assert.equal((await call('GET', '/policy/terms', { headers: admin() })).status, 200);
    assert.equal((await call('GET', '/policy/nope', { headers: devotee() })).status, 404);
  });

  test('accept records the version for the TOKEN subject only; the key is a plain slug', async () => {
    const r = await call('POST', '/policy/terms/accept', { headers: devotee('uid-1'), body: { version: 3, contact: '+919822222222', uid: 'uid-race' } });
    assert.equal(r.status, 200);
    assert.equal((await User.findOne({ uid: 'uid-1' })).acceptedPolicies.get('terms'), 3);
    assert.equal((await User.findOne({ uid: 'uid-race' })).acceptedPolicies.get('terms'), undefined, 'a body cannot name another account');
    assert.equal((await call('POST', '/policy/a.b/accept', { headers: devotee('uid-1'), body: {} })).status, 400);
    assert.equal((await call('POST', '/policy/terms/accept', { headers: admin(), body: {} })).status, 403, 'only the device edge');
  });

  test('admin: list/save need policies:view / :edit; publish bumps the version, a plain save does not', async () => {
    assert.equal((await call('GET', '/admin/policies', { headers: admin(['content:edit']) })).status, 403);
    assert.equal((await call('GET', '/admin/policies', { headers: admin(EDITOR) })).status, 200, 'editor holds policies:view');
    assert.equal((await call('PUT', '/admin/policies/terms', { headers: admin(EDITOR), body: { title: 'x' } })).status, 403);
    const typo = await call('PUT', '/admin/policies/terms', { headers: admin(), body: { title: 'T', bodyMd: 'fixed typo' } });
    assert.equal(typo.body.version, 1);
    const pub = await call('PUT', '/admin/policies/terms?publish=1', { headers: admin(), body: { title: 'T', bodyMd: 'new rules' } });
    assert.equal(pub.body.version, 2);
    assert.equal((await call('PUT', '/admin/policies/bad.key', { headers: admin(), body: {} })).status, 400);
  });
});

describe('devotee administration', () => {
  test('POST /users stays 410', async () => {
    const r = await call('POST', '/admin/users', { headers: admin(), body: { contact: 'x', name: 'y' } });
    assert.equal(r.status, 410);
    assert.equal(r.body.error, 'gone');
  });

  test('list needs devotees:view; an editor (no devotees) is refused', async () => {
    assert.equal((await call('GET', '/admin/users', { headers: admin(EDITOR) })).status, 403);
    const r = await call('GET', '/admin/users');
    assert.equal(r.status, 403, 'a devotee token is not an operator');
    const ok = await call('GET', '/admin/users', { headers: admin() });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.length >= 4);
    assert.ok(ok.body.every((u, i, a) => i === 0 || new Date(a[i - 1].lastActive) >= new Date(u.lastActive)), 'newest activity first');
  });

  test('block: stored, Firebase refresh tokens revoked, the status route reports it; unblock does not revoke', async () => {
    const u = await User.findOne({ uid: 'uid-1' });
    fb.revoked = [];
    const r = await call('PUT', `/admin/users/${u._id}`, { headers: admin(), body: { blocked: true, name: 'Renamed', bio: 'bb', role: 'astrologer', uid: 'hijack' } });
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.blocked, r.body.name, r.body.role, r.body.uid], [true, 'Renamed', 'devotee', 'uid-1'], 'only name/bio/blocked are editable');
    assert.deepEqual(fb.revoked, ['uid-1']);
    const st = await call('GET', '/users/uid-1/status', { headers: devotee() });
    assert.deepEqual([st.body.exists, st.body.blocked], [true, true]);
    await call('PUT', `/admin/users/${u._id}`, { headers: admin(), body: { blocked: false } });
    assert.deepEqual(fb.revoked, ['uid-1']);
    assert.equal((await call('GET', '/users/uid-1/status', { headers: devotee() })).body.blocked, false);
    assert.equal((await call('PUT', '/admin/users/000000000000000000000009', { headers: admin(), body: { blocked: true } })).status, 404);
    assert.equal((await call('PUT', '/admin/users/not-an-id', { headers: admin(), body: {} })).status, 404);
  });

  test('delete removes the row AND the Firebase account', async () => {
    await call('POST', '/auth/sync', { headers: devotee('uid-del', { phone_number: '+919844444444' }), body: {} });
    const u = await User.findOne({ uid: 'uid-del' });
    fb.deleted = [];
    assert.equal((await call('DELETE', `/admin/users/${u._id}`, { headers: admin(EDITOR) })).status, 403);
    assert.equal((await call('DELETE', `/admin/users/${u._id}`, { headers: admin() })).status, 200);
    assert.equal(await User.countDocuments({ uid: 'uid-del' }), 0);
    assert.deepEqual(fb.deleted, ['uid-del']);
    assert.equal((await call('DELETE', `/admin/users/${u._id}`, { headers: admin() })).status, 200, 'idempotent');
    assert.deepEqual(fb.deleted, ['uid-del']);
  });

  test('status of an unknown uid is a harmless "not yet"', async () => {
    const st = await call('GET', '/users/never-seen/status', { headers: devotee() });
    assert.deepEqual(st.body, { exists: false, blocked: false, name: '', role: 'devotee' });
    assert.equal((await call('GET', '/users/uid-1/status', { headers: admin() })).status, 403);
  });
});

describe('operators: credentials, session, lockout refusals, audit', () => {
  let adminId;
  let editorId;
  test('login: right password, wrong password, unknown user, deactivated, over-long password', async () => {
    await Operator.create({ username: 'ed1', passwordHash: hashPassword('editor-pass-1'), role: 'editor' });
    editorId = String((await Operator.findOne({ username: 'ed1' }))._id);
    adminId = String((await Operator.findOne({ username: 'root' }))._id);
    const ok = await call('POST', '/operators/login', { headers: admin(), body: { username: ' ROOT ', password: 'first-admin-pass' } });
    assert.equal(ok.status, 200);
    assert.deepEqual([ok.body.id, ok.body.username, ok.body.role], [adminId, 'root', 'admin']);
    assert.deepEqual(ok.body.permissions, ADMIN);
    assert.ok((await Operator.findOne({ username: 'root' })).lastLogin);
    assert.equal(JSON.stringify(ok.body).includes('scrypt'), false, 'never a hash');
    for (const body of [{ username: 'root', password: 'nope' }, { username: 'ghost', password: 'first-admin-pass' }, { username: 'root', password: 'x'.repeat(257) }, {}]) {
      const bad = await call('POST', '/operators/login', { headers: admin(), body });
      assert.equal(bad.status, 401);
      assert.equal(bad.body.code, 'bad_credentials');
    }
    await Operator.updateOne({ username: 'ed1' }, { $set: { active: false } });
    assert.equal((await call('POST', '/operators/login', { headers: admin(), body: { username: 'ed1', password: 'editor-pass-1' } })).status, 401);
    await Operator.updateOne({ username: 'ed1' }, { $set: { active: true } });
    assert.equal((await call('POST', '/operators/login', { headers: devotee(), body: { username: 'root', password: 'first-admin-pass' } })).status, 403);
  });

  test('session: role comes from the record; deactivated or unknown is not authed; no operators = not required', async () => {
    let s = (await call('GET', `/operators/session?id=${editorId}`, { headers: admin() })).body;
    assert.deepEqual([s.required, s.authed, s.role, s.username], [true, true, 'editor', 'ed1']);
    assert.deepEqual(s.permissions, EDITOR);
    await Operator.updateOne({ username: 'ed1' }, { $set: { role: 'viewer' } });
    s = (await call('GET', `/operators/session?id=${editorId}`, { headers: admin() })).body;
    assert.equal(s.role, 'viewer', 'a demotion is visible on the very next call');
    await Operator.updateOne({ username: 'ed1' }, { $set: { role: 'editor', active: false } });
    assert.deepEqual((await call('GET', `/operators/session?id=${editorId}`, { headers: admin() })).body, { required: true, authed: false });
    await Operator.updateOne({ username: 'ed1' }, { $set: { active: true } });
    assert.deepEqual((await call('GET', '/operators/session?id=zzz', { headers: admin() })).body, { required: true, authed: false });
    assert.deepEqual((await call('GET', '/operators/session', { headers: admin() })).body, { required: true, authed: false });
    await Operator.updateMany({}, { $set: { active: false } });
    const open = (await call('GET', '/operators/session', { headers: admin() })).body;
    assert.deepEqual([open.required, open.authed, open.role], [false, true, 'admin']);
    await Operator.updateMany({}, { $set: { active: true } });
  });

  test('CRUD is admin-only (operators area) and validates', async () => {
    assert.equal((await call('GET', '/admin/operators', { headers: admin(EDITOR) })).status, 403);
    const list = await call('GET', '/admin/operators', { headers: admin() });
    assert.equal(list.status, 200);
    assert.ok(list.body.every((o) => o.passwordHash === undefined));
    const mk = (b) => call('POST', '/admin/operators', { headers: admin(), body: b });
    assert.equal((await mk({ username: 'AB', password: 'long-enough-1' })).status, 400);
    assert.equal((await mk({ username: 'valid.name', password: 'short' })).status, 400);
    assert.equal((await mk({ username: 'valid.name', password: 'long-enough-1', role: 'owner' })).status, 400);
    const made = await mk({ username: 'Valid.Name', password: 'long-enough-1' });
    assert.equal(made.status, 201);
    assert.deepEqual([made.body.username, made.body.role], ['valid.name', 'editor']);
    assert.equal((await mk({ username: 'valid.name', password: 'long-enough-1' })).status, 409);
    const login = await call('POST', '/operators/login', { headers: admin(), body: { username: 'valid.name', password: 'long-enough-1' } });
    assert.equal(login.status, 200);
    const up = await call('PUT', `/admin/operators/${made.body._id}`, { headers: admin(), body: { role: 'viewer', password: 'another-pass-1', active: false } });
    assert.deepEqual([up.body.role, up.body.active], ['viewer', false]);
    assert.equal(up.body.passwordHash, undefined);
    assert.equal((await call('PUT', `/admin/operators/${made.body._id}`, { headers: admin(), body: { password: 'short' } })).status, 400);
    assert.equal((await call('PUT', '/admin/operators/000000000000000000000009', { headers: admin(), body: {} })).status, 404);
    assert.equal((await call('DELETE', `/admin/operators/${made.body._id}`, { headers: admin() })).status, 200);
    assert.equal((await call('DELETE', `/admin/operators/${made.body._id}`, { headers: admin() })).status, 404);
  });

  test('lockout refusals: not yourself, not the last admin', async () => {
    const self = admin(ADMIN, adminId); // the BFF puts the operator id in `sub`
    assert.equal((await call('PUT', `/admin/operators/${adminId}`, { headers: self, body: { role: 'editor' } })).body.error, 'You cannot remove your own admin access');
    assert.equal((await call('PUT', `/admin/operators/${adminId}`, { headers: self, body: { active: false } })).body.error, 'You cannot deactivate yourself');
    assert.equal((await call('DELETE', `/admin/operators/${adminId}`, { headers: self })).body.error, 'You cannot delete your own account');
    // someone else tries to demote / deactivate / delete the only admin
    const other = admin(ADMIN, editorId);
    for (const [m, b] of [['PUT', { role: 'viewer' }], ['PUT', { active: false }], ['DELETE', undefined]]) {
      const r = await call(m, `/admin/operators/${adminId}`, { headers: other, body: b });
      assert.equal(r.status, 400);
      assert.equal(r.body.error, 'This is the only admin left');
    }
    assert.equal((await Operator.findById(adminId)).role, 'admin');
    // with a second admin the first may be demoted by them
    const second = await Operator.create({ username: 'admin2', passwordHash: hashPassword('admin2-pass-1'), role: 'admin' });
    assert.equal((await call('PUT', `/admin/operators/${adminId}`, { headers: admin(ADMIN, String(second._id)), body: { role: 'editor' } })).status, 200);
    await Operator.updateOne({ _id: adminId }, { $set: { role: 'admin' } });
    await Operator.deleteOne({ _id: second._id });
  });

  test('audit log: written only by the admin BFF, stores no bodies, read needs operators:view, newest first, limit clamped', async () => {
    assert.equal((await call('POST', '/audit', { headers: admin(), body: {} })).status, 400);
    const entry = { operator: 'root', role: 'admin', area: 'content', method: 'PUT', path: '/api/content/deities/1', targetId: '1', status: 200, bodyText: 'secret password', password: 'x' };
    assert.equal((await call('POST', '/audit', { headers: admin(), body: entry })).status, 200);
    await call('POST', '/audit', { headers: admin(), body: { operator: 'root', method: 'DELETE', path: '/api/users/9', status: 200 } });
    const row = await AuditLog.findOne({ path: '/api/content/deities/1' }).lean();
    assert.deepEqual([row.operator, row.area, row.targetId, row.status], ['root', 'content', '1', 200]);
    assert.equal(JSON.stringify(row).includes('secret'), false);
    assert.equal((await call('GET', '/admin/audit-log', { headers: admin(EDITOR) })).status, 403);
    const log = await call('GET', '/admin/audit-log?limit=1', { headers: admin() });
    assert.equal(log.body.entries.length, 1);
    assert.equal(log.body.entries[0].path, '/api/users/9', 'newest first');
    assert.equal((await call('GET', '/admin/audit-log?limit=99999', { headers: admin() })).status, 200);
    assert.equal((await call('POST', '/audit', { headers: svc('monolith'), body: entry })).status, 403);
  });
});

describe('directory (other services)', () => {
  test('one user, batch lookup, search, role', async () => {
    const one = await call('GET', '/directory/users/uid-1', { headers: svc('monolith') });
    assert.deepEqual([one.body.user.uid, one.body.user.deviceId, one.body.user.role], ['uid-1', 'dev-1', 'devotee']);
    assert.equal((await call('GET', '/directory/users/ghost', { headers: svc('monolith') })).status, 404);
    const many = await call('POST', '/directory/lookup', { headers: svc('wallet'), body: { uids: ['uid-1', 'uid-2', 'ghost'] } });
    assert.deepEqual(many.body.users.map((u) => u.uid).sort(), ['uid-1', 'uid-2']);
    assert.ok(many.body.users.every((u) => Object.keys(u).sort().join() === 'contact,name,uid'), 'names and contact only');
    assert.equal((await call('POST', '/directory/lookup', { headers: svc('monolith'), body: { uids: [{ $ne: 1 }] } })).status, 400);
    assert.equal((await call('POST', '/directory/lookup', { headers: svc('monolith'), body: { uids: Array.from({ length: 501 }, (_, i) => `u${i}`) } })).status, 400);
  });

  test('the events service may ask for names (batch lookup) and nothing else in the directory', async () => {
    const ok = await call('POST', '/directory/lookup', { headers: svc('events'), body: { uids: ['uid-1'] } });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body.users.map((u) => u.uid), ['uid-1']);
    for (const [m, p, body] of [['GET', '/directory/users/uid-1'], ['GET', '/directory/search?q=a'], ['PUT', '/directory/users/uid-1/role', { role: 'astrologer' }]]) {
      const r = await call(m, p, { headers: svc('events', ADMIN), body });
      assert.deepEqual([r.status, r.body.code], [403, 'wrong_issuer'], `${m} ${p}`);
    }
  });

  test('search is a search over PII: it needs devotees:view in the operator claims it carries', async () => {
    assert.equal((await call('GET', '/directory/search?q=asha', { headers: svc('monolith', EDITOR) })).status, 403);
    assert.equal((await call('GET', '/directory/search?q=asha', { headers: svc('monolith', []) })).status, 403);
    const r = await call('GET', '/directory/search?q=Renamed', { headers: svc('monolith', ADMIN) });
    assert.equal(r.status, 200);
    assert.equal(r.body.users[0].uid, 'uid-1');
    assert.deepEqual((await call('GET', '/directory/search?q=', { headers: svc('monolith', ADMIN) })).body.users, []);
    const rx = await call('GET', `/directory/search?q=${encodeURIComponent('.*')}`, { headers: svc('monolith', ADMIN) });
    assert.deepEqual(rx.body.users, [], 'the query is escaped, not a regex');
  });

  test('role writes accept devotee|astrologer only', async () => {
    assert.equal((await call('PUT', '/directory/users/uid-2/role', { headers: svc('calls'), body: { role: 'astrologer' } })).status, 200);
    assert.equal((await User.findOne({ uid: 'uid-2' })).role, 'astrologer');
    assert.equal((await call('PUT', '/directory/users/uid-2/role', { headers: svc('calls'), body: { role: 'admin' } })).status, 400);
    assert.equal((await call('GET', '/users/uid-2/status', { headers: devotee() })).body.role, 'astrologer');
    await call('PUT', '/directory/users/uid-2/role', { headers: svc('calls'), body: { role: 'devotee' } });
  });
});
