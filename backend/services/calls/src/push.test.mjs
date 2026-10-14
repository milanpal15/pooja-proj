// Background push: the presence rule (a push-reachable astrologer stays callable with the app closed, for a bounded time), the flag following
// identity's registry, the incoming-call notification through identity's `push/send`, and the identity client's cache / failure policy.
// Run: TEST_MONGODB_URI=mongodb://127.0.0.1:27271/x node --test --test-concurrency=1 src/push.test.mjs
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { createIdentityDirectory, REACHABLE_TTL_MS } from './lib/identity.js';
import { createPush } from './lib/push.js';
import { Astrologer } from './models.js';
import { effectivePresence, PRESENCE_FRESH_MS, PUSH_REACHABLE_MS } from './modules/astrologers/astrologer.model.js';
import { boot } from './test-kit.mjs';

const res = (status, body) => ({ status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });

describe('the presence rule', () => {
  const now = 1_000_000_000_000;
  const row = (extra) => ({ presence: 'online', lastSeenAt: new Date(now - PRESENCE_FRESH_MS - 1), ...extra });

  test('boundaries: 45 s for everyone, 4 h for a push-reachable astrologer, busy stays busy, a deliberate offline always wins', () => {
    assert.equal(effectivePresence({ presence: 'online', lastSeenAt: new Date(now - PRESENCE_FRESH_MS + 1) }, now), 'online');
    assert.equal(effectivePresence(row({ pushReachable: false }), now), 'offline', 'no phone registered: the 45 s rule applies');
    assert.equal(effectivePresence(row(), now), 'offline', 'a row from before the flag existed behaves the same');
    assert.equal(effectivePresence(row({ pushReachable: true }), now), 'online', 'phone registered: still callable');
    assert.equal(effectivePresence(row({ pushReachable: true, lastSeenAt: new Date(now - PUSH_REACHABLE_MS + 1000) }), now), 'online');
    assert.equal(effectivePresence(row({ pushReachable: true, lastSeenAt: new Date(now - PUSH_REACHABLE_MS - 1) }), now), 'offline', 'but not forever');
    assert.equal(effectivePresence({ presence: 'offline', pushReachable: true, lastSeenAt: new Date(now) }, now), 'offline');
    assert.equal(effectivePresence({ presence: 'busy', pushReachable: false, lastSeenAt: new Date(now - 99 * PUSH_REACHABLE_MS) }, now), 'busy');
    assert.equal(effectivePresence({ presence: 'online', pushReachable: true }, now), 'offline', 'never seen at all: offline');
  });
});

describe('through the real service app', () => {
  let h;
  let astro;
  const UID = 'pa1';
  const stale = (ms = 10 * 60_000) => Astrologer.updateOne({ _id: astro._id }, { $set: { lastSeenAt: new Date(Date.now() - ms) } });
  const reload = () => Astrologer.findById(astro._id).lean();
  const request = (uid) => h.call('POST', '/calls', { uid, name: 'Asha Kumar', body: { astrologerId: String(astro._id), requestId: `r-${Math.random()}` } });
  let n = 0;
  const devotee = () => { const uid = `pd-${++n}`; h.wallet.fund(uid, 500); return uid; };

  before(async () => {
    h = await boot('calls_tests_push');
    astro = await Astrologer.create({ name: 'Pt. Push', ratePerMin: 10, platformSharePct: 30, signInEmail: 'push@example.com', uid: UID, status: 'active', listed: true, presence: 'offline' });
  });
  after(() => h.stop());

  test('the flag follows identity\'s registry: set when going online, refreshed on every heartbeat, KEPT when identity cannot answer', async () => {
    h.identity.reachable[UID] = false;
    assert.equal((await h.call('PUT', '/astrologer/me/presence', { uid: UID, body: { online: true } })).body.presence, 'online');
    assert.equal((await reload()).pushReachable, false);
    h.identity.reachable[UID] = true;
    assert.equal((await h.call('POST', '/astrologer/me/heartbeat', { uid: UID })).body.ok, true);
    assert.equal((await reload()).pushReachable, true);
    h.identity.reachableDown = true;
    await h.call('POST', '/astrologer/me/heartbeat', { uid: UID });
    assert.equal((await reload()).pushReachable, true, 'identity down: the previous value stays');
    await h.call('PUT', '/astrologer/me/presence', { uid: UID, body: { online: true } });
    assert.equal((await reload()).pushReachable, true);
    h.identity.reachableDown = false;
    h.identity.reachable[UID] = false;
    await h.call('POST', '/astrologer/me/heartbeat', { uid: UID });
    assert.equal((await reload()).pushReachable, false, 'phone gone: the next check-in clears it');
  });

  test('public list, the astrologer\'s own view and the request check all use the same rule', async () => {
    await Astrologer.updateOne({ _id: astro._id }, { $set: { presence: 'online', pushReachable: true } });
    await stale();
    const pub = await h.call('GET', '/astrologers', { uid: 'x' });
    assert.equal(pub.body.astrologers.find((a) => a.name === 'Pt. Push').presence, 'online');
    assert.equal((await h.call('GET', '/astrologer/me', { uid: UID })).body.astrologer.presence, 'online');
    await Astrologer.updateOne({ _id: astro._id }, { $set: { pushReachable: false } });
    assert.equal((await h.call('GET', '/astrologers', { uid: 'x' })).body.astrologers.find((a) => a.name === 'Pt. Push').presence, 'offline');
    assert.equal((await h.call('GET', '/astrologer/me', { uid: UID })).body.astrologer.presence, 'offline');
    assert.equal('pushReachable' in (await h.call('GET', '/astrologer/me', { uid: UID })).body.astrologer, false, 'an internal flag is not part of any view');
  });

  test('a call to a push-reachable astrologer with a stale heartbeat succeeds and sends exactly one push; to a non-reachable one it is still 409', async () => {
    await Astrologer.updateOne({ _id: astro._id }, { $set: { presence: 'online', pushReachable: false } });
    await stale();
    h.push.sent.length = 0;
    const no = await request(devotee());
    assert.deepEqual([no.status, no.body.code, no.body.presence], [409, 'astrologer_unavailable', 'offline']);
    assert.equal(h.push.sent.length, 0);

    await Astrologer.updateOne({ _id: astro._id }, { $set: { pushReachable: true } });
    const yes = await request(devotee());
    assert.equal(yes.status, 201);
    assert.equal(h.push.sent.length, 1, 'exactly one notification');
    assert.deepEqual([h.push.sent[0].uid, h.push.sent[0].name, h.push.sent[0].callId.toString()], [UID, 'Asha', yes.body.call.id]);

    await Astrologer.updateOne({ _id: astro._id }, { $set: { lastSeenAt: new Date(Date.now() - PUSH_REACHABLE_MS - 60_000) } });
    assert.equal((await request(devotee())).status, 409, 'past the 4 h bound');
  });

  test('a push that explodes never fails the call request', async () => {
    await Astrologer.updateOne({ _id: astro._id }, { $set: { presence: 'online', pushReachable: true, lastSeenAt: new Date() } });
    h.push.throws = true;
    assert.equal((await request(devotee())).status, 201);
    h.push.throws = false;
  });
});

