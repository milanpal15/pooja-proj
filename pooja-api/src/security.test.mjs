// Regression tests for the hardening found by the API security review:
// each one is an attack or failure that was reproduced against the old code.
//
// NODE_ENV is set before anything is imported so the "never fail open in
// production" test sees a production config. `node --test` runs each file in
// its own process, so this does not leak into other suites.
process.env.NODE_ENV = 'production';
process.env.ADMIN_SESSION_SECRET = 'security-test-secret';

import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, test } from 'node:test';

import express from 'express';
import mongoose from 'mongoose';

const URI = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27117/security_test';
const dbUri = () => {
  const u = new URL(URI);
  u.pathname = '/security_test';
  return u.toString();
};

const { analytics } = await import('./modules/analytics/analytics.routes.js');
const { announcements } = await import('./modules/announcements/announcements.routes.js');
const { policies } = await import('./modules/policies/policies.routes.js');
const { uploadRoutes } = await import('./modules/media/upload.routes.js');
const { uploads } = await import('./modules/media/uploads.routes.js');
const { mountAdminAuth } = await import('./modules/operators/login.routes.js');
const { createLimiter } = await import('./modules/operators/login-limiter.js');
const { hashPassword } = await import('./modules/operators/passwords.js');
const { PUBLIC, requireAdmin } = await import('./middleware/access.js');
const { Operator, User, Visitor } = await import('./models.js');

let server;
let base;
let canAll = true;

before(async () => {
  await mongoose.connect(dbUri());
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.can = (perm) => canAll || perm === 'overview:view';
    next();
  });
  mountAdminAuth(app);
  app.use('/api', requireAdmin); // the real gate, real PUBLIC list
  app.use('/api', analytics);
  app.use('/api', announcements);
  app.use('/api', policies);
  app.use('/api/content', uploadRoutes);
  app.use('/uploads', uploads);
  server = http.createServer(app);
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await new Promise((ok) => server.close(ok));
});

const call = async (method, path, body, headers = {}) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, json, text, headers: res.headers };
};

describe('the gate never fails open in production', () => {
  test('with no operator at all, admin routes answer 503 instead of opening', async () => {
    assert.equal(await Operator.countDocuments(), 0);
    const r = await call('GET', '/api/visitors');
    assert.equal(r.status, 503);
    assert.equal(r.json.code, 'no_operators');
  });

  test('public routes still work with no operator', async () => {
    const r = await call('POST', '/api/ingest/session', { deviceId: 'd-open' });
    assert.equal(r.status, 200);
  });
});

describe('public ingest', () => {
  test('there is no public payment ingest any more', async () => {
    assert.ok(!PUBLIC.some((r) => r.path.test('/ingest/payment')), 'not on the allowlist');
    const r = await call('POST', '/api/ingest/payment', { amount: 99999999, status: 'success' });
    assert.notEqual(r.status, 200, 'a stranger can no longer forge revenue');
  });

  test('a query operator in place of a deviceId is refused, not executed', async () => {
    await Visitor.create({ deviceId: 'victim', model: 'Pixel' });
    const r = await call('POST', '/api/ingest/session', { deviceId: { $ne: null }, model: 'HACKED' });
    assert.equal(r.status, 400);
    assert.equal((await Visitor.findOne({ deviceId: 'victim' })).model, 'Pixel');
  });

  test('fields are bounded strings', async () => {
    await call('POST', '/api/ingest/session', { deviceId: 'd-long', model: 'x'.repeat(5000), os: { a: 1 } });
    const v = await Visitor.findOne({ deviceId: 'd-long' });
    assert.equal(v.model.length, 120);
    assert.equal(v.os, undefined);
  });

  test('push registration takes strings only', async () => {
    await Visitor.create({ deviceId: 'dev-push', pushToken: 'ExponentPushToken[orig]' });
    const r = await call('POST', '/api/push/register', { deviceId: { $ne: null }, pushToken: 'ExponentPushToken[evil]' });
    assert.equal(r.status, 400);
    assert.equal((await Visitor.findOne({ deviceId: 'dev-push' })).pushToken, 'ExponentPushToken[orig]');
  });
});

describe('policy acceptance', () => {
  test('is no longer anonymous, and an operator in the body updates nobody', async () => {
    await User.create({ uid: 'u-policy', contact: 'policy@example.com', name: 'P' });
    const r = await call('POST', '/api/policy/terms/accept', { contact: { $ne: null }, version: 9 });
    assert.ok([401, 403, 503].includes(r.status), `expected a refusal, got ${r.status}`);
    const u = await User.findOne({ uid: 'u-policy' }).lean();
    assert.equal(u.acceptedPolicies?.terms, undefined);
  });
});

