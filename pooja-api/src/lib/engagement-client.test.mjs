// Phase 1 monolith side: the engagement client, the ENGAGEMENT_URL switch and the retired routes.
// Run: TEST_MONGODB_URI=mongodb://127.0.0.1:27141/x node --test --test-concurrency=1 src/lib/engagement-client.test.mjs
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, afterEach, before, beforeEach, describe, mock, test } from 'node:test';

import mongoose from 'mongoose';

import { createApp } from '../app.js';
import { AuditLog, Operator, Setting } from '../models.js';
import { hashPassword } from '../modules/operators/index.js';
import { sign } from '../modules/operators/session.js';
import * as eng from './engagement-client.js';
import { getBoolSetting, getNumberSetting, ensureSetting } from './settings.js';
import { signServiceToken, verifyServiceToken } from './service-jwt.js';

const SECRET = 'test-secret-test-secret-1234';
const GOLDEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJtb25vbGl0aCIsInN1YiI6Im9wMSIsInJvbGUiOiJhZG1pbiIsInBlcm1zIjpbIm1vbmV5OmVkaXQiXSwicmVxSWQiOiJyMSIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxNzAwMDAwMDYwfQ.YFCXlm0KXLMkVoBf3adqOy80Y9Vo4S-O7NI3hYqk2-Q';
const dbUri = () => {
  const u = new URL(process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27141/x');
  u.pathname = '/engagement_client_tests';
  return u.toString();
};

// A stand-in for the engagement service.
let stub;
let stubUrl;
let hits;
let stubDown = false;
let settings = { prasadDelivery: '120', callsEnabled: 'false', minMinutes: '7' };
let announcement = { title: 'Diwali', body: 'b', severity: 'festival' };
let lastUpsert;
const stubHandler = (req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    hits.push({ method: req.method, url: req.url, auth: req.headers.authorization });
    if (stubDown) return req.socket.destroy();
    const claims = verifyServiceToken(req.headers.authorization?.replace(/^Bearer /, ''), { secret: SECRET, issuers: ['monolith'] });
    const json = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (!claims) return json(401, { error: 'no', code: 'bad_signature' });
    if (req.url === '/internal/engagement/settings/map') return json(200, { settings });
    if (req.url === '/internal/engagement/announcements/current') return json(200, { announcement });
    if (req.url.startsWith('/internal/engagement/visitors/')) return json(200, { pushToken: 'ExponentPushToken[abc]' });
    if (req.method === 'POST' && req.url === '/internal/engagement/settings/upsert') {
      lastUpsert = { claims, body: JSON.parse(raw) };
      if (!claims.perms.includes('money:edit')) return json(403, { error: "You don't have permission for that.", code: 'forbidden', needs: 'money:edit' });
      for (const i of lastUpsert.body.items) settings[i.key] = i.value;
      return json(200, { ok: true, count: lastUpsert.body.items.length });
    }
    json(404, { error: 'nope' });
  });
};

