// Run: TEST_MONGODB_URI=mongodb://127.0.0.1:27141/x node --test --test-concurrency=1 src/engagement.test.mjs
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, test } from 'node:test';

import { signServiceToken } from '@bhakti/common';
import mongoose from 'mongoose';

import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { DEFAULT_FLAGS, DEFAULT_SETTINGS, MONEY_KEYS } from './defaults.js';
import { connectDb } from './db.js';
import { Announcement, Event, Flag, Setting, Visitor } from './models/index.js';
import { seedEngagement } from './seed.js';

const SECRET = 'test-secret-test-secret-1234';
const base = new URL(process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27141/x');
const config = loadConfig({ INTERNAL_JWT_SECRET: SECRET, MONGODB_URI: `${base.protocol}//${base.host}`, DB_NAME: 'engagement_test' });

const ADMIN = ['content:edit', 'money:edit', 'flags:edit', 'announcements:edit', 'push:edit', 'overview:edit'].flatMap((p) => [p, p.replace(':edit', ':view')]);
const EDITOR = ['content:edit', 'announcements:edit', 'flags:view', 'overview:view', 'money:view'];
const VIEWER = ['content:view', 'flags:view', 'overview:view', 'announcements:view', 'money:view'];

const tok = (o = {}) => signServiceToken({ iss: 'admin-bff', sub: 'op1', role: 'admin', perms: ADMIN, ...o }, { secret: SECRET });
const as = (perms) => ({ authorization: `Bearer ${tok({ perms })}` });

let server;
let url;
let ready = false;
let pushed = [];
const fakeFetch = async (_u, init) => {
  const batch = JSON.parse(init.body);
  pushed.push(...batch);
  return { json: async () => ({ data: batch.map(() => ({ status: 'ok' })) }) };
};

before(async () => {
  await connectDb(config);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  const app = createApp(config, { isReady: () => ready, dbPing: async () => {}, logger: { info() {}, warn() {}, error() {} }, fetchImpl: fakeFetch });
  server = http.createServer(app);
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((ok) => server.close(ok));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function call(method, path, { headers = as(ADMIN), body } = {}) {
  const res = await fetch(`${url}/internal/engagement${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

describe('health and seeding', () => {
  test('/health is 503 until seeded, then 200 (no token needed)', async () => {
    let r = await fetch(`${url}/health`);
    assert.equal(r.status, 503);
    assert.equal((await r.json()).starting, true);
    await seedEngagement();
    ready = true;
    r = await fetch(`${url}/health`);
    assert.equal(r.status, 200);
  });

  test('seeds every default flag and setting', async () => {
    assert.equal(await Flag.countDocuments(), DEFAULT_FLAGS.length);
    assert.equal(await Setting.countDocuments(), DEFAULT_SETTINGS.length);
    assert.equal((await Flag.findOne({ key: 'phoneAuth' })).enabled, false);
    assert.equal((await Setting.findOne({ key: 'prasadDelivery' })).value, '99');
  });

  test('seeding twice is idempotent and never overwrites an operator edit', async () => {
    await Flag.updateOne({ key: 'bhajan' }, { $set: { enabled: false } });
    await Setting.updateOne({ key: 'prasadDelivery' }, { $set: { value: '333' } });
    await seedEngagement();
    await seedEngagement();
    assert.equal(await Flag.countDocuments(), DEFAULT_FLAGS.length);
    assert.equal(await Setting.countDocuments(), DEFAULT_SETTINGS.length);
    assert.equal((await Flag.findOne({ key: 'bhajan' })).enabled, false);
    assert.equal((await Setting.findOne({ key: 'prasadDelivery' })).value, '333');
    await Flag.updateOne({ key: 'bhajan' }, { $set: { enabled: true } });
    await Setting.updateOne({ key: 'prasadDelivery' }, { $set: { value: '99' } });
  });

  test('every money key is a seeded setting', () => {
    const keys = new Set(DEFAULT_SETTINGS.map((s) => s.key));
    for (const k of MONEY_KEYS) assert.ok(keys.has(k), k);
  });
});

describe('service auth', () => {
  const ROUTES = [
    ['GET', '/flags'], ['GET', '/flags/full'], ['PUT', '/flags/bhajan'],
    ['GET', '/settings'], ['GET', '/settings/map'], ['GET', '/settings/prasadDelivery'], ['POST', '/settings/upsert'],
    ['GET', '/admin/settings'], ['POST', '/admin/settings'], ['PUT', '/admin/settings/000000000000000000000001'], ['DELETE', '/admin/settings/000000000000000000000001'],
    ['GET', '/announcements'], ['GET', '/announcements/current'],
    ['GET', '/admin/announcements'], ['POST', '/admin/announcements'], ['PUT', '/admin/announcements/000000000000000000000001'],
    ['DELETE', '/admin/announcements/000000000000000000000001'], ['POST', '/admin/announcements/000000000000000000000001/push'],
    ['POST', '/ingest/session'], ['POST', '/ingest/screen'], ['POST', '/push/register'], ['GET', '/visitors/d1/push-token'],
    ['GET', '/analytics/summary'], ['GET', '/analytics/trend'], ['GET', '/visitors'],
  ];
  const bad = {
    'no token': {},
    'garbage token': { authorization: 'Bearer nope' },
    'expired token': { authorization: `Bearer ${signServiceToken({ iss: 'admin-bff', perms: ADMIN }, { secret: SECRET, now: Date.now() - 120_000 })}` },
    'wrong issuer': { authorization: `Bearer ${signServiceToken({ iss: 'evil-service', perms: ADMIN }, { secret: SECRET })}` },
    'wrong secret': { authorization: `Bearer ${signServiceToken({ iss: 'admin-bff', perms: ADMIN }, { secret: 'another-secret-another-secret' })}` },
  };
  for (const [label, headers] of Object.entries(bad)) {
    test(`${label} is refused with 401 on every route`, async () => {
      for (const [m, p] of ROUTES) {
        const r = await call(m, p, { headers, body: m === 'GET' || m === 'DELETE' ? undefined : {} });
        assert.equal(r.status, 401, `${m} ${p}`);
        assert.ok(r.body.code, `${m} ${p} has a code`);
      }
    });
  }
  test('refusal codes are specific', async () => {
    assert.equal((await call('GET', '/flags', { headers: {} })).body.code, 'missing_token');
    assert.equal((await call('GET', '/flags', { headers: bad['expired token'] })).body.code, 'token_expired');
    assert.equal((await call('GET', '/flags', { headers: bad['wrong issuer'] })).body.code, 'wrong_issuer');
    assert.equal((await call('GET', '/flags', { headers: bad['wrong secret'] })).body.code, 'bad_signature');
  });
});

describe('flags', () => {
  test('GET /flags is the { flags: {key: bool} } map the app reads', async () => {
    const r = await call('GET', '/flags');
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body), ['flags']);
    assert.equal(r.body.flags.phoneAuth, false);
    assert.equal(r.body.flags.bhajan, true);
  });
  test('GET /flags/full is sorted by key with labels', async () => {
    const r = await call('GET', '/flags/full');
    assert.deepEqual(r.body.map((f) => f.key), [...r.body.map((f) => f.key)].sort());
    assert.equal(r.body.find((f) => f.key === 'journal').label, 'Daily Journal');
  });
  test('PUT toggles; 404 on unknown; coerces to boolean', async () => {
    let r = await call('PUT', '/flags/journal', { body: { enabled: false } });
    assert.equal(r.status, 200);
    assert.equal(r.body.enabled, false);
    assert.equal((await call('GET', '/flags')).body.flags.journal, false);
    r = await call('PUT', '/flags/journal', { body: { enabled: 'yes' } });
    assert.equal(r.body.enabled, true);
    assert.equal((await call('PUT', '/flags/nope', { body: { enabled: true } })).status, 404);
  });
  test('a caller without flags:edit is refused', async () => {
    const r = await call('PUT', '/flags/journal', { headers: as(VIEWER), body: { enabled: false } });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'forbidden');
    assert.equal(r.body.needs, 'flags:edit');
  });
});

describe('settings', () => {
  test('reads: list (sorted), map, one, missing', async () => {
    const list = await call('GET', '/settings');
    assert.deepEqual(list.body.map((s) => s.key), [...list.body.map((s) => s.key)].sort());
    const map = await call('GET', '/settings/map');
    assert.equal(map.body.settings.prasadDelivery, '99');
    assert.equal(map.body.settings.supportEmail, '');
    assert.equal((await call('GET', '/settings/prasadDelivery')).body.value, '99');
    assert.equal((await call('GET', '/settings/zzz')).status, 404);
  });

  test('admin CRUD: create 201, update, duplicate 409, bad id 400, delete', async () => {
    let r = await call('POST', '/admin/settings', { body: { key: 'siteNote', value: 'hi', label: 'Note' } });
    assert.equal(r.status, 201);
    const id = r.body._id;
    assert.equal((await call('POST', '/admin/settings', { body: { key: 'siteNote' } })).status, 409);
    assert.equal((await call('POST', '/admin/settings', { body: { value: 'x' } })).status, 400);
    r = await call('PUT', `/admin/settings/${id}`, { body: { value: 'bye' } });
    assert.equal(r.body.value, 'bye');
    assert.equal((await call('PUT', '/admin/settings/zzz', { body: {} })).status, 400);
    assert.equal((await call('PUT', '/admin/settings/000000000000000000000009', { body: {} })).status, 404);
    assert.deepEqual((await call('DELETE', `/admin/settings/${id}`)).body, { ok: true });
    assert.equal(await Setting.countDocuments({ key: 'siteNote' }), 0);
  });

  test('an editor edits ordinary settings but NOT money rows (edit, rename onto, create, delete)', async () => {
    const h = as(EDITOR);
    const support = await Setting.findOne({ key: 'supportEmail' });
    const money = await Setting.findOne({ key: 'prasadDelivery' });
    let r = await call('PUT', `/admin/settings/${support._id}`, { headers: h, body: { value: 'a@b.co' } });
    assert.equal(r.status, 200);
    r = await call('PUT', `/admin/settings/${money._id}`, { headers: h, body: { value: '1' } });
    assert.equal(r.status, 403);
    assert.equal(r.body.needs, 'money:edit');
    r = await call('PUT', `/admin/settings/${support._id}`, { headers: h, body: { key: 'coinsPerRupee' } });
    assert.equal(r.status, 403);
    r = await call('POST', '/admin/settings', { headers: h, body: { key: 'callsEnabled', value: 'false' } });
    assert.equal(r.status, 403);
    r = await call('DELETE', `/admin/settings/${money._id}`, { headers: h });
    assert.equal(r.status, 403);
    r = await call('POST', '/settings/upsert', { headers: h, body: { items: [{ key: 'minMinutes', value: 1 }] } });
    assert.equal(r.status, 403);
    assert.equal((await Setting.findOne({ key: 'prasadDelivery' })).value, '99');
    assert.equal((await Setting.findOne({ key: 'minMinutes' })).value, '3');
    await Setting.updateOne({ key: 'supportEmail' }, { $set: { value: '' } });
  });

  test('a viewer cannot write anything; money:edit holders can change money rows', async () => {
    const money = await Setting.findOne({ key: 'prasadDelivery' });
    assert.equal((await call('PUT', `/admin/settings/${money._id}`, { headers: as(VIEWER), body: { value: '1' } })).status, 403);
    assert.equal((await call('POST', '/admin/settings', { headers: as(VIEWER), body: { key: 'x' } })).status, 403);
    assert.equal((await call('GET', '/admin/settings', { headers: as(VIEWER) })).status, 200);
    const r = await call('PUT', `/admin/settings/${money._id}`, { body: { value: '120' } });
    assert.equal(r.status, 200);
    assert.equal((await Setting.findOne({ key: 'prasadDelivery' })).value, '120');
    await Setting.updateOne({ key: 'prasadDelivery' }, { $set: { value: '99' } });
  });

  test('upsert creates missing rows with labels and sets values as strings; validates items', async () => {
    let r = await call('POST', '/settings/upsert', { body: { items: [{ key: 'newRule', value: 7, label: 'New', desc: 'd' }, { key: 'minMinutes', value: 5 }] } });
    assert.deepEqual(r.body, { ok: true, count: 2 });
    const created = await Setting.findOne({ key: 'newRule' });
    assert.equal(created.value, '7');
    assert.equal(created.label, 'New');
    const existing = await Setting.findOne({ key: 'minMinutes' });
    assert.equal(existing.value, '5');
    assert.equal(existing.label, 'Minimum minutes to start a call', 'label kept');
    assert.equal((await call('POST', '/settings/upsert', { body: { items: [] } })).status, 400);
    assert.equal((await call('POST', '/settings/upsert', { body: { items: [{ value: 1 }] } })).status, 400);
    await Setting.deleteOne({ key: 'newRule' });
    await Setting.updateOne({ key: 'minMinutes' }, { $set: { value: '3' } });
  });
});

describe('announcements', () => {
  const day = 864e5;
  test('public list: active + modal + inside its window, newest first, max 5', async () => {
    await Announcement.deleteMany({});
    const now = Date.now();
    await Announcement.create([
      { title: 'live', createdAt: new Date(now - 1000) },
      { title: 'inactive', active: false },
      { title: 'push only', channels: ['push'] },
      { title: 'future', startsAt: new Date(now + day) },
      { title: 'expired', endsAt: new Date(now - day) },
      { title: 'windowed', startsAt: new Date(now - day), endsAt: new Date(now + day), createdAt: new Date(now) },
    ]);
    const r = await call('GET', '/announcements');
    assert.deepEqual(r.body.map((a) => a.title), ['windowed', 'live']);
    const many = Array.from({ length: 7 }, (_, i) => ({ title: `m${i}` }));
    await Announcement.create(many);
    assert.equal((await call('GET', '/announcements')).body.length, 5);
    await Announcement.deleteMany({});
  });

  test('current: newest active shaped like /api/content, or null', async () => {
    assert.deepEqual((await call('GET', '/announcements/current')).body, { announcement: null });
    await Announcement.create({ title: 'Diwali', bodyMd: '**hi**', severity: 'festival' });
    assert.deepEqual((await call('GET', '/announcements/current')).body, { announcement: { title: 'Diwali', body: '**hi**', severity: 'festival' } });
    await Announcement.deleteMany({});
  });

  test('admin CRUD with validation and permission', async () => {
    let r = await call('POST', '/admin/announcements', { body: { title: 'Hello', bodyMd: 'x' } });
    assert.equal(r.status, 201);
    assert.deepEqual(r.body.channels, ['modal']);
    const id = r.body._id;
    assert.equal((await call('POST', '/admin/announcements', { body: {} })).status, 400);
    assert.equal((await call('GET', '/admin/announcements')).body.length, 1);
    assert.equal((await call('PUT', `/admin/announcements/${id}`, { body: { active: false } })).body.active, false);
    assert.equal((await call('PUT', '/admin/announcements/000000000000000000000009', { body: {} })).status, 404);
    assert.equal((await call('POST', '/admin/announcements', { headers: as(VIEWER), body: { title: 'x' } })).status, 403);
    assert.equal((await call('DELETE', `/admin/announcements/${id}`, { headers: as(VIEWER) })).status, 403);
    assert.deepEqual((await call('DELETE', `/admin/announcements/${id}`)).body, { ok: true });
  });

  test('push: needs push:edit, sends once, 409 on repeat, force re-sends, 404/400', async () => {
    const a = await Announcement.create({ title: 'Push me', bodyMd: '# Big **news**' });
    const url0 = `/admin/announcements/${a._id}/push`;
    assert.equal((await call('POST', url0, { headers: as(EDITOR) })).status, 403);
    assert.deepEqual((await call('POST', url0)).body, { ok: true, sent: 0, failed: 0, note: 'no registered devices' });
    await Visitor.create([{ deviceId: 'd1', pushToken: 'ExponentPushToken[aaa]' }, { deviceId: 'd2', pushToken: 'junk' }, { deviceId: 'd3' }]);
    let r = await call('POST', url0);
    assert.deepEqual(r.body, { ok: true, sent: 1, failed: 0 });
    assert.equal(pushed.length, 1);
    assert.equal(pushed[0].body, 'Big news');
    r = await call('POST', url0);
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'already pushed');
    assert.equal((await call('POST', `${url0}?force=1`)).status, 200);
    assert.equal((await call('POST', '/admin/announcements/000000000000000000000009/push')).status, 404);
    assert.equal((await call('POST', '/admin/announcements/zz/push')).status, 400);
    await Announcement.deleteMany({});
    await Visitor.deleteMany({});
  });
});

describe('analytics', () => {
  test('ingest/session: deviceId required, upserts and counts, bounded strings only', async () => {
    assert.equal((await call('POST', '/ingest/session', { body: {} })).status, 400);
    assert.equal((await call('POST', '/ingest/session', { body: { deviceId: { $ne: null } } })).status, 400);
    for (let i = 0; i < 2; i++) assert.deepEqual((await call('POST', '/ingest/session', { body: { deviceId: 'dev1', model: 'Pixel', os: { $gt: '' }, appVersion: 'v'.repeat(100) } })).body, { ok: true });
    const v = await Visitor.findOne({ deviceId: 'dev1' }).lean();
    assert.equal(v.sessions, 2);
    assert.equal(v.model, 'Pixel');
    assert.equal(v.os, undefined, 'object value dropped');
    assert.equal(v.appVersion.length, 40);
    assert.equal(await Event.countDocuments({ type: 'session', deviceId: 'dev1' }), 2);
    await call('POST', '/ingest/session', { body: { deviceId: 'x'.repeat(500) } });
    assert.equal((await Visitor.findOne({ deviceId: 'x'.repeat(120) })).deviceId.length, 120);
  });

  test('ingest/screen records an event (even anonymous) and touches the visitor', async () => {
    assert.deepEqual((await call('POST', '/ingest/screen', { body: { deviceId: 'dev1', screen: 'home' } })).body, { ok: true });
    assert.deepEqual((await call('POST', '/ingest/screen', { body: { screen: { a: 1 } } })).body, { ok: true });
    assert.equal(await Event.countDocuments({ type: 'screen' }), 2);
  });

  test('push/register stores the token (strings only) and the token lookup returns it', async () => {
    assert.equal((await call('POST', '/push/register', { body: { deviceId: 'dev1', pushToken: { a: 1 } } })).status, 400);
    assert.equal((await call('POST', '/push/register', { body: { deviceId: '', pushToken: 'x' } })).status, 400);
    assert.deepEqual((await call('POST', '/push/register', { body: { deviceId: 'dev1', pushToken: 'ExponentPushToken[zzz]' } })).body, { ok: true });
    assert.deepEqual((await call('GET', '/visitors/dev1/push-token')).body, { pushToken: 'ExponentPushToken[zzz]' });
    assert.deepEqual((await call('GET', '/visitors/ghost/push-token')).body, { pushToken: null });
  });

  test('summary and trend', async () => {
    const s = (await call('GET', '/analytics/summary')).body;
    assert.equal(s.sessions, 3);
    assert.equal(s.screenViews, 2);
    assert.ok(s.visitors >= 2);
    assert.ok(s.topScreens.some((t) => t.screen === 'home' && t.count === 1));
    assert.ok(s.topScreens.some((t) => t.screen === '(unknown)'));
    const t = (await call('GET', '/analytics/trend')).body;
    assert.equal(t.length, 1);
    assert.equal(t[0].count, 3);
    assert.match(t[0].day, /^\d{4}-\d\d-\d\d$/);
  });

  test('visitors: push tokens only for overview:edit; needs overview:view', async () => {
    const full = (await call('GET', '/visitors')).body.find((v) => v.deviceId === 'dev1');
    assert.ok(full.pushToken);
    const masked = (await call('GET', '/visitors', { headers: as(VIEWER) })).body.find((v) => v.deviceId === 'dev1');
    assert.equal(masked.pushToken, undefined);
    assert.equal((await call('GET', '/visitors', { headers: as([]) })).status, 403);
    assert.equal((await call('GET', '/analytics/summary', { headers: as([]) })).status, 403);
  });
});
