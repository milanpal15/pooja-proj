// The identity service's read-only by-uid view of a devotee's event registrations and badges (Users 360, docs/USERS.md section 2).
// Run: TEST_MONGODB_URI=mongodb://127.0.0.1:27193/x node --test --test-concurrency=1 src/directory.test.mjs
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, test } from 'node:test';

import { signServiceToken } from '@bhakti/common';
import mongoose from 'mongoose';

import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { connectDb } from './db.js';
import { Registration, UserBadge } from './models/index.js';

const SECRET = 'test-secret-test-secret-1234';
const base = new URL(process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27193/x');
const config = loadConfig({ INTERNAL_JWT_SECRET: SECRET, MONGODB_URI: `${base.protocol}//${base.host}`, DB_NAME: 'events_directory_test' });
const as = (iss) => ({ authorization: `Bearer ${signServiceToken({ iss, sub: iss === 'mobile-bff' ? 'uid-a' : null }, { secret: SECRET })}` });

let server; let url;
before(async () => {
  await connectDb(config);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  server = http.createServer(createApp(config, { isReady: () => true, logger: { info() {}, warn() {}, error() {} }, catalog: { exists: async () => true } }));
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  url = `http://127.0.0.1:${server.address().port}`;
  for (let i = 0; i < 12; i += 1) {
    await Registration.create({ uid: 'uid-a', eventSlug: `event-${i}`, status: 'joined', passCode: `PASS${i}`, answers: { phone: '+919800000001' }, joinedAt: new Date(Date.UTC(2026, 9, 1 + i)), createdAt: new Date(Date.UTC(2026, 9, 1 + i)) });
    await UserBadge.create({ uid: 'uid-a', badgeSlug: `badge-${i}`, eventSlug: `event-${i}`, earnedAt: new Date(Date.UTC(2026, 9, 1 + i)) });
  }
});
after(async () => {
  await new Promise((ok) => server.close(ok));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const get = (path, iss = 'identity') => fetch(`${url}/internal/events${path}`, { headers: as(iss) }).then(async (r) => ({ status: r.status, body: await r.json() }));

describe('GET /directory/users/:uid', () => {
  test('identity gets ten registrations and ten badges, newest first, without the form answers or the pass code', async () => {
    const r = await get('/directory/users/uid-a');
    assert.equal(r.status, 200);
    assert.equal(r.body.registrations.length, 10);
    assert.equal(r.body.badges.length, 10);
    assert.equal(r.body.registrations[0].eventSlug, 'event-11');
    assert.equal(r.body.badges[0].badgeSlug, 'badge-11');
    assert.deepEqual(Object.keys(r.body.registrations[0]).sort(), ['at', 'checkedInAt', 'createdAt', 'eventSlug', 'joinedAt', 'status', 'title']);
    const text = JSON.stringify(r.body);
    assert.equal(text.includes('PASS'), false);
    assert.equal(text.includes('9800000001'), false);
    assert.deepEqual((await get('/directory/users/nobody')).body, { registrations: [], badges: [] });
  });

  test('only identity may ask', async () => {
    for (const iss of ['mobile-bff', 'admin-bff', 'catalog', 'orders']) assert.equal((await get('/directory/users/uid-a', iss)).status, 403, iss);
    assert.equal((await get('/public/events')).status, 403, 'identity gets nothing else');
  });
});
