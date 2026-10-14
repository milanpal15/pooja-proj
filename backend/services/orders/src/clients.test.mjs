// The outbound clients, with a fake fetch: identity directory (cache, degrade to absent), push (device -> token -> Expo, never throws),
// catalog (critical reads fail closed, the existence check degrades), wallet (ambiguity, business answers).
// Run: node --test src/clients.test.mjs   (no database needed)
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createCatalogClient } from './lib/catalog.js';
import { createIdentityDirectory } from './lib/identity.js';
import { createPush } from './lib/push.js';
import { createWalletClient } from './lib/wallet.js';
import { testConfig } from './test-kit.mjs';

const cfg = { ...testConfig('clients_unused'), walletTimeoutMs: 150, serviceTimeoutMs: 150 };
const res = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
const log = () => { const l = []; return { l, warn: (m) => l.push(['warn', m]), error: (m) => l.push(['error', m]), info() {} }; };

describe('identity directory', () => {
  test('names / device ids are cached 15 s; the signed token\'s name needs no call; an unknown uid is cached too', async () => {
    const calls = [];
    let t = 1_000_000;
    const d = createIdentityDirectory(cfg, { now: () => t, fetchImpl: async (u) => { calls.push(String(u)); return /unknown/.test(u) ? res(404, { error: 'nf', code: 'not_found' }) : res(200, { user: { uid: 'u1', name: 'Asha', deviceId: 'dev1' } }); } });
    assert.equal(await d.userName('u1', 'Hint Name'), 'Hint Name');
    assert.equal(calls.length, 0);
    assert.equal(await d.userName('u1', ''), 'Asha');
    assert.equal(await d.deviceIdOf('u1'), 'dev1');
    assert.equal(calls.length, 1, 'one call served both questions');
    assert.equal(await d.userName('unknown', undefined), '');
    assert.equal(await d.userName('unknown', undefined), '');
    assert.equal(calls.length, 2);
    t += 16_000;
    await d.userName('u1');
    assert.equal(calls.length, 3, 'after the TTL it asks again');
    assert.match(calls[0], /\/internal\/identity\/directory\/users\/u1$/);
  });

  test('identity down: stale value kept, else absent; the next 5 s skip the network; whoByUid is an empty map - never an error', async () => {
    let up = true; let n = 0; let t = 5_000_000;
    const l = log();
    const d = createIdentityDirectory(cfg, { logger: l, now: () => t, fetchImpl: async (u) => { n++; if (!up) throw new Error('refused'); return /lookup/.test(u) ? res(200, { users: [{ uid: 'u1', name: '', contact: '+91 1' }] }) : res(200, { user: { uid: 'u1', name: 'Asha' } }); } });
    assert.equal(await d.userName('u1'), 'Asha');
    up = false; t += 16_000;
    assert.equal(await d.userName('u1'), 'Asha', 'stale on error');
    assert.equal(await d.userName('never-cached'), '');
    const before = n;
    assert.equal(await d.userName('another'), '');
    assert.equal(n, before, 'inside the back-off window the network is not touched');
    assert.deepEqual([...(await d.whoByUid(['u1']))], []);
    t += 6_000; up = true;
    assert.deepEqual([...(await d.whoByUid(['u1', 'u1', '']))], [['u1', '+91 1']], '`name || contact`');
    assert.ok(l.l.some(([k, m]) => k === 'warn' && /identity unreachable/.test(m)));
  });
});

