// Phase 5 monolith side: the ORDERS_URL switch. Unset = bookings, chadhava orders and reviews are served here exactly as before; set = they answer
// 404 (the orders service owns them), the pooja-stats route steps aside, the saga sweeper leaves booking / chadhava intents to the orders service,
// the boot refuses a half-configured stack, and old terminal intents are pruned.
// Run: TEST_MONGODB_URI=mongodb://127.0.0.1:27231/x node --test --test-concurrency=1 src/lib/orders-mode.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import mongoose from 'mongoose';

import { createApp } from '../app.js';
import { Booking, Operator, Pooja, PoojaReview } from '../models.js';
import { hashPassword } from '../modules/operators/index.js';
import { sign } from '../modules/operators/session.js';
import { signServiceToken } from './service-jwt.js';
import * as wallet from './wallet-client.js';
import * as saga from './wallet-saga.js';
import { startWalletStub } from './wallet-stub.mjs';

const SECRET = 'test-secret-test-secret-1234';
const IDENTITY_MODE = Boolean(process.env.IDENTITY_MODE);
const dbUri = (n) => {
  const u = new URL(process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27231/x');
  u.pathname = `/${n}`;
  return u.toString();
};
const OID = '000000000000000000000000';

describe('the monolith app with ORDERS_URL set', { skip: IDENTITY_MODE && 'cookie sessions are phase 1; IDENTITY_URL set (phase 2) moves them to the admin BFF' }, () => {
  let server; let base; let cookie;
  before(async () => {
    process.env.INTERNAL_JWT_SECRET = SECRET;
    await mongoose.connect(dbUri('orders_mode_app_tests'));
    await mongoose.connection.dropDatabase();
    await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
    const o = await Operator.create({ username: 'admin1', passwordHash: hashPassword('password-123'), role: 'admin' });
    cookie = `pooja_admin=${encodeURIComponent(sign({ uid: String(o._id), role: 'admin', exp: Date.now() + 3600_000 }))}`;
    await Pooja.create({ slug: 'navratri', title: 'Navratri', packages: [{ key: 'individual', name: 'Individual', persons: 1, coins: 100 }] });
    await Booking.create({ uid: 'u1', bookingRef: 'BKT-AAAAA', poojaSlug: 'navratri', status: 'booked', requestId: 'r-1' });
    await PoojaReview.create({ bookingId: 'b1', uid: 'u1', poojaSlug: 'navratri', rating: 5, name: 'Meera' });
    server = createApp().listen(0, '127.0.0.1');
    await new Promise((ok) => server.once('listening', ok));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => {
    await new Promise((ok) => server.close(ok));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  afterEach(() => { delete process.env.ORDERS_URL; delete process.env.CATALOG_URL; });
  const get = async (path, { method = 'GET', headers = {}, body } = {}) => {
    const res = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, body });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* html 404 */ }
    return { status: res.status, body: json };
  };

  const RETIRED = [
    ['GET', '/api/bookings'], ['GET', `/api/bookings/${OID}`], ['POST', '/api/bookings'], ['POST', `/api/bookings/${OID}/cancel`], ['POST', `/api/bookings/${OID}/review`],
    ['POST', '/api/chadhava/orders'], ['GET', '/api/chadhava/orders'], ['POST', `/api/chadhava/orders/${OID}/cancel`], ['POST', '/api/chadhava'],
    ['GET', '/api/poojas/navratri/reviews'],
    ['GET', '/api/admin/bookings'], ['PUT', `/api/admin/bookings/${OID}/status`], ['GET', '/api/admin/reviews'], ['PUT', `/api/admin/reviews/${OID}`],
    ['GET', '/api/admin/chadhava-orders'], ['PUT', `/api/admin/chadhava-orders/${OID}/status`],
  ];

  test('with ORDERS_URL set every booking / chadhava-order / review route answers 404 - devotee, public and operator alike (an operator cookie shows it is not the gate)', async () => {
    process.env.ORDERS_URL = 'http://127.0.0.1:9';
    for (const [method, path] of RETIRED) {
      const r = await get(path, { method, headers: { cookie }, body: method === 'GET' || method === 'DELETE' ? undefined : '{}' });
      assert.equal(r.status, 404, `${method} ${path} -> ${r.status}`);
    }
    // a stranger still meets the gate, never an order
    assert.equal((await get('/api/bookings')).status, 401);
    assert.equal((await get('/api/admin/bookings')).status, 401);
  });

  test('with ORDERS_URL unset the same routes are served by the monolith again (rollback = unset it)', async () => {
    assert.equal((await get('/api/bookings')).status, 401, 'devotee route wants a token');
    assert.equal((await get('/api/chadhava/orders')).status, 401);
    const gone = await get('/api/chadhava', { method: 'POST', body: '{}' });
    assert.deepEqual([gone.status, gone.body?.code], [410, 'gone']);
    assert.equal((await get('/api/poojas/navratri/reviews')).status, 200);
    assert.equal((await get('/api/poojas/navratri/reviews')).body.reviews[0].name, 'Meera');
    const list = await get('/api/admin/bookings', { headers: { cookie } });
    assert.deepEqual([list.status, list.body.bookings.length], [200, 1]);
    assert.equal((await get('/api/admin/reviews', { headers: { cookie } })).body.reviews.length, 1);
    assert.equal((await get('/api/admin/chadhava-orders', { headers: { cookie } })).status, 200);
  });

  test('what is NOT orders\' stays: the chadhava catalogue / listings, the pooja definitions and the booking-independent admin routes are still served', async () => {
    process.env.ORDERS_URL = 'http://127.0.0.1:9';
    assert.equal((await get('/api/chadhava/offerings')).status, 200);
    assert.equal((await get('/api/chadhava/listings')).status, 200);
    assert.equal((await get('/api/poojas')).status, 200);
    assert.equal((await get('/api/admin/poojas', { headers: { cookie } })).status, 200);
    assert.equal((await get('/api/admin/chadhava-listings', { headers: { cookie } })).status, 200);
  });

  test('GET /internal/orders/pooja-stats: the monolith answers it only while ORDERS_URL is unset (then the orders service does, same path, same shape)', async () => {
    process.env.CATALOG_URL = 'http://127.0.0.1:9';
    const tok = signServiceToken({ iss: 'catalog' }, { secret: SECRET });
    const ask = () => fetch(`${base}/internal/orders/pooja-stats`, { headers: { authorization: `Bearer ${tok}` } });
    const ok = await ask();
    assert.equal(ok.status, 200);
    assert.deepEqual((await ok.json()).stats.navratri, { bookingCount: 1, rating: { avg: 5, count: 1 } });
    process.env.ORDERS_URL = 'http://127.0.0.1:9';
    assert.equal((await ask()).status, 404);
  });
});

describe('the saga sweeper with ORDERS_URL set leaves booking / chadhava intents to the orders service', () => {
  let stub;
  before(async () => {
    stub = await startWalletStub({ secret: SECRET });
    process.env.INTERNAL_JWT_SECRET = SECRET;
    await mongoose.connect(dbUri('orders_mode_sweeper_tests'));
    await mongoose.connection.dropDatabase();
    await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  });
  after(async () => {
    await stub.close();
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  beforeEach(async () => {
    process.env.WALLET_URL = stub.url;
    stub.mode = 'up';
    stub.hits.length = 0;
    wallet._reset();
    await saga.WalletIntent.deleteMany({});
  });
  afterEach(() => { delete process.env.WALLET_URL; delete process.env.ORDERS_URL; });

  const old = new Date(Date.now() - 60_000);
  const seed = async () => {
    stub.fund('s1', 100);
    stub.txns.set('booking:s1:r1', { id: '1'.padStart(24, '0'), uid: 's1', type: 'booking_debit', amount: -10, status: 'posted', idempotencyKey: 'booking:s1:r1', balanceAfter: 90 });
    stub.txns.set('call:c1:min:1', { id: '2'.padStart(24, '0'), uid: 's1', type: 'call_debit', amount: -5, status: 'posted', idempotencyKey: 'call:c1:min:1', balanceAfter: 85 });
    stub.txns.set('booking:b1:debit', { id: '3'.padStart(24, '0'), uid: 's1', type: 'booking_debit', amount: -7, status: 'posted', idempotencyKey: 'booking:b1:debit', balanceAfter: 83 });
    stub.txns.set('chadhava:s1:c1', { id: '4'.padStart(24, '0'), uid: 's1', type: 'chadhava_debit', amount: -8, status: 'posted', idempotencyKey: 'chadhava:s1:c1', balanceAfter: 75 });
    const mk = (key, extra) => ({ key, uid: 's1', amount: 5, status: 'pending', openedAt: old, ...extra });
    await saga.WalletIntent.insertMany([
      mk('booking:s1:r1', { kind: 'booking', requestId: 'r1', payload: { uid: 's1', requestId: 'r1', totalCoins: 10 } }),
      mk('chadhava:s1:c1', { kind: 'chadhava', requestId: 'c1', payload: { uid: 's1', requestId: 'c1', totalCoins: 8 } }),
      mk('booking:b1:refund', { kind: 'refund', refType: 'booking', refId: 'b1', ofKey: 'booking:b1:debit' }),
      mk('chadhava:o1:refund', { kind: 'refund', refType: 'chadhava', refId: 'o1', ofKey: 'chadhava:s1:c1' }),
      mk('call:c1:refund:1', { kind: 'refund', refType: 'call', refId: 'c1', ofKey: 'call:c1:min:1' }),
    ]);
  };

  test('unset: everything pending is swept (the monolith owns bookings, chadhava orders and their refunds)', async () => {
    await seed();
    // the booking / chadhava completers need their module registered; importing the services does that
    await import('../modules/bookings/bookings.service.js');
    await import('../modules/chadhava/chadhava.service.js');
    const r = await saga.sweep({ minAgeMs: 0 });
    assert.equal(r.checked, 5);
  });

  test('set: only the call refund is swept; the booking / chadhava debits and their refunds stay pending, untouched, for the orders service', async () => {
    await saga.WalletIntent.deleteMany({});
    await Booking.deleteMany({}); // the unset-mode test above wrote one
    stub.txns.clear();
    await seed();
    process.env.ORDERS_URL = 'http://127.0.0.1:9';
    const r = await saga.sweep({ minAgeMs: 0 });
    assert.deepEqual([r.checked, r.done], [1, 1]);
    const left = (await saga.WalletIntent.find({ status: 'pending' }).lean()).map((x) => x.key).sort();
    assert.deepEqual(left, ['booking:b1:refund', 'booking:s1:r1', 'chadhava:o1:refund', 'chadhava:s1:c1']);
    assert.deepEqual(stub.hits.map((x) => x.path), ['/refund'], 'the wallet was asked about the call refund only');
    assert.equal(stub.hits[0].body.ofKey, 'call:c1:min:1');
    assert.equal(await Booking.countDocuments(), 0, 'no booking was written into the monolith\'s database');
  });
});

describe('refunds queued before phase 5 are upgraded by the sweeper (the wallet service now refuses a refund that names no debit)', () => {
  test('legacyRefundProof derives ofKey from the key of a booking / chadhava / call refund and a goodwill refund\'s reason from its note', async () => {
    await mongoose.connect(dbUri('orders_mode_proof_tests'));
    await mongoose.connection.dropDatabase();
    try {
      const b = await Booking.create({ uid: 'u7', bookingRef: 'BKT-PROOF', requestId: 'req-proof-1' });
      const proof = (key, extra = {}) => saga.legacyRefundProof({ key, ...extra });
      assert.deepEqual(await proof(`booking:${b._id}:refund`), { ofKey: 'booking:u7:req-proof-1' });
      assert.deepEqual(await proof('booking:u7:req-proof-1:failed'), { ofKey: 'booking:u7:req-proof-1' });
      assert.deepEqual(await proof('chadhava:u7:req-c-1:failed'), { ofKey: 'chadhava:u7:req-c-1' });
      assert.deepEqual(await proof('call:abc123:refund:2'), { ofKey: 'call:abc123:min:2' });
      assert.deepEqual(await proof('call:abc123:goodwill:rid-1', { note: 'call dropped' }), { reason: 'call dropped' });
      assert.deepEqual(await proof('booking:000000000000000000000000:refund'), {}, 'an order that is gone proves nothing');
      assert.deepEqual(await proof('whatever'), {});
      assert.deepEqual(await proof('x', { ofKey: 'd', reason: undefined }), { ofKey: 'd', reason: undefined }, 'a new intent is left as it is');
    } finally {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  });
});

describe('old terminal intents are pruned', () => {
  before(async () => {
    await mongoose.connect(dbUri('orders_mode_prune_tests'));
    await mongoose.connection.dropDatabase();
    await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  });
  after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

  test('done / failed / expired / refunded older than the retention go; younger ones and every pending one stay; idempotent', async () => {
    const old = new Date(Date.now() - 40 * 86_400_000);
    const young = new Date(Date.now() - 5 * 86_400_000);
    const mk = (key, status, at) => ({ key, kind: 'booking', uid: 'u', amount: 1, status, openedAt: at, createdAt: at, updatedAt: at });
    await saga.WalletIntent.collection.insertMany([
      mk('a', 'done', old), mk('b', 'failed', old), mk('c', 'expired', old), mk('d', 'refunded', old), mk('e', 'done', young), mk('f', 'pending', old), mk('g', 'pending', young),
    ]);
    assert.equal(await saga.pruneIntents(), 4);
    assert.deepEqual((await saga.WalletIntent.find().lean()).map((x) => x.key).sort(), ['e', 'f', 'g']);
    assert.equal(await saga.pruneIntents(), 0);
    assert.equal(saga.RETENTION_MS, 30 * 86_400_000);
  });
});

describe('booting the monolith with ORDERS_URL', () => {
  const boot = (env) => spawnSync(process.execPath, [fileURLToPath(new URL('../server.js', import.meta.url))], {
    env: { PATH: process.env.PATH, MONGODB_URI: dbUri('orders_boot_refusal'), PORT: '0', ...env }, encoding: 'utf8', timeout: 15_000,
  });
  test('ORDERS_URL without the services it needs is refused, and so is a missing secret', () => {
    const a = boot({ ORDERS_URL: 'http://127.0.0.1:9', INTERNAL_JWT_SECRET: SECRET });
    assert.equal(a.status, 1);
    assert.match(a.stderr, /ORDERS_URL is set but CATALOG_URL, WALLET_URL, IDENTITY_URL, ENGAGEMENT_URL are not/);
    const b = boot({ ORDERS_URL: 'http://127.0.0.1:9', CATALOG_URL: 'http://127.0.0.1:9', WALLET_URL: 'http://127.0.0.1:9', IDENTITY_URL: 'http://127.0.0.1:9' });
    assert.equal(b.status, 1);
    assert.match(b.stderr, /ENGAGEMENT_URL is not/);
    const c = boot({ ORDERS_URL: 'http://127.0.0.1:9', CATALOG_URL: 'http://127.0.0.1:9', WALLET_URL: 'http://127.0.0.1:9', IDENTITY_URL: 'http://127.0.0.1:9', ENGAGEMENT_URL: 'http://127.0.0.1:9' });
    assert.equal(c.status, 1);
    assert.match(c.stderr, /INTERNAL_JWT_SECRET/);
  });
});
