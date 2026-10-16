// The device registry as identity reads it (Users 360 / Users list, docs/USERS.md section 2).
// Run: TEST_MONGODB_URI=mongodb://127.0.0.1:27141/x node --test --test-concurrency=1 src/devices.test.mjs
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, test } from 'node:test';

import { signServiceToken } from '@bhakti/common';
import mongoose from 'mongoose';

import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { connectDb } from './db.js';
import { Visitor } from './models/index.js';
import { seedEngagement } from './seed.js';

const SECRET = 'test-secret-test-secret-1234';
const base = new URL(process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27141/x');
const config = loadConfig({ INTERNAL_JWT_SECRET: SECRET, MONGODB_URI: `${base.protocol}//${base.host}`, DB_NAME: 'engagement_devices_test' });
const as = (iss) => ({ authorization: `Bearer ${signServiceToken({ iss, sub: null }, { secret: SECRET })}`, 'content-type': 'application/json' });

let server; let url;
before(async () => {
  await connectDb(config);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  await seedEngagement();
  server = http.createServer(createApp(config, { isReady: () => true, logger: { info() {}, warn() {}, error() {} } }));
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  url = `http://127.0.0.1:${server.address().port}`;
  await Visitor.create([
    { deviceId: 'd1', uid: 'u1', versionName: '1.0.0', versionCode: 10, osApi: 33, model: 'Pixel 7', platform: 'android', lastSeen: new Date('2026-10-01'), pushToken: 'ExponentPushToken[secret]' },
    { deviceId: 'd2', uid: 'u1', versionName: '1.2.0', versionCode: 12, osApi: 34, platform: 'android', lastSeen: new Date('2026-10-15') },
    { deviceId: 'd3', uid: 'u2', versionName: '1.0.0', versionCode: 10, platform: 'android', lastSeen: new Date('2026-10-10') },
    { deviceId: 'd4', uid: null, versionCode: 10, platform: 'android', lastSeen: new Date('2026-10-12') },
  ]);
});
after(async () => {
  await new Promise((ok) => server.close(ok));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const post = (path, body, iss = 'identity') => fetch(`${url}/internal/engagement${path}`, { method: 'POST', headers: as(iss), body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));
const get = (path, iss = 'identity') => fetch(`${url}/internal/engagement${path}`, { headers: as(iss) }).then(async (r) => ({ status: r.status, body: await r.json() }));

describe('POST /devices/by-uids', () => {
  test('every device of those accounts, newest seen first, with the registry fields and nothing else (no push token)', async () => {
    const r = await post('/devices/by-uids', { uids: ['u1', 'u2', 'ghost'] });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.devices.map((d) => d.deviceId), ['d2', 'd3', 'd1']);
    assert.deepEqual(r.body.devices[2], { uid: 'u1', deviceId: 'd1', platform: 'android', versionName: '1.0.0', versionCode: 10, osApi: 33, model: 'Pixel 7', firstSeen: r.body.devices[2].firstSeen, hasPush: true, lastSeen: '2026-10-01T00:00:00.000Z' });
    assert.equal(JSON.stringify(r.body).includes('secret'), false);
    assert.deepEqual((await post('/devices/by-uids', { uids: [] })).body, { devices: [] });
  });
  test('uids are validated: a list of strings, at most 1000', async () => {
    for (const bad of [{}, { uids: 'u1' }, { uids: [1] }, { uids: Array.from({ length: 1001 }, (_, i) => `u${i}`) }]) assert.equal((await post('/devices/by-uids', bad)).status, 400);
  });
});

describe('GET /devices/uids', () => {
  test('the accounts seen on a build (never a device without an account), and truncation is reported', async () => {
    assert.deepEqual((await get('/devices/uids?versionCode=10')).body, { uids: ['u2', 'u1'], truncated: false });
    assert.deepEqual((await get('/devices/uids?versionCode=10&limit=1')).body, { uids: ['u2'], truncated: true });
    assert.deepEqual((await get('/devices/uids?versionCode=99')).body.uids, []);
    assert.equal((await get('/devices/uids?versionCode=abc')).status, 400);
  });
});

describe('who may call', () => {
  test('identity only', async () => {
    for (const iss of ['mobile-bff', 'admin-bff', 'monolith', 'catalog']) {
      assert.equal((await post('/devices/by-uids', { uids: ['u1'] }, iss)).status, 403, iss);
      assert.equal((await get('/devices/uids?versionCode=10', iss)).status, 403, iss);
    }
  });
});