describe('push', () => {
  const mk = (handler, { throwingIdentity = false } = {}) => {
    const seen = [];
    const identity = { deviceIdOf: async (uid) => { if (throwingIdentity) throw new Error('boom'); return uid === 'u1' ? 'dev1' : undefined; } };
    const push = createPush({ ...cfg, expoPushUrl: 'http://expo.test/send' }, { identity, logger: log(), fetchImpl: async (u, init) => { seen.push({ u: String(u), init }); return handler(String(u), init); } });
    return { push, seen };
  };

  test('device id (identity) -> push token (engagement) -> Expo, with the title / body / data', async () => {
    const { push, seen } = mk((u) => (u.includes('/push-token') ? res(200, { pushToken: 'ExponentPushToken[abc]' }) : res(200, {})));
    await push._send('u1', { title: 'T', body: 'B', data: { type: 'x' } });
    assert.match(seen[0].u, /\/internal\/engagement\/visitors\/dev1\/push-token$/);
    assert.equal(seen[1].u, 'http://expo.test/send');
    assert.deepEqual(JSON.parse(seen[1].init.body), { to: 'ExponentPushToken[abc]', title: 'T', body: 'B', data: { type: 'x' } });
  });

  test('no device, no token, or a token that is not an Expo one: nothing is sent', async () => {
    const a = mk(() => res(200, { pushToken: 'ExponentPushToken[abc]' }));
    await a.push._send('nobody', { title: 'T', body: 'B' });
    assert.equal(a.seen.length, 0);
    const b = mk(() => res(200, { pushToken: null }));
    await b.push._send('u1', { title: 'T', body: 'B' });
    assert.equal(b.seen.length, 1);
    const c = mk(() => res(200, { pushToken: 'fcm-garbage' }));
    await c.push._send('u1', { title: 'T', body: 'B' });
    assert.equal(c.seen.length, 1);
  });

  test('notifyDevotee never throws and never rejects: engagement down, Expo down, identity exploding', async () => {
    for (const m of [mk(() => { throw new Error('engagement down'); }), mk((u) => (u.includes('/push-token') ? res(200, { pushToken: 'ExponentPushToken[abc]' }) : res(500, {}))), mk(() => res(200, {}), { throwingIdentity: true })]) {
      assert.equal(m.push.notifyDevotee('u1', { title: 'T', body: 'B' }), undefined);
      await new Promise((r) => setTimeout(r, 30));
    }
  });
});

describe('push through identity (FCM)', () => {
  const mk = (handler) => {
    const seen = [];
    const identity = { deviceIdOf: async () => 'dev1' };
    const push = createPush({ ...cfg, expoPushUrl: 'http://expo.test/send' }, { identity, logger: log(), fetchImpl: async (u, init) => { seen.push({ u: String(u), init }); return handler(String(u), init); } });
    return { push, seen };
  };
  const tick = () => new Promise((r) => setTimeout(r, 30));

  test('notifyDevotee posts the booking update to identity push/send as `orders`, on the default channel; the Expo path still runs beside it', async () => {
    const { push, seen } = mk((u) => (u.includes('/push-token') ? res(200, { pushToken: 'ExponentPushToken[abc]' }) : res(200, { sent: 1, devices: 1 })));
    assert.equal(push.notifyDevotee('u1', { title: 'Booking confirmed', body: 'Your pooja is booked', data: { type: 'booking', id: 'b1' } }), undefined);
    await tick();
    const fcm = seen.find((x) => /\/internal\/identity\/push\/send$/.test(x.u));
    assert.ok(fcm, 'identity push/send was called');
    assert.deepEqual(JSON.parse(fcm.init.body), { uid: 'u1', title: 'Booking confirmed', body: 'Your pooja is booked', data: { type: 'booking', id: 'b1' }, channelId: 'default' });
    assert.equal(JSON.parse(Buffer.from(fcm.init.headers.authorization.split('.')[1], 'base64url')).iss, 'orders');
    assert.ok(seen.some((x) => x.u === 'http://expo.test/send'), 'the legacy Expo path is unchanged');
  });

  test('identity push/send down or refusing never throws, never rejects, and does not stop the Expo path', async () => {
    for (const fail of [() => { throw new Error('identity down'); }, () => res(403, { code: 'wrong_issuer' }), () => res(500, {})]) {
      const { push, seen } = mk((u) => (/push\/send/.test(u) ? fail() : u.includes('/push-token') ? res(200, { pushToken: 'ExponentPushToken[abc]' }) : res(200, {})));
      assert.equal(push.notifyDevotee('u1', { title: 'T', body: 'B' }), undefined);
      await tick();
      assert.ok(seen.some((x) => x.u === 'http://expo.test/send'));
    }
  });
});