describe('createPush: the incoming-call notification goes through identity push/send', () => {
  const mk = ({ sendPush, expoToken = 'ExponentPushToken[abc]' } = {}) => {
    const sent = [];
    const expo = [];
    const identity = { deviceIdOf: async () => 'dev1', sendPush: async (uid, m) => { sent.push({ uid, m }); return sendPush ? sendPush() : { sent: 1, devices: 1 }; } };
    const push = createPush({ expoPushUrl: 'http://expo.test/send' }, { identity, settings: { pushToken: async () => expoToken }, fetchImpl: async (u, init) => { expo.push(JSON.parse(init.body)); return res(200, {}); } });
    return { push, sent, expo };
  };
  const tick = () => new Promise((r) => setTimeout(r, 20));

  test('title, first-name body, data {type, callId}, channel, 30 s TTL and a collapse tag; the legacy Expo path still runs', async () => {
    const m = mk();
    assert.equal(m.push.notifyIncomingCall('a1', 'Asha', 'call-9'), undefined);
    await tick();
    assert.deepEqual(m.sent, [{ uid: 'a1', m: { title: 'Incoming call', body: 'Asha is calling', data: { type: 'incoming_call', callId: 'call-9' }, channelId: 'incoming-calls', ttlSeconds: 30, tag: 'incoming_call' } }]);
    assert.equal(m.expo.length, 1);
    m.push.notifyIncomingCall('a1', '', 'call-10');
    await tick();
    assert.equal(m.sent[1].m.body, 'A devotee is calling');
  });

  test('never throws, never rejects: identity push rejecting, identity push throwing synchronously', async () => {
    const mkBad = (sendPush) => createPush({ expoPushUrl: 'http://x' }, { identity: { deviceIdOf: async () => undefined, sendPush }, settings: { pushToken: async () => null } });
    for (const sendPush of [async () => { throw new Error('boom'); }, () => { throw new Error('sync boom'); }]) {
      assert.equal(mkBad(sendPush).notifyIncomingCall('a1', 'Asha', 'c'), undefined);
      await tick();
    }
  });
});

describe('the identity client', () => {
  const cfg = { identityUrl: 'http://identity.test', secret: 'test-secret-test-secret-1234', serviceTimeoutMs: 500 };
  const mk = (handler) => {
    let t = 1_000_000;
    const seen = [];
    const d = createIdentityDirectory(cfg, { now: () => t, fetchImpl: async (u, init) => { seen.push({ u: String(u), init }); return handler(String(u), init); } });
    return { d, seen, advance: (ms) => { t += ms; } };
  };

  test('pushReachable asks identity, caches the answer ~60 s per uid, and says undefined (never false) when identity cannot answer', async () => {
    let up = true;
    const m = mk(async () => (up ? res(200, { reachable: true }) : res(500, { error: 'x' })));
    assert.equal(await m.d.pushReachable('u 1'), true);
    assert.match(m.seen[0].u, /\/internal\/identity\/push\/reachable\?uid=u\+1$/);
    assert.equal(await m.d.pushReachable('u 1'), true);
    assert.equal(m.seen.length, 1, 'cached');
    up = false;
    m.advance(REACHABLE_TTL_MS + 1);
    assert.equal(await m.d.pushReachable('u 1'), undefined, 'identity down after expiry: unknown, not false');
    assert.equal(await m.d.pushReachable(''), undefined);
    assert.equal(await mk(async () => res(200, { nope: 1 })).d.pushReachable('u'), undefined, 'a malformed answer is unknown too');
  });

  test('sendPush posts to push/send as `calls` and never rejects', async () => {
    const m = mk(async () => res(200, { sent: 2, devices: 2 }));
    assert.deepEqual(await m.d.sendPush('a1', { title: 'T', body: 'B' }), { sent: 2, devices: 2 });
    assert.match(m.seen[0].u, /\/internal\/identity\/push\/send$/);
    assert.deepEqual(JSON.parse(m.seen[0].init.body), { uid: 'a1', title: 'T', body: 'B' });
    assert.equal(JSON.parse(Buffer.from(m.seen[0].init.headers.authorization.split('.')[1], 'base64url')).iss, 'calls');
    const bad = mk(async () => { throw new Error('down'); });
    assert.equal((await bad.d.sendPush('a1', { title: 'T' })).sent, 0);
  });
});