let server;
let base;
const cookies = {};
before(async () => {
  stub = http.createServer(stubHandler);
  await new Promise((ok) => stub.listen(0, '127.0.0.1', ok));
  stubUrl = `http://127.0.0.1:${stub.address().port}`;
  await mongoose.connect(dbUri());
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  for (const role of ['admin', 'editor']) {
    const o = await Operator.create({ username: `${role}1`, passwordHash: hashPassword('password-123'), role });
    cookies[role] = `pooja_admin=${encodeURIComponent(sign({ uid: String(o._id), role, exp: Date.now() + 3600_000 }))}`;
  }
});
after(async () => {
  stub.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
beforeEach(() => {
  hits = [];
  stubDown = false;
  settings = { prasadDelivery: '120', callsEnabled: 'false', minMinutes: '7' };
  process.env.INTERNAL_JWT_SECRET = SECRET;
  process.env.ENGAGEMENT_URL = stubUrl;
  eng._reset();
});
afterEach(() => {
  delete process.env.ENGAGEMENT_URL;
  mock.restoreAll();
});

describe('service-jwt', () => {
  test('matches the shared package byte for byte (golden vector) and round-trips', () => {
    const t = signServiceToken({ iss: 'monolith', sub: 'op1', role: 'admin', perms: ['money:edit'], reqId: 'r1' }, { secret: 'golden-secret-0123456789', now: 1_700_000_000_000 });
    assert.equal(t, GOLDEN);
    const c = verifyServiceToken(t, { secret: 'golden-secret-0123456789', now: 1_700_000_001_000 });
    assert.equal(c.iss, 'monolith');
    assert.equal(verifyServiceToken(t, { secret: 'golden-secret-0123456789', now: 1_700_000_061_000 }), null, 'expired');
    assert.equal(verifyServiceToken(t, { secret: 'another-secret-1234567', now: 1_700_000_001_000 }), null, 'wrong secret');
    assert.equal(verifyServiceToken(t, { secret: 'golden-secret-0123456789', now: 1_700_000_001_000, issuers: ['x'] }), null, 'wrong issuer');
  });
});

describe('engagement client', () => {
  test('signs a monolith-issued token and reads settings; 15 s cache serves the second read', async () => {
    assert.equal((await eng.getSettingsMap()).prasadDelivery, '120');
    assert.equal((await eng.getSettingsMap()).minMinutes, '7');
    assert.equal(hits.length, 1);
    assert.match(hits[0].auth, /^Bearer /);
  });

  test('the cache expires after the TTL', async () => {
    const t0 = Date.now();
    const now = mock.method(Date, 'now', () => t0);
    await eng.getSettingsMap();
    settings = { prasadDelivery: '1' };
    now.mock.mockImplementation(() => t0 + eng.TTL_MS - 1);
    assert.equal((await eng.getSettingsMap()).prasadDelivery, '120');
    now.mock.mockImplementation(() => t0 + eng.TTL_MS + 1);
    assert.equal((await eng.getSettingsMap()).prasadDelivery, '1');
    assert.equal(hits.length, 2);
  });

  test('engagement down: bundled defaults first, then the last good value; never throws; no hammering', async () => {
    stubDown = true;
    assert.deepEqual(await eng.getSettingsMap(), { ...eng.FALLBACK_SETTINGS });
    assert.equal(await eng.getCurrentAnnouncement(), null);
    assert.equal(await eng.getPushToken('d1'), null);
    const after1 = hits.length;
    await eng.getSettingsMap();
    assert.equal(hits.length, after1, 'a failed read is not retried for a few seconds');

    // a value learned while healthy outlives the outage (stale-on-error)
    eng._reset();
    stubDown = false;
    await eng.getSettingsMap();
    const t0 = Date.now();
    mock.method(Date, 'now', () => t0 + eng.TTL_MS + 1000);
    stubDown = true;
    assert.equal((await eng.getSettingsMap()).prasadDelivery, '120');
  });

  test('a hung engagement is cut off by the timeout', async () => {
    const hung = http.createServer(() => {});
    await new Promise((ok) => hung.listen(0, '127.0.0.1', ok));
    process.env.ENGAGEMENT_URL = `http://127.0.0.1:${hung.address().port}`;
    const t = Date.now();
    await assert.rejects(eng.call('GET', '/settings/map', { timeoutMs: 150 }));
    assert.ok(Date.now() - t < 2000);
    hung.closeAllConnections();
    hung.close();
  });

  test('push token lookup and settings upsert (which throws when refused)', async () => {
    assert.equal(await eng.getPushToken('dev 1'), 'ExponentPushToken[abc]');
    assert.match(hits.at(-1).url, /visitors\/dev%201\/push-token$/);
    await eng.upsertSettings([{ key: 'minMinutes', value: '9' }], { sub: 'op', role: 'admin', perms: ['money:edit'] });
    assert.equal(lastUpsert.claims.sub, 'op');
    await assert.rejects(eng.upsertSettings([{ key: 'minMinutes', value: '1' }], { sub: 'ed', role: 'editor', perms: [] }), (e) => e.status === 403);
    assert.equal((await eng.getSettingsMap()).minMinutes, '9', 'cache dropped after a write');
  });
});

describe('lib/settings', () => {
  test('with ENGAGEMENT_URL set reads come from engagement; the caller default applies to absent keys', async () => {
    assert.equal(await getNumberSetting('prasadDelivery', 0), 120);
    assert.equal(await getBoolSetting('callsEnabled', true), false);
    assert.equal(await getNumberSetting('nonexistent', 42), 42);
  });
  test('engagement down degrades to the caller default, no throw', async () => {
    stubDown = true;
    assert.equal(await getNumberSetting('minMinutes', 3), 3);
    assert.equal(await getBoolSetting('callsEnabled', true), true);
  });
  test('ensureSetting is a no-op (engagement seeds); with it UNSET the monolith still reads/writes its own table', async () => {
    await ensureSetting('zzTest', 1, 'l', 'd');
    assert.equal(await Setting.countDocuments({ key: 'zzTest' }), 0);
    delete process.env.ENGAGEMENT_URL;
    await ensureSetting('zzTest', 1, 'l', 'd');
    assert.equal(await getNumberSetting('zzTest', 0), 1);
    await Setting.deleteMany({});
  });
});

describe('the monolith app', { skip: process.env.IDENTITY_URL && 'cookie sessions are phase 1; IDENTITY_URL set (phase 2) moves them to the admin BFF' }, () => {
  before(async () => {
    process.env.ENGAGEMENT_URL = stubUrl;
    server = http.createServer(createApp());
    await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => new Promise((ok) => server.close(ok)));

  const req = async (method, path, { cookie, body } = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* html 404 */ }
    return { status: res.status, body: json };
  };

  test('migrated routes answer 404 when ENGAGEMENT_URL is set (public and admin)', async () => {
    for (const [m, p, o] of [
      ['GET', '/api/flags'], ['GET', '/api/announcements'], ['POST', '/api/ingest/session', { body: { deviceId: 'd' } }],
      ['POST', '/api/ingest/screen', { body: { screen: 's' } }], ['POST', '/api/push/register', { body: { deviceId: 'd', pushToken: 't' } }],
      ['GET', '/api/flags/full', { cookie: cookies.admin }], ['GET', '/api/visitors', { cookie: cookies.admin }],
      ['GET', '/api/analytics/summary', { cookie: cookies.admin }],
      ['GET', '/api/content/settings', { cookie: cookies.admin }], ['GET', '/api/content/announcements', { cookie: cookies.admin }],
      ['POST', '/api/content/settings', { cookie: cookies.admin, body: { key: 'x', value: '1' } }],
    ]) {
      const r = await req(m, p, o);
      assert.equal(r.status, 404, `${m} ${p}`);
    }
    assert.equal((await req('GET', '/api/content/deities', { cookie: cookies.admin })).status, 200, 'other content resources are untouched');
  });

  test('GET /api/content embeds engagement settings + announcement', async () => {
    const r = await req('GET', '/api/content');
    assert.equal(r.status, 200);
    assert.equal(r.body.settings.prasadDelivery, '120');
    assert.deepEqual(r.body.announcement, { title: 'Diwali', body: 'b', severity: 'festival' });
  });

  test('GET /api/content survives engagement being down: defaults, no 5xx', async () => {
    stubDown = true;
    const r = await req('GET', '/api/content');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.settings, { ...eng.FALLBACK_SETTINGS });
    assert.equal(r.body.announcement, null);
  });

  test('billing rules: GET reads engagement; PUT writes through it with the operator claims', async () => {
    const r = await req('GET', '/api/admin/billing/rules', { cookie: cookies.admin });
    assert.equal(r.body.minMinutes, 7);
    assert.equal(r.body.callsEnabled, false);
    const put = await req('PUT', '/api/admin/billing/rules', { cookie: cookies.admin, body: { minMinutes: 9 } });
    assert.equal(put.status, 200);
    assert.equal(put.body.minMinutes, 9);
    assert.equal(lastUpsert.claims.iss, 'monolith');
    assert.equal(lastUpsert.claims.sub, 'admin1');
    assert.ok(lastUpsert.claims.perms.includes('money:edit'));
    assert.equal((await req('PUT', '/api/admin/billing/rules', { cookie: cookies.admin, body: { minMinutes: 0 } })).status, 400);
    assert.equal((await req('PUT', '/api/admin/billing/rules', { cookie: cookies.editor, body: { minMinutes: 5 } })).status, 403, 'editor: gate');
    stubDown = true;
    eng._reset();
    const down = await req('PUT', '/api/admin/billing/rules', { cookie: cookies.admin, body: { minMinutes: 5 } });
    assert.equal(down.status, 502, 'a write must fail loudly');
  });

  test('POST /internal/audit: service JWT only, records the entry', async () => {
    const tok = (iss, secret = SECRET) => signServiceToken({ iss, sub: 'x' }, { secret });
    const entry = { operator: 'admin1', role: 'admin', area: 'flags', method: 'PUT', path: '/api/flags/bhajan', targetId: 'bhajan', status: 200 };
    const post = (headers, body = entry) => fetch(`${base}/internal/audit`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    assert.equal((await post({})).status, 401);
    assert.equal((await post({ authorization: `Bearer ${tok('admin-bff', 'another-secret-1234567')}` })).status, 401);
    assert.equal((await post({ authorization: `Bearer ${tok('mobile-bff')}` })).status, 401, 'only the admin BFF');
    assert.equal((await post({ authorization: `Bearer ${tok('admin-bff')}` }, {})).status, 400);
    assert.equal((await post({ authorization: `Bearer ${tok('admin-bff')}` })).status, 200);
    const row = await AuditLog.findOne({ path: '/api/flags/bhajan' }).lean();
    assert.equal(row.operator, 'admin1');
    assert.equal(row.area, 'flags');
    assert.equal(row.status, 200);
    delete process.env.INTERNAL_JWT_SECRET;
    assert.equal((await post({ authorization: `Bearer ${tok('admin-bff')}` })).status, 404, 'not mounted without a secret');
  });
});

describe('ENGAGEMENT_URL unset: the monolith behaves exactly as before', { skip: process.env.IDENTITY_URL && 'cookie sessions are phase 1; IDENTITY_URL set (phase 2) moves them to the admin BFF' }, () => {
  test('the migrated routes are served from its own collections', async () => {
    delete process.env.ENGAGEMENT_URL;
    const s = http.createServer(createApp());
    await new Promise((ok) => s.listen(0, '127.0.0.1', ok));
    const b = `http://127.0.0.1:${s.address().port}`;
    const get = async (p, cookie) => (await fetch(`${b}${p}`, { headers: cookie ? { cookie } : {} })).status;
    assert.equal(await get('/api/flags'), 200);
    assert.equal(await get('/api/announcements'), 200);
    assert.equal(await get('/api/content/settings', cookies.admin), 200);
    assert.equal(await get('/api/content/announcements', cookies.admin), 200);
    assert.equal(await get('/api/visitors', cookies.admin), 200);
    assert.equal(hits.length, 0, 'engagement was never called');
    await new Promise((ok) => s.close(ok));
  });
});