describe('admin login throttle', () => {
  before(async () => {
    await Operator.create({ username: 'throttle-admin', passwordHash: hashPassword('correct horse'), role: 'admin' });
  });

  test('a long password is refused without being hashed', async () => {
    const t = Date.now();
    const r = await call('POST', '/api/admin/login', { username: 'someone-else', password: 'x'.repeat(100_000) });
    assert.equal(r.status, 401);
    assert.ok(Date.now() - t < 500);
  });

  test('ten wrong passwords lock that client out; the right one then still waits', async () => {
    for (let i = 0; i < 10; i++) {
      const r = await call('POST', '/api/admin/login', { username: 'throttle-admin', password: `wrong-${i}` });
      assert.equal(r.status, 401, `attempt ${i}`);
    }
    const blocked = await call('POST', '/api/admin/login', { username: 'throttle-admin', password: 'correct horse' });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.json.code, 'rate_limited');
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  });

  test('the limiter counts, expires and resets', () => {
    let t = 0;
    const l = createLimiter({ max: 3, windowMs: 1000, now: () => t });
    for (let i = 0; i < 3; i++) l.fail('k');
    assert.equal(l.check('k').blocked, true);
    assert.equal(l.check('other').blocked, false);
    t = 1001;
    assert.equal(l.check('k').blocked, false, 'the window expires');
    l.fail('k');
    l.reset('k');
    assert.equal(l.check('k').blocked, false, 'a success clears it');
  });
});

describe('uploads', () => {
  let cookie = '';

  // The real gate now requires an operator; an editor has `content:edit`, which
  // is exactly the role the stored-XSS escalation started from.
  before(async () => {
    await Operator.create({ username: 'uploader', passwordHash: hashPassword('upload pass'), role: 'editor' });
    const r = await call('POST', '/api/admin/login', { username: 'uploader', password: 'upload pass' });
    assert.equal(r.status, 200);
    cookie = r.headers.get('set-cookie').split(';')[0];
  });

  const upload = async (name, type, body = 'bytes') => {
    const form = new FormData();
    form.append('file', new Blob([body], { type }), name);
    const res = await fetch(`${base}/api/content/upload`, { method: 'POST', headers: { cookie }, body: form });
    return { status: res.status, json: await res.json() };
  };

  test('html and svg uploads are refused', async () => {
    assert.equal((await upload('evil.html', 'text/html', '<script>alert(1)</script>')).status, 415);
    assert.equal((await upload('evil.svg', 'image/svg+xml', '<svg onload=alert(1)/>')).status, 415);
    assert.equal((await upload('noextension', 'image/png')).status, 415);
  });

  test('a file named .png but reported as html is served as an image, never as html', async () => {
    const up = await upload('trick.png', 'text/html', '<script>alert(document.domain)</script>');
    assert.equal(up.status, 200);
    const got = await fetch(`${base}${up.json.url}`);
    assert.equal(got.headers.get('content-type'), 'image/png');
    assert.equal(got.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(got.headers.get('content-security-policy'), 'sandbox');
  });

  test('audio and images are still accepted', async () => {
    assert.equal((await upload('a.mp3', 'audio/mpeg')).status, 200);
    assert.equal((await upload('b.JPG', 'application/octet-stream')).status, 200);
  });

  test('an upload error does not echo the internal message', async () => {
    const res = await fetch(`${base}/api/content/upload`, { method: 'POST', headers: { cookie, 'content-type': 'multipart/form-data; boundary=x' }, body: 'garbage' });
    assert.ok([400, 500].includes(res.status));
    assert.doesNotMatch(await res.text(), /Boundary|Unexpected end|multipart/i);
  });
});

describe('visitors (was a 500 for everyone)', () => {
  const login = async (username, password) => {
    const r = await call('POST', '/api/admin/login', { username, password });
    assert.equal(r.status, 200, `login ${username}`);
    return r.headers.get('set-cookie').split(';')[0];
  };

  before(async () => {
    await Operator.create({ username: 'visitor-admin', passwordHash: hashPassword('admin pass 1'), role: 'admin' });
    await Operator.create({ username: 'visitor-viewer', passwordHash: hashPassword('viewer pass 1'), role: 'viewer' });
    await Visitor.deleteMany({});
    await Visitor.create({ deviceId: 'dev-vis', model: 'Pixel', pushToken: 'ExponentPushToken[secret]' });
  });

  test('answers 200 for an admin, who sees push tokens', async () => {
    const r = await call('GET', '/api/visitors', null, { cookie: await login('visitor-admin', 'admin pass 1') });
    assert.equal(r.status, 200);
    assert.equal(r.json[0].pushToken, 'ExponentPushToken[secret]');
  });

  test('answers 200 for a viewer, without the push token', async () => {
    const r = await call('GET', '/api/visitors', null, { cookie: await login('visitor-viewer', 'viewer pass 1') });
    assert.equal(r.status, 200);
    assert.equal(r.json[0].model, 'Pixel');
    assert.equal(r.json[0].pushToken, undefined);
    assert.doesNotMatch(r.text, /secret/);
  });
});