describe('catalog client', () => {
  const snap = { pooja: { slug: 's', title: 'T', titleHi: null, templeSlug: null, publishAt: '2030-01-01T00:00:00.000Z', bookingClosesAt: null, packages: [{ key: 'k', name: null, nameHi: null, persons: 1, coins: 5 }] }, temple: null };

  test('a purchase read: dates become Dates, nulls become undefined; 404 is "not available"; anything else is 503 catalog_unavailable', async () => {
    const c = createCatalogClient(cfg, { logger: log(), fetchImpl: async () => res(200, snap) });
    const out = await c.poojaForBooking('s');
    assert.ok(out.pooja.publishAt instanceof Date);
    assert.deepEqual([out.pooja.titleHi, out.pooja.templeSlug, out.pooja.packages[0].name, out.pooja.bookingClosesAt], [undefined, undefined, undefined, null]);
    assert.equal(await createCatalogClient(cfg, { fetchImpl: async () => res(404, { code: 'not_found' }) }).poojaForBooking('x'), null);
    for (const f of [async () => res(500, {}), async () => res(503, {}), async () => { throw new Error('refused'); }, async () => res(401, { code: 'bad' }), async () => res(200, 'not json')]) {
      await assert.rejects(() => createCatalogClient(cfg, { logger: log(), fetchImpl: f }).chadhavaForOrder('s'), (e) => e.status === 503 && e.code === 'catalog_unavailable');
    }
  });

  test('never cached for a purchase: two reads are two calls; the existence check is cached 15 s and degrades to true', async () => {
    let n = 0;
    const c = createCatalogClient(cfg, { fetchImpl: async () => { n++; return res(200, snap); } });
    await c.poojaForBooking('s'); await c.poojaForBooking('s');
    assert.equal(n, 2);
    let m = 0; let up = true;
    const e = createCatalogClient(cfg, { logger: log(), fetchImpl: async () => { m++; if (!up) throw new Error('down'); return res(200, { exists: false }); } });
    assert.equal(await e.poojaExists('a'), false);
    assert.equal(await e.poojaExists('a'), false);
    assert.equal(m, 1);
    up = false;
    assert.equal(await e.poojaExists('b'), true, 'catalog unreachable: assume it exists (an unknown slug then yields an empty list)');
  });
});

describe('wallet client', () => {
  test('refund requires ofKey; a debit needs a key; the token is signed by `orders`', async () => {
    let seen;
    const w = createWalletClient(cfg, { fetchImpl: async (u, init) => { seen = { u: String(u), init }; return res(200, { txn: { id: 't1' }, balance: 5 }); } });
    await assert.rejects(() => w.refund({ uid: 'u', amount: 1, idempotencyKey: 'k' }), (e) => e.status === 400);
    await assert.rejects(() => w.debit({ uid: 'u', amount: 1, type: 'booking_debit' }), (e) => e.code === 'no_key');
    assert.equal(seen, undefined, 'a call with no key never leaves the process');
    const out = await w.refund({ uid: 'u', amount: 1, idempotencyKey: 'k', ofKey: 'd' });
    assert.deepEqual([out.txn._id, out.balance, out.duplicate], ['t1', 5, false]);
    assert.deepEqual(JSON.parse(seen.init.body), { uid: 'u', amount: 1, key: 'k', ofKey: 'd' });
    const claims = JSON.parse(Buffer.from(seen.init.headers.authorization.split('.')[1], 'base64url'));
    assert.equal(claims.iss, 'orders');
  });

  test('business answers keep their code and extras; every non-answer is ambiguous 503; a refused token is OUR fault (503, not a business answer)', async () => {
    // The case below waits for the client's own timeout, and AbortSignal.timeout() timers are unref'd: with nothing else
    // running, Node 20 on Linux ends the test early ("event loop has already resolved"). Keep the loop alive until it's done.
    const keepAlive = setInterval(() => {}, 100);
    try {
      const w = (f) => createWalletClient(cfg, { logger: log(), fetchImpl: f });
      await assert.rejects(() => w(async () => res(402, { error: 'Not enough coins.', code: 'insufficient_coins', needed: 5, balance: 1, shortfall: 4, type: 'booking_debit' })).debit({ uid: 'u', amount: 5, type: 'booking_debit', idempotencyKey: 'k' }),
        (e) => e.status === 402 && e.code === 'insufficient_coins' && e.extra.shortfall === 4 && !e.ambiguous);
      await assert.rejects(() => w(async () => res(409, { error: 'x', code: 'already_refunded' })).refund({ uid: 'u', amount: 1, idempotencyKey: 'k', ofKey: 'd' }), (e) => e.status === 409 && e.code === 'already_refunded');
      for (const f of [async () => res(500, {}), async () => { throw new Error('reset'); }, async () => res(200, '<html/>'), async () => res(401, { code: 'bad_signature' }), async () => res(403, { code: 'wrong_issuer' }), async () => res(404, '<h1>x</h1>'), (_u, init) => new Promise((_ok, no) => init.signal.addEventListener('abort', () => no(Object.assign(new Error('aborted'), { name: 'TimeoutError' }))))]) {
        await assert.rejects(() => w(f).getBalance('u'), (e) => e.status === 503 && e.code === 'wallet_unavailable' && e.ambiguous === true);
      }
      assert.equal(await w(async () => { throw new Error('x'); }).balanceOrUndefined('u'), undefined);
    } finally {
      clearInterval(keepAlive);
    }
  });
});
