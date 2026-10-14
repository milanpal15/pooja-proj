// The push registry and the FCM edge: register / unregister (ownership, moving a token), send (who may, the message that reaches FCM, dead tokens),
// reachable, and lib/fcm.js on its own. A FAKE FCM sender is injected - nothing here ever talks to Google.
// Run: TEST_MONGODB_URI=mongodb://127.0.0.1:27361/x node --test --test-concurrency=1 src/push.test.mjs
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, beforeEach, describe, test } from 'node:test';

import { signServiceToken } from '@bhakti/common';
import mongoose from 'mongoose';

import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { connectDb } from './db.js';
import { createFcmSender, isDeadTokenError } from './lib/fcm.js';
import { MAX_DEVICES_PER_UID } from './lib/push.js';
import { PushDevice } from './models/index.js';

const SECRET = 'test-secret-test-secret-1234';
const base = new URL(process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27361/x');
const config = loadConfig({ INTERNAL_JWT_SECRET: SECRET, MONGODB_URI: `${base.protocol}//${base.host}`, DB_NAME: 'identity_push_test' });

/** The fake FCM: records messages, can fail per token. */
const fcm = {
  sent: [],
  failures: {}, // token -> { code, message }
  throwAlways: false,
  async send(message) {
    if (fcm.throwAlways) throw new Error('sender exploded');
    fcm.sent.push(message);
    const f = fcm.failures[message.token];
    return f ? { ok: false, dead: isDeadTokenError(f), error: f.code } : { ok: true };
  },
};

let server;
let url;
before(async () => {
  await connectDb(config);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  const app = createApp(config, { isReady: () => true, logger: { info() {}, warn() {}, error() {} }, firebase: {}, astrologers: {}, fcm });
  server = http.createServer(app);
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((ok) => { server.closeAllConnections?.(); server.close(ok); });
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
beforeEach(async () => {
  await PushDevice.deleteMany({});
  fcm.sent.length = 0;
  fcm.failures = {};
  fcm.throwAlways = false;
});

const bearer = (claims) => ({ authorization: `Bearer ${signServiceToken(claims, { secret: SECRET })}` });
const phone = (uid) => bearer({ iss: 'mobile-bff', sub: uid, role: 'devotee' });
const svc = (iss) => bearer({ iss, sub: null });

async function call(method, path, { headers, body } = {}) {
  const res = await fetch(`${url}/internal/identity/push${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { status: res.status, body: json };
}
const rows = (uid) => PushDevice.find(uid ? { uid } : {}).sort({ token: 1 }).lean();

describe('register / unregister', () => {
  test('POST register -> 201 {ok:true}; the account is the signed sub, never the body; platform defaults to android; the row lives in `pushdevices`', async () => {
    const r = await call('POST', '/register', { headers: phone('u1'), body: { token: '  tok-1  ', platform: 'ios', uid: 'evil' } });
    assert.deepEqual([r.status, r.body], [201, { ok: true }]);
    const [row] = await rows();
    assert.deepEqual([row.uid, row.token, row.platform], ['u1', 'tok-1', 'ios']);
    await call('POST', '/register', { headers: phone('u1'), body: { token: 'tok-2', platform: 'windows' } });
    assert.equal((await rows('u1')).find((x) => x.token === 'tok-2').platform, 'android');
    assert.equal(PushDevice.collection.collectionName, 'pushdevices');
  });

  test('registering again is idempotent (one row, lastSeenAt moves)', async () => {
    await call('POST', '/register', { headers: phone('u1'), body: { token: 'tok-1' } });
    const first = (await rows())[0].lastSeenAt;
    await new Promise((r) => setTimeout(r, 15));
    await call('POST', '/register', { headers: phone('u1'), body: { token: 'tok-1' } });
    const all = await rows();
    assert.equal(all.length, 1);
    assert.ok(all[0].lastSeenAt > first);
  });

  test('a token registered to one account moves to the next account that registers it', async () => {
    await call('POST', '/register', { headers: phone('u1'), body: { token: 'shared-phone' } });
    await call('POST', '/register', { headers: phone('u2'), body: { token: 'shared-phone' } });
    assert.deepEqual((await rows()).map((x) => [x.uid, x.token]), [['u2', 'shared-phone']]);
  });

  test('a missing, blank, oversized or non-string token is 400 {error, code:"bad_token"} on both verbs; 4096 is the limit', async () => {
    for (const method of ['POST', 'DELETE']) {
      for (const body of [{}, { token: '' }, { token: '   ' }, { token: 'x'.repeat(4097) }, { token: 42 }, { token: { a: 1 } }]) {
        const r = await call(method, '/register', { headers: phone('u1'), body });
        assert.equal(r.status, 400, `${method} ${JSON.stringify(body).slice(0, 20)}`);
        assert.equal(r.body.code, 'bad_token');
        assert.equal(typeof r.body.error, 'string');
      }
    }
    assert.equal((await call('POST', '/register', { headers: phone('u1'), body: { token: 'y'.repeat(4096) } })).status, 201);
  });

  test('DELETE register removes only the caller\'s own row (someone else\'s token is a quiet no-op, still 200)', async () => {
    await call('POST', '/register', { headers: phone('u1'), body: { token: 'tok-1' } });
    assert.deepEqual((await call('DELETE', '/register', { headers: phone('u2'), body: { token: 'tok-1' } })).body, { ok: true });
    assert.equal((await rows()).length, 1, 'u2 cannot delete u1\'s phone');
    const r = await call('DELETE', '/register', { headers: phone('u1'), body: { token: 'tok-1' } });
    assert.deepEqual([r.status, r.body], [200, { ok: true }]);
    assert.equal((await rows()).length, 0);
  });

  test('only the mobile BFF registers phones; a token without a subject is 401', async () => {
    for (const iss of ['admin-bff', 'calls', 'orders', 'engagement', 'monolith']) {
      const r = await call('POST', '/register', { headers: bearer({ iss, sub: 'u1' }), body: { token: 't' } });
      assert.deepEqual([iss, r.status, r.body.code], [iss, 403, 'wrong_issuer']);
    }
    assert.equal((await call('POST', '/register', { headers: svc('mobile-bff'), body: { token: 't' } })).status, 401);
    assert.equal((await call('POST', '/register', { body: { token: 't' } })).status, 401, 'no service token at all');
    assert.equal((await rows()).length, 0);
  });

  test(`at most ${MAX_DEVICES_PER_UID} phones per account: the oldest registrations are dropped`, async () => {
    for (let i = 0; i < MAX_DEVICES_PER_UID + 3; i++) {
      await call('POST', '/register', { headers: phone('u1'), body: { token: `t${String(i).padStart(2, '0')}` } });
      await new Promise((r) => setTimeout(r, 3));
    }
    const left = (await rows('u1')).map((x) => x.token);
    assert.equal(left.length, MAX_DEVICES_PER_UID);
    assert.ok(!left.includes('t00') && left.includes(`t${MAX_DEVICES_PER_UID + 2}`));
  });
});

describe('send', () => {
  const NOTE = { uid: 'a1', title: 'Incoming call', body: 'Asha is calling', data: { type: 'incoming_call', callId: 'c1' }, channelId: 'incoming-calls', ttlSeconds: 30, tag: 'incoming_call' };

  test('only calls, orders and engagement may send; the BFFs and anyone else are 403', async () => {
    for (const iss of ['mobile-bff', 'admin-bff', 'monolith', 'catalog', 'wallet']) {
      const r = await call('POST', '/send', { headers: bearer({ iss, sub: 'a1' }), body: NOTE });
      assert.deepEqual([iss, r.status, r.body.code], [iss, 403, 'wrong_issuer']);
    }
    assert.equal(fcm.sent.length, 0);
    for (const iss of ['calls', 'orders', 'engagement']) assert.equal((await call('POST', '/send', { headers: svc(iss), body: NOTE })).status, 200, iss);
  });

  test('every phone of the account gets the same message: notification payload (shown with the app closed), string-only data, high priority, ttl, collapse tag, channel', async () => {
    await PushDevice.create([{ uid: 'a1', token: 'p1' }, { uid: 'a1', token: 'p2' }, { uid: 'other', token: 'p3' }]);
    const r = await call('POST', '/send', { headers: svc('calls'), body: { ...NOTE, data: { type: 'incoming_call', n: 7, ok: true, nested: { x: 1 }, nothing: null, list: [1] } } });
    assert.deepEqual([r.status, r.body], [200, { sent: 2, devices: 2 }]);
    assert.deepEqual(fcm.sent.map((m) => m.token).sort(), ['p1', 'p2']);
    const m = fcm.sent[0];
    assert.deepEqual(m.notification, { title: 'Incoming call', body: 'Asha is calling' });
    assert.deepEqual(m.data, { type: 'incoming_call', n: '7', ok: 'true' }, 'strings only; objects, arrays and null are dropped');
    assert.deepEqual(m.android, {
      priority: 'high', ttl: 30_000, collapseKey: 'incoming_call',
      notification: { channelId: 'incoming-calls', tag: 'incoming_call', defaultSound: true, visibility: 'public' },
    });
  });

  test('defaults: channel `default`, 60 s ttl, no collapse key without a tag; ttl is clamped to FCM\'s range', async () => {
    await PushDevice.create({ uid: 'u1', token: 'p1' });
    await call('POST', '/send', { headers: svc('orders'), body: { uid: 'u1', title: 'Booked', body: 'Done' } });
    assert.deepEqual(fcm.sent[0].android, { priority: 'high', ttl: 60_000, notification: { channelId: 'default', defaultSound: true, visibility: 'public' } });
    assert.deepEqual(fcm.sent[0].data, {});
    await call('POST', '/send', { headers: svc('orders'), body: { uid: 'u1', title: 'T', ttlSeconds: 99_999_999 } });
    assert.equal(fcm.sent[1].android.ttl, 2_419_200_000);
    await call('POST', '/send', { headers: svc('orders'), body: { uid: 'u1', title: 'T', ttlSeconds: -5 } });
    assert.equal(fcm.sent[2].android.ttl, 60_000);
  });

  test('no phone registered -> 200 {sent:0, devices:0}; a bad body is 400', async () => {
    assert.deepEqual((await call('POST', '/send', { headers: svc('calls'), body: NOTE })).body, { sent: 0, devices: 0 });
    for (const body of [{}, { title: 'T' }, { uid: 'u1' }, { uid: '', title: 'T' }, { uid: 5, title: 'T' }]) {
      assert.equal((await call('POST', '/send', { headers: svc('calls'), body })).status, 400, JSON.stringify(body));
    }
  });

  test('a token FCM calls dead is forgotten; a transient failure keeps it; the answer counts only real deliveries', async () => {
    await PushDevice.create([{ uid: 'a1', token: 'good' }, { uid: 'a1', token: 'gone' }, { uid: 'a1', token: 'flaky' }, { uid: 'a1', token: 'bad-arg' }]);
    fcm.failures = {
      gone: { code: 'messaging/registration-token-not-registered', message: 'x' },
      flaky: { code: 'messaging/server-unavailable', message: 'try later' },
      'bad-arg': { code: 'messaging/invalid-argument', message: 'The registration token is not a valid FCM registration token' },
    };
    const r = await call('POST', '/send', { headers: svc('calls'), body: NOTE });
    assert.deepEqual(r.body, { sent: 1, devices: 4 });
    assert.deepEqual((await rows()).map((x) => x.token), ['flaky', 'good']);
  });

  test('never throws into the caller: a sender that explodes still answers 200', async () => {
    await PushDevice.create({ uid: 'a1', token: 'p1' });
    fcm.throwAlways = true;
    const r = await call('POST', '/send', { headers: svc('calls'), body: NOTE });
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.sent, r.body.devices, r.body.error], [0, 0, true]);
    assert.equal((await rows()).length, 1, 'and forgets nothing');
  });
});

describe('reachable', () => {
  test('{reachable} follows the registry; only calls / orders / engagement may ask; uid is required', async () => {
    await PushDevice.create({ uid: 'a1', token: 'p1' });
    assert.deepEqual((await call('GET', '/reachable?uid=a1', { headers: svc('calls') })).body, { reachable: true });
    assert.deepEqual((await call('GET', '/reachable?uid=nobody', { headers: svc('orders') })).body, { reachable: false });
    assert.equal((await call('GET', '/reachable?uid=a1', { headers: svc('engagement') })).status, 200);
    assert.equal((await call('GET', '/reachable?uid=a1', { headers: phone('a1') })).status, 403);
    assert.equal((await call('GET', '/reachable?uid=a1', { headers: svc('admin-bff') })).status, 403);
    assert.equal((await call('GET', '/reachable', { headers: svc('calls') })).status, 400);
    assert.equal((await call('GET', '/reachable?uid=a1')).status, 401);
    await PushDevice.deleteMany({});
    assert.deepEqual((await call('GET', '/reachable?uid=a1', { headers: svc('calls') })).body, { reachable: false });
  });
});

describe('lib/fcm.js', () => {
  test('ok / dead / transient / unavailable, and it never throws', async () => {
    const mk = (err) => createFcmSender({ messaging: { send: async () => { if (err) throw err; } } });
    assert.deepEqual(await mk().send({}), { ok: true });
    for (const code of ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']) {
      assert.deepEqual(await mk(Object.assign(new Error('x'), { code })).send({}), { ok: false, dead: true, error: code });
    }
    assert.equal((await mk(Object.assign(new Error('The registration token is not a valid FCM registration token'), { code: 'messaging/invalid-argument' })).send({})).dead, true);
    assert.equal((await mk(Object.assign(new Error('Invalid JSON payload received'), { code: 'messaging/invalid-argument' })).send({})).dead, false, 'a malformed MESSAGE must not wipe phones');
    assert.equal((await mk(Object.assign(new Error('x'), { code: 'messaging/internal-error' })).send({})).dead, false);
    assert.equal((await mk(new Error('no code')).send({})).dead, false);
    const none = createFcmSender({ messaging: () => null });
    assert.deepEqual([none.available(), await none.send({})], [false, { ok: false, dead: false, unavailable: true }]);
    assert.equal(createFcmSender().available(), false);
  });
});
