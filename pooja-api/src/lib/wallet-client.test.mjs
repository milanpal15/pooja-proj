// Phase 4 monolith side: the wallet client (fail CLOSED), the WALLET_URL switch, the purchase sagas (a lost answer is recovered, never
// double-charged, never lost), refunds, the billing ticker, the retired routes, the seeds that step aside, the boot refusal.
// Run: TEST_MONGODB_URI=mongodb://127.0.0.1:27231/x node --test --test-concurrency=1 src/lib/wallet-client.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { after, afterEach, before, beforeEach, describe, mock, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import express from 'express';
import mongoose from 'mongoose';

import { createApp } from '../app.js';
import { Booking, Operator, Pooja, Temple } from '../models.js';
import { Astrologer } from '../modules/astrologers/astrologer.model.js';
import * as astrologers from '../modules/astrologers/index.js';
import * as bookingsModule from '../modules/bookings/index.js';
import { tick } from '../modules/calls/billing.ticker.js';
import { CallSession } from '../modules/calls/call.model.js';
import * as callsMod from '../modules/calls/index.js';
import { ChadhavaOrder } from '../modules/chadhava/chadhava.model.js';
import * as chadhavaModule from '../modules/chadhava/index.js';
import { CoinPack } from '../modules/coins/coins.model.js';
import { seedModules } from '../modules/index.js';
import { hashPassword } from '../modules/operators/index.js';
import { sign } from '../modules/operators/session.js';
import * as payouts from '../modules/payouts/index.js';
import { startApp } from '../modules/_harness.mjs';
import { boot } from '../modules/test-kit.mjs';
import { WalletTxn, Wallet } from '../modules/wallet/wallet.model.js';
import * as walletMod from '../modules/wallet/index.js';
import * as wallet from './wallet-client.js';
import * as ledger from './wallet-ledger.js';
import * as saga from './wallet-saga.js';
import { startWalletStub } from './wallet-stub.mjs';

const SECRET = 'test-secret-test-secret-1234';
const IDENTITY_MODE = Boolean(process.env.IDENTITY_MODE);
const DAY = 86_400_000;
const day = (plus) => new Date(Date.now() + 5.5 * 3_600_000 + plus * DAY).toISOString().slice(0, 10);
const dbUri = (n) => {
  const u = new URL(process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27231/x');
  u.pathname = `/${n}`;
  return u.toString();
};

let stub;
before(async () => { stub = await startWalletStub({ secret: SECRET }); });
after(() => stub.close());
beforeEach(() => {
  stub.mode = 'up';
  stub.hits.length = 0;
  process.env.INTERNAL_JWT_SECRET = SECRET;
  process.env.WALLET_URL = stub.url;
  wallet._reset();
});
afterEach(() => {
  delete process.env.WALLET_URL;
  mock.restoreAll();
});

/* ──────────────────────────────────────────────────────────────────── the client ── */
describe('wallet client: fail closed, same keys, no cache, no retries', () => {
  test('a debit is signed by the monolith, carries the key, and returns the shape wallet.service returns', async () => {
    stub.fund('k1', 100);
    const d = await wallet.debit({ uid: 'k1', amount: 30, type: 'booking_debit', refType: 'booking', refId: 'b1', idempotencyKey: 'booking:k1:r1', note: 'x' });
    assert.deepEqual([d.balance, d.duplicate, d.txn.status, d.txn.amount], [70, false, 'posted', -30]);
    assert.equal(typeof d.txn._id, 'string');
    assert.equal(stub.hits[0].iss, 'monolith');
    assert.deepEqual([stub.hits[0].path, stub.hits[0].body.key, stub.hits[0].body.refId], ['/debit', 'booking:k1:r1', 'b1']);
    const again = await wallet.debit({ uid: 'k1', amount: 30, type: 'booking_debit', idempotencyKey: 'booking:k1:r1' });
    assert.deepEqual([again.balance, again.duplicate, again.txn._id], [70, true, d.txn._id]);
    assert.equal(stub.balance('k1'), 70, 'charged once');
  });

  test('a business refusal keeps the local error: 402 insufficient_coins with needed / balance / shortfall / type', async () => {
    stub.fund('k2', 10);
    await assert.rejects(
      () => wallet.debit({ uid: 'k2', amount: 50, type: 'booking_debit', idempotencyKey: 'k2-a' }),
      (e) => e.status === 402 && e.code === 'insufficient_coins' && e.extra.shortfall === 40 && e.extra.needed === 50 && e.extra.balance === 10 && e.extra.type === 'booking_debit' && !e.ambiguous,
    );
    await assert.rejects(() => wallet.debit({ uid: 'k2', amount: 0, type: 'booking_debit', idempotencyKey: 'k2-b' }), (e) => e.status === 400 && e.code === 'bad_amount');
    await assert.rejects(() => wallet.debit({ uid: 'k2', amount: 5, type: 'booking_debit' }), (e) => e.status === 400 && e.code === 'no_key');
    assert.equal(stub.hits.length, 2, 'a call with no key never leaves the process');
  });

  test('every way the wallet can fail to answer is 503 wallet_unavailable and AMBIGUOUS - never success, never 0, never a 500', async () => {
    stub.fund('k3', 100);
    for (const m of ['down', 'lost', 'broken', 'forbidden']) {
      stub.mode = m;
      for (const call of [
        () => wallet.debit({ uid: 'k3', amount: 5, type: 'booking_debit', idempotencyKey: `k3-${m}` }),
        () => wallet.refund({ uid: 'k3', amount: 5, idempotencyKey: `k3-r-${m}` }),
        () => wallet.getBalance('k3'),
        () => wallet.txnByKey('k3-x', 'k3'),
      ]) {
        await assert.rejects(call(), (e) => e.status === 503 && e.code === 'wallet_unavailable' && e.ambiguous === true, m);
      }
    }
  });

  test('a wallet that never answers is cut off at the timeout - as 503, not a hang', async () => {
    wallet._setTimeoutMs(150);
    stub.mode = 'hang';
    const t = Date.now();
    await assert.rejects(() => wallet.debit({ uid: 'k3', amount: 5, type: 'booking_debit', idempotencyKey: 'k3-hang' }), (e) => e.code === 'wallet_unavailable');
    assert.ok(Date.now() - t < 2000);
    assert.equal(wallet.TIMEOUT_MS, 5000, 'the production timeout is 5 s');
  });

  test('an answer that is not JSON, or has no code on a 4xx, is unavailable - an unreadable answer is never a success', async () => {
    const real = globalThis.fetch;
    const mk = (status, text) => mock.method(globalThis, 'fetch', async (u, init) => (String(u).startsWith(stub.url) ? new Response(text, { status }) : real(u, init)));
    mk(200, '<html>oops</html>');
    await assert.rejects(() => wallet.getBalance('k1'), (e) => e.code === 'wallet_unavailable');
    mock.restoreAll();
    mk(200, 'null');
    await assert.rejects(() => wallet.getBalance('k1'), (e) => e.code === 'wallet_unavailable');
    mock.restoreAll();
    mk(200, '{"balance":"lots"}');
    await assert.rejects(() => wallet.getBalance('k1'), (e) => e.code === 'wallet_unavailable');
    mock.restoreAll();
    mk(404, '<h1>not found</h1>');
    await assert.rejects(() => wallet.txnByKey('x'), (e) => e.code === 'wallet_unavailable');
    mock.restoreAll();
    mk(403, JSON.stringify({ error: 'x', code: 'wrong_issuer' }));
    await assert.rejects(() => wallet.getBalance('k1'), (e) => e.code === 'wallet_unavailable', 'a refused token is OUR fault, not a business answer');
  });

  test('no cache and no retry: two balance reads are two calls; a failed debit is exactly one call', async () => {
    stub.fund('k4', 7);
    assert.equal(await wallet.getBalance('k4'), 7);
    stub.fund('k4', 3);
    assert.equal(await wallet.getBalance('k4'), 10, 'the second read saw the change - nothing was cached');
    assert.equal(stub.hits.length, 2);
    stub.hits.length = 0;
    stub.mode = 'broken';
    await assert.rejects(() => wallet.debit({ uid: 'k4', amount: 1, type: 'booking_debit', idempotencyKey: 'k4-once' }));
    assert.equal(stub.hits.length, 1, 'never retried by the client (the caller retries with the SAME key)');
  });

  test('balanceOrUndefined: the number, or undefined when the wallet cannot say - never a made-up 0; a display read only', async () => {
    stub.fund('k5', 12);
    assert.equal(await wallet.balanceOrUndefined('k5'), 12);
    stub.mode = 'down';
    assert.equal(await wallet.balanceOrUndefined('k5'), undefined);
    await assert.rejects(() => wallet.getBalance('k5'), (e) => e.code === 'wallet_unavailable', 'the gating read still fails closed');
  });

  test('txnByKey: the row, or null for a key the wallet never saw; credit is goodwill only', async () => {
    stub.fund('k6', 10);
    await wallet.debit({ uid: 'k6', amount: 4, type: 'call_debit', idempotencyKey: 'call:1:min:1' });
    assert.equal((await wallet.txnByKey('call:1:min:1', 'k6')).status, 'posted');
    assert.equal(await wallet.txnByKey('call:1:min:2', 'k6'), null);
    const c = await wallet.credit({ uid: 'k6', amount: 5, idempotencyKey: 'fund-k6' });
    assert.equal(c.balance, 11);
    assert.equal(stub.hits.at(-1).body.type, 'bonus');
  });

  test('walletEnabled follows the variable (and the facade follows walletEnabled)', async () => {
    assert.equal(wallet.walletEnabled(), true);
    assert.equal(ledger.walletEnabled(), true);
    delete process.env.WALLET_URL;
    assert.equal(wallet.walletEnabled(), false);
  });
});

/* ─────────────────────────────────────────────────── the purchase sagas (orders) ── */
describe('bookings and chadhava with WALLET_URL set', () => {
  let h;
  const fund = (uid, n) => stub.fund(uid, n);
  const names = (n) => Array.from({ length: n }, (_, i) => ({ name: `Devotee ${i + 1}`, gotra: i ? '' : 'Kashyap' }));
  const book = (uid, over = {}) => h.call('POST', '/bookings', { uid, body: { poojaSlug: 'navratri', packageKey: 'family', names: names(4), requestId: `req-${Math.random()}`, ...over } });
  const order = (uid, over = {}) => h.call('POST', '/chadhava/orders', { uid, body: { listingSlug: 'pitru', items: [{ key: 'flowers', qty: 2 }, { key: 'diya', qty: 1 }], requestId: `req-${Math.random()}`, ...over } });
  const sweep = (o) => saga.sweep({ minAgeMs: 0, graceMs: 120_000, ...o });
  const intent = (key) => saga.WalletIntent.findOne({ key }).lean();
  const PK = (key, persons, coins) => ({ key, name: key[0].toUpperCase() + key.slice(1), persons, coins, order: persons });
  const bk = (uid, requestId) => `booking:${uid}:${requestId}`;

  before(async () => {
    process.env.INTERNAL_JWT_SECRET = SECRET;
    process.env.WALLET_URL = stub.url;
    h = await boot({ routers: (d) => ({ devotee: express.Router().use(bookingsModule.routers(d).devotee).use(chadhavaModule.routers(d).devotee) }) }, 'wallet_purchase_tests');
    await Temple.create({ slug: 'kashi', name: 'Kashi Vishwanath', location: 'Varanasi' });
    await Temple.create({ slug: 'gaya', name: 'Vishnupad', location: 'Gaya' });
    await Pooja.create({
      slug: 'navratri', title: 'Navratri Durga Pooja', titleHi: 'नवरात्रि', templeSlug: 'kashi', place: 'Varanasi', poojaDate: day(10),
      prasadAvailable: true, prasadFeeCoins: 99, cancelHours: 24, packages: [PK('individual', 1, 551), PK('family', 4, 1251)],
    });
    await chadhavaModule.seed();
    await mongoose.model('ChadhavaCategory').create({ slug: 'pitru', name: 'Pitru', order: 1 });
    await mongoose.model('ChadhavaListing').create({
      slug: 'pitru', title: 'Pitru Paksha Chadhava', templeSlug: 'gaya', place: 'Gaya', category: 'pitru', summary: 's', endsAt: new Date(Date.now() + 48 * 3_600_000),
      offerings: [{ key: 'flowers', title: 'Flowers', coins: 11, order: 1 }, { key: 'diya', title: 'Diya', coins: 21, order: 0 }],
    });
  });
  after(() => h.stop());
  beforeEach(async () => { await saga.WalletIntent.deleteMany({}); });

  test('a booking is paid at the wallet SERVICE (the local ledger is untouched); the intent is closed done; the balance is the service\'s', async () => {
    fund('p1', 2000);
    const r = await book('p1', { prasad: true, address: { line1: '1 Ghat Rd', city: 'Varanasi', pincode: '221001' }, totalCoins: 1 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.deepEqual([r.body.booking.totalCoins, r.body.balance], [1350, 650]);
    assert.equal(stub.balance('p1'), 650);
    assert.equal(await WalletTxn.countDocuments({ uid: 'p1' }), 0, 'nothing touched the monolith\'s own ledger');
    assert.equal(await Wallet.countDocuments({ uid: 'p1' }), 0);
    const b = await Booking.findOne({ uid: 'p1' });
    assert.equal(b.walletTxnId, stub.txns.get(bk('p1', b.requestId)).id, 'the booking points at the service\'s ledger row');
    assert.equal((await intent(bk('p1', b.requestId))).status, 'done');
    assert.deepEqual(b.statusHistory.map((x) => x.status), ['booked']);
  });

  test('retrying the same requestId: one charge (the same key), the same booking, created:false', async () => {
    fund('p2', 3000);
    const requestId = `req-retry-${Math.random()}`;
    const first = await book('p2', { requestId });
    const again = await book('p2', { requestId });
    assert.deepEqual([first.status, again.status, again.body.booking.id], [201, 200, first.body.booking.id], 'created, then an answer');
    assert.equal(stub.balance('p2'), 3000 - 1251);
    assert.equal(stub.postedFor(`booking:p2:`).length, 1);
    assert.equal(await Booking.countDocuments({ uid: 'p2' }), 1);
    // the retry of a request that already succeeded still shows a balance, from the wallet; with the wallet down it is simply absent
    stub.mode = 'down';
    const dark = await book('p2', { requestId });
    assert.deepEqual([dark.status, dark.body.booking.id, dark.body.balance], [200, first.body.booking.id, undefined]);
  });

  test('insufficient coins: 402 with the monolith\'s body shape, nothing created, the intent closed failed', async () => {
    fund('p3', 100);
    const requestId = `req-short-${Math.random()}`;
    const r = await book('p3', { requestId });
    assert.equal(r.status, 402);
    assert.deepEqual(r.body, { error: 'Not enough coins.', code: 'insufficient_coins', needed: 1251, balance: 100, shortfall: 1151, type: 'booking_debit' });
    assert.equal(await Booking.countDocuments({ uid: 'p3' }), 0);
    assert.equal((await intent(bk('p3', requestId))).status, 'failed');
    fund('p3', 2000);
    const ok = await book('p3', { requestId }); // the same request, after a top-up: reopened, charged once
    assert.equal(ok.status, 201);
    assert.equal(stub.balance('p3'), 2100 - 1251);
    assert.equal((await intent(bk('p3', requestId))).status, 'done');
  });

  test('wallet DOWN (the request never arrived): 503 wallet_unavailable, no booking, no balance change; the sweeper waits, then expires it; the retry charges once', async () => {
    fund('p4', 3000);
    const requestId = `req-down-${Math.random()}`;
    stub.mode = 'down';
    const r = await book('p4', { requestId });
    assert.deepEqual([r.status, r.body.code], [503, 'wallet_unavailable']);
    assert.equal(await Booking.countDocuments({ uid: 'p4' }), 0);
    assert.equal((await intent(bk('p4', requestId))).status, 'pending');
    stub.mode = 'up';
    assert.deepEqual(await sweep({ graceMs: 60_000 }), { checked: 1, done: 0, failed: 0, expired: 0, waiting: 1 }, 'not found at the wallet, but not yet old enough to call it "never arrived"');
    assert.equal(stub.balance('p4'), 3000);
    assert.equal((await sweep({ graceMs: 0 })).expired, 1);
    assert.equal((await intent(bk('p4', requestId))).status, 'expired');
    assert.equal(await Booking.countDocuments({ uid: 'p4' }), 0);
    const retry = await book('p4', { requestId });
    assert.equal(retry.status, 201);
    assert.equal(stub.balance('p4'), 3000 - 1251, 'charged exactly once');
    assert.equal((await intent(bk('p4', requestId))).status, 'done');
  });

  test('LOST ANSWER (the wallet charged, the monolith never heard): 503 to the user, then the sweeper writes the booking - one debit, one booking, nothing lost', async () => {
    fund('p5', 3000);
    const requestId = `req-lost-${Math.random()}`;
    stub.mode = (path, method) => (method === 'POST' && path === '/debit' ? 'lost' : 'up');
    const r = await book('p5', { requestId });
    assert.deepEqual([r.status, r.body.code], [503, 'wallet_unavailable']);
    assert.equal(stub.balance('p5'), 3000 - 1251, 'the money DID move');
    assert.equal(await Booking.countDocuments({ uid: 'p5' }), 0, 'and there is no booking yet');
    assert.equal((await intent(bk('p5', requestId))).status, 'pending');

    stub.mode = 'up';
    const s1 = await sweep();
    assert.deepEqual([s1.checked, s1.done], [1, 1]);
    const b = await Booking.find({ uid: 'p5' });
    assert.equal(b.length, 1);
    assert.deepEqual([b[0].totalCoins, b[0].status, b[0].poojaSlug, b[0].packageKey, b[0].templeName, b[0].persons, b[0].names.length], [1251, 'booked', 'navratri', 'family', 'Kashi Vishwanath', 4, 4]);
    assert.equal(b[0].walletTxnId, stub.txns.get(bk('p5', requestId)).id);
    assert.equal(stub.balance('p5'), 3000 - 1251);
    assert.deepEqual(await sweep(), { checked: 0, done: 0, failed: 0, expired: 0, waiting: 0 }, 'a second sweep finds nothing to do');
    // the user's own retry afterwards is an answer, not a second charge
    const retry = await book('p5', { requestId });
    assert.deepEqual([retry.status, retry.body.booking.id], [200, String(b[0]._id)]);
    assert.equal(stub.balance('p5'), 3000 - 1251);
    assert.equal(stub.postedFor('booking:p5:').length, 1);
  });

  test('LOST ANSWER, then the user retries BEFORE the sweeper: the same key returns the first result, the booking is written once, the sweeper has nothing left', async () => {
    fund('p6', 3000);
    const requestId = `req-lost-retry-${Math.random()}`;
    stub.mode = (path, method) => (method === 'POST' && path === '/debit' ? 'lost' : 'up');
    assert.equal((await book('p6', { requestId })).status, 503);
    stub.mode = 'up';
    const [a, b] = await Promise.all([book('p6', { requestId }), sweep()]); // the retry and the sweeper at the same moment
    assert.ok([200, 201].includes(a.status));
    assert.equal(await Booking.countDocuments({ uid: 'p6' }), 1, 'one booking however the race went');
    assert.equal(stub.balance('p6'), 3000 - 1251, 'one charge');
    assert.equal((await intent(bk('p6', requestId))).status, 'done');
    void b;
    assert.equal((await sweep()).checked, 0);
  });

  test('a debit the wallet REFUSED (402 / failed) is closed failed by the sweeper too - no booking appears from a charge that never happened', async () => {
    fund('p7', 10);
    const requestId = `req-refused-${Math.random()}`;
    // the wallet refuses, but the answer is lost on the way back
    stub.mode = (path, method) => (method === 'POST' && path === '/debit' ? 'lost' : 'up');
    assert.equal((await book('p7', { requestId })).status, 503);
    stub.mode = 'up';
    assert.equal((await sweep()).failed, 1);
    assert.equal(await Booking.countDocuments({ uid: 'p7' }), 0);
    assert.equal(stub.balance('p7'), 10);
  });

  test('the wallet still unreachable when the sweeper looks: it waits, keeps the intent, and finishes later', async () => {
    fund('p8', 3000);
    const requestId = `req-wait-${Math.random()}`;
    stub.mode = (path, method) => (method === 'POST' && path === '/debit' ? 'lost' : 'up');
    await book('p8', { requestId });
    stub.mode = 'down';
    const s = await sweep();
    assert.deepEqual([s.checked, s.waiting, s.done], [1, 1, 0]);
    assert.equal((await intent(bk('p8', requestId))).attempts, 1);
    assert.equal(await Booking.countDocuments({ uid: 'p8' }), 0);
    stub.mode = 'up';
    assert.equal((await sweep()).done, 1);
    assert.equal(await Booking.countDocuments({ uid: 'p8' }), 1);
  });

  test('a booking that cannot be SAVED after the debit gives the coins back (durably) and the sweeper does not resurrect it', async () => {
    fund('p9', 3000);
    const requestId = `req-nosave-${Math.random()}`;
    mock.method(Booking, 'create', async () => { throw new Error('disk full'); });
    const r = await book('p9', { requestId });
    assert.equal(r.status, 500);
    mock.restoreAll();
    assert.equal(stub.balance('p9'), 3000, 'refunded');
    assert.equal(stub.postedFor('booking:p9:').length, 2, 'one debit, one refund row (the :failed key)');
    assert.equal((await intent(bk('p9', requestId))).status, 'refunded');
    assert.equal((await intent(`${bk('p9', requestId)}:failed`)).status, 'done');
    assert.deepEqual(await sweep(), { checked: 0, done: 0, failed: 0, expired: 0, waiting: 0 });
    assert.equal(await Booking.countDocuments({ uid: 'p9' }), 0);
  });

  test('...and when the wallet is down at that moment the refund is QUEUED and still arrives exactly once', async () => {
    fund('p10', 3000);
    const requestId = `req-nosave2-${Math.random()}`;
    mock.method(Booking, 'create', async () => {
      stub.mode = (path) => (path === '/refund' ? 'down' : 'up'); // the wallet drops right after the debit
      throw new Error('disk full');
    });
    assert.equal((await book('p10', { requestId })).status, 500);
    mock.restoreAll();
    assert.equal(stub.balance('p10'), 3000 - 1251, 'not refunded yet');
    assert.equal((await intent(bk('p10', requestId))).status, 'refunded', 'the order intent is closed so the sweeper never writes this booking');
    assert.equal((await intent(`${bk('p10', requestId)}:failed`)).status, 'pending');
    stub.mode = 'up';
    assert.equal((await sweep()).done, 1);
    assert.equal(stub.balance('p10'), 3000);
    assert.equal((await sweep()).checked, 0);
    assert.equal(await Booking.countDocuments({ uid: 'p10' }), 0);
  });

  test('cancel refunds once at the wallet; repeat cancels never refund again', async () => {
    fund('p11', 3000);
    const made = await book('p11');
    const id = made.body.booking.id;
    const c1 = await h.call('POST', `/bookings/${id}/cancel`, { uid: 'p11' });
    const c2 = await h.call('POST', `/bookings/${id}/cancel`, { uid: 'p11' });
    assert.deepEqual([c1.status, c1.body.booking.status, c1.body.balance, c2.status, c2.body.balance], [200, 'cancelled', 3000, 200, 3000]);
    assert.equal(stub.balance('p11'), 3000);
    assert.equal(stub.postedFor(`booking:${id}:refund`).length, 1);
    const sent = stub.hits.filter((x) => x.path === '/refund').at(-1).body;
    const b = await Booking.findById(id);
    assert.equal(sent.ofKey, `booking:p11:${b.requestId}`, 'phase 5: the refund names the debit it reverses, so the wallet can verify it');
    assert.equal(sent.reason, undefined, 'and is not the goodwill exemption');
  });

  test('cancel while the wallet is DOWN: 503, the refund is queued, the sweeper pays it once when the wallet is back, a later retry adds nothing', async () => {
    fund('p12', 3000);
    const id = (await book('p12')).body.booking.id;
    stub.mode = 'down';
    const c1 = await h.call('POST', `/bookings/${id}/cancel`, { uid: 'p12' });
    assert.deepEqual([c1.status, c1.body.code], [503, 'wallet_unavailable']);
    assert.equal(stub.balance('p12'), 3000 - 1251);
    assert.equal((await intent(`booking:${id}:refund`)).status, 'pending');
    stub.mode = 'up';
    assert.equal((await sweep()).done, 1);
    assert.equal(stub.balance('p12'), 3000);
    const c2 = await h.call('POST', `/bookings/${id}/cancel`, { uid: 'p12' });
    assert.deepEqual([c2.status, c2.body.balance], [200, 3000]);
    assert.equal(stub.balance('p12'), 3000, 'refunded exactly once');
    assert.equal(stub.postedFor(`booking:${id}:refund`).length, 1);
  });

  test('cancel whose refund answer was LOST: the refund happened, the retry and the sweeper both find it done', async () => {
    fund('p13', 3000);
    const id = (await book('p13')).body.booking.id;
    stub.mode = (path) => (path === '/refund' ? 'lost' : 'up');
    assert.equal((await h.call('POST', `/bookings/${id}/cancel`, { uid: 'p13' })).status, 503);
    assert.equal(stub.balance('p13'), 3000, 'the refund DID land');
    stub.mode = 'up';
    await sweep();
    assert.equal((await h.call('POST', `/bookings/${id}/cancel`, { uid: 'p13' })).status, 200);
    assert.equal(stub.balance('p13'), 3000);
    assert.equal(stub.postedFor(`booking:${id}:refund`).length, 1);
  });

  test('chadhava: same sagas - paid at the service, 402 shape, lost answer completed by the sweeper, cancel refunds once', async () => {
    fund('c1', 500);
    const ok = await order('c1');
    assert.deepEqual([ok.status, ok.body.order.totalCoins, ok.body.balance], [201, 43, 457]);
    assert.equal(await WalletTxn.countDocuments({ uid: 'c1' }), 0);

    const lostId = `req-clost-${Math.random()}`;
    stub.mode = (path, method) => (method === 'POST' && path === '/debit' ? 'lost' : 'up');
    assert.equal((await order('c1', { requestId: lostId })).status, 503);
    stub.mode = 'up';
    assert.equal(stub.balance('c1'), 457 - 43);
    assert.equal(await ChadhavaOrder.countDocuments({ uid: 'c1' }), 1);
    assert.equal((await sweep()).done, 1);
    assert.equal(await ChadhavaOrder.countDocuments({ uid: 'c1' }), 2);
    assert.equal((await ChadhavaOrder.findOne({ uid: 'c1', requestId: lostId })).walletTxnId, stub.txns.get(`chadhava:c1:${lostId}`).id);
    assert.equal(stub.balance('c1'), 414);
    assert.equal((await order('c1', { requestId: lostId })).status, 200);
    assert.equal(stub.balance('c1'), 414);

    fund('c2', 5);
    const short = await order('c2');
    assert.deepEqual([short.status, short.body.code, short.body.shortfall], [402, 'insufficient_coins', 38]);

    const id = ok.body.order.id;
    stub.mode = 'down';
    assert.equal((await h.call('POST', `/chadhava/orders/${id}/cancel`, { uid: 'c1' })).status, 503);
    stub.mode = 'up';
    assert.equal((await sweep()).done, 1);
    assert.equal((await h.call('POST', `/chadhava/orders/${id}/cancel`, { uid: 'c1' })).status, 200);
    assert.equal(stub.balance('c1'), 414 + 43);
    assert.equal(stub.postedFor(`chadhava:${id}:refund`).length, 1);
  });

  test('12 parallel DIFFERENT bookings against a balance that affords 3: exactly 3 booked, the rest 402, the wallet never overdrawn', async () => {
    fund('p14', 1251 * 3);
    const rs = await Promise.all(Array.from({ length: 12 }, () => book('p14')));
    assert.equal(rs.filter((r) => r.status === 201).length, 3);
    assert.equal(rs.filter((r) => r.status === 402).length, 9);
    assert.equal(stub.balance('p14'), 0);
    assert.equal(await Booking.countDocuments({ uid: 'p14' }), 3);
    assert.equal((await sweep()).checked, 0, 'every intent was closed by its own request');
  });
});

/* ───────────────────────────────────────────────────────────── calls and the ticker ── */
describe('calls: per-minute billing through the wallet, and an unreachable wallet', () => {
  let app; let api; let astro;
  const ASTRO_UID = 'astro-uid';
  const goOnline = () => Astrologer.updateOne({ _id: astro._id }, { $set: { presence: 'online', lastSeenAt: new Date(), status: 'active', listed: true } });
  const request = (uid, requestId = `r-${Math.random()}`) => api('POST', '/calls', { uid, body: { astrologerId: String(astro._id), requestId } });
  const accept = (id) => api('POST', `/calls/${id}/accept`, { uid: ASTRO_UID });
  const keys = (id) => [...stub.txns.keys()].filter((k) => k.startsWith(`call:${id}:`));

  before(async () => {
    process.env.INTERNAL_JWT_SECRET = SECRET;
    process.env.WALLET_URL = stub.url;
    app = await startApp('wallet_calls_tests', [walletMod, astrologers, callsMod, payouts]);
    api = app.api;
    await callsMod.seed();
    astro = await Astrologer.create({ name: 'Pt. Sharma', ratePerMin: 10, platformSharePct: 30, signInEmail: 's@example.com', uid: ASTRO_UID, status: 'active', listed: true, presence: 'online', lastSeenAt: new Date() });
  });
  after(() => app.close());
  beforeEach(async () => { await CallSession.updateMany({ status: { $in: ['requested', 'connected'] } }, { $set: { status: 'ended', endReason: 'admin' }, $unset: { nextBillAt: 1, devoteeLive: 1, astrologerLive: 1 } }); await goOnline(); });

  test('request needs the balance (exact, from the wallet); accept charges minute 1 at the wallet with key call:<id>:min:1; the ticker bills the next ones', async () => {
    stub.fund('cd1', 35);
    const r = await request('cd1');
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const id = r.body.call.id;
    assert.equal(stub.balance('cd1'), 35, 'ringing costs nothing');
    assert.equal((await accept(id)).status, 200);
    assert.equal(stub.balance('cd1'), 25);
    assert.deepEqual(keys(id), [`call:${id}:min:1`]);
    const call = await CallSession.findById(id);
    await tick(new Date(call.answeredAt.getTime() + 60_000 + 1), { since: 0 });
    assert.equal(stub.balance('cd1'), 15);
    await tick(new Date(call.answeredAt.getTime() + 60_000 + 2), { since: 0 }); // the same moment again: the same key, charged once
    assert.equal(stub.balance('cd1'), 15);
    assert.equal(keys(id).length, 2);
    const view = await api('GET', `/calls/${id}`, { uid: 'cd1' });
    assert.equal(view.body.call.balance, 15);
  });

  test('insufficient coins at request: 402 with the monolith\'s body; wallet down at request: 503 wallet_unavailable, no call created', async () => {
    stub.fund('cd2', 20);
    const r = await request('cd2');
    assert.deepEqual([r.status, r.body.code, r.body.needed, r.body.balance, r.body.shortfall], [402, 'insufficient_coins', 30, 20, 10]);
    stub.fund('cd2', 100);
    stub.mode = 'down';
    const d = await request('cd2');
    assert.deepEqual([d.status, d.body.code], [503, 'wallet_unavailable']);
    assert.equal(await CallSession.countDocuments({ devoteeUid: 'cd2' }), 0);
  });

  test('wallet down when the astrologer answers: the call is connected, NOTHING is assumed charged, and the ticker bills minute 1 once when the wallet returns', async () => {
    stub.fund('cd3', 100);
    const rq = await request('cd3');
    const id = rq.body.call.id;
    stub.mode = (path) => (path === '/debit' ? 'down' : 'up');
    const a = await accept(id);
    assert.equal(a.status, 200);
    let call = await CallSession.findById(id);
    assert.deepEqual([call.status, call.minutesBilled, call.coinsCharged], ['connected', 0, 0]);
    const t1 = await tick(new Date(Date.now() + 1000), { since: 0 });
    assert.equal(t1.walletUnavailable, 1, 'the tick carried on');
    assert.equal(stub.balance('cd3'), 100);
    stub.mode = 'up';
    await tick(new Date(Date.now() + 2000), { since: 0 });
    await tick(new Date(Date.now() + 3000), { since: 0 });
    call = await CallSession.findById(id);
    assert.equal(call.minutesBilled, 1);
    assert.equal(stub.balance('cd3'), 90, 'one minute, one charge');
    assert.deepEqual(keys(id), [`call:${id}:min:1`]);
  });

  test('LOST ANSWER on a minute: the ticker retries the SAME key and the minute is counted once', async () => {
    stub.fund('cd4', 100);
    const id = (await request('cd4')).body.call.id;
    await accept(id);
    const call = await CallSession.findById(id);
    stub.mode = (path, method) => (method === 'POST' && path === '/debit' ? 'lost' : 'up');
    const at = new Date(call.answeredAt.getTime() + 60_000 + 5);
    const t = await tick(at, { since: 0 });
    assert.equal(t.walletUnavailable, 1);
    assert.equal(stub.balance('cd4'), 80, 'minute 2 was charged at the wallet...');
    assert.equal((await CallSession.findById(id)).minutesBilled, 1, '...but not yet counted here');
    stub.mode = 'up';
    await tick(at, { since: 0 });
    assert.equal((await CallSession.findById(id)).minutesBilled, 2);
    assert.equal(stub.balance('cd4'), 80, 'and not charged again');
    assert.deepEqual(keys(id), [`call:${id}:min:1`, `call:${id}:min:2`]);
  });

  test('out of coins ends the call exactly as before; a call that never connects is refunded through the wallet (durably)', async () => {
    stub.fund('cd5', 30);
    const id = (await request('cd5')).body.call.id;
    await accept(id);
    const call = await CallSession.findById(id);
    for (const m of [1, 2, 3]) await tick(new Date(call.answeredAt.getTime() + m * 60_000 + 5), { since: 0, silenceMs: 3_600_000 });
    const done = await CallSession.findById(id);
    assert.deepEqual([done.status, done.endReason], ['ended', 'out_of_coins']);
    assert.equal(stub.balance('cd5'), 0);

    // connect failure: charged minute 1, the audio setup fails -> failed -> refunded
    stub.fund('cd6', 50);
    const id6 = (await request('cd6')).body.call.id;
    await accept(id6);
    await CallSession.updateOne({ _id: id6 }, { $set: { astrologerSeenAt: undefined } });
    stub.mode = (path) => (path === '/refund' ? 'down' : 'up');
    const c6 = await CallSession.findById(id6);
    await tick(new Date(c6.answeredAt.getTime() + 200_000), { since: 0, silenceMs: 90_000 });
    assert.equal((await CallSession.findById(id6)).status, 'ended');
    assert.equal(stub.balance('cd6'), 40, 'the refund is queued while the wallet is down');
    const q = await saga.WalletIntent.findOne({ key: `call:${id6}:refund:1` });
    assert.equal(q.status, 'pending');
    assert.equal(q.ofKey, `call:${id6}:min:1`, 'the queued refund remembers the minute\'s debit it reverses');
    stub.mode = 'up';
    assert.equal((await saga.sweep({ minAgeMs: 0 })).done, 1);
    assert.equal(stub.hits.filter((x) => x.path === '/refund').at(-1).body.ofKey, `call:${id6}:min:1`, 'and the sweeper sends it');
    assert.equal(stub.balance('cd6'), 50);
    await saga.sweep({ minAgeMs: 0 });
    assert.equal(stub.balance('cd6'), 50, 'once');
  });

  test('an operator\'s goodwill refund has no single debit behind it: it carries the explicit `reason` (the wallet\'s one exemption from ofKey), never an ofKey', async () => {
    stub.fund('cd7', 50);
    const id = (await request('cd7')).body.call.id;
    await accept(id);
    const r = await api('POST', `/admin/calls/${id}/refund`, { body: { coins: 4, reason: 'call dropped twice', requestId: 'gw-1' } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const sent = stub.hits.filter((x) => x.path === '/refund').at(-1).body;
    assert.deepEqual([sent.reason, sent.ofKey, sent.refType, sent.key, sent.amount], ['call dropped twice', undefined, 'call', `call:${id}:goodwill:gw-1`, 4]);
    assert.equal(stub.balance('cd7'), 50 - 10 + 4);
  });
});

/* ───────────────────────────────────────────────────────────── the switch itself ── */
describe('the monolith app with WALLET_URL set', { skip: IDENTITY_MODE && 'cookie sessions are phase 1; IDENTITY_URL set (phase 2) moves them to the admin BFF' }, () => {
  let server; let base;
  let cookie;
  before(async () => {
    process.env.INTERNAL_JWT_SECRET = SECRET;
    await mongoose.connect(dbUri('wallet_mode_app_tests'));
    await mongoose.connection.dropDatabase();
    await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
    const o = await Operator.create({ username: 'admin1', passwordHash: hashPassword('password-123'), role: 'admin' });
    cookie = `pooja_admin=${encodeURIComponent(sign({ uid: String(o._id), role: 'admin', exp: Date.now() + 3600_000 }))}`;
    server = createApp().listen(0, '127.0.0.1');
    await new Promise((ok) => server.once('listening', ok));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => {
    await new Promise((ok) => server.close(ok));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  const get = async (path, { method = 'GET', headers = {}, body } = {}) => {
    const res = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, body });
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  test('with WALLET_URL set every wallet / coins route answers 404 - devotee, public, webhook and operator alike (an operator cookie shows it is not the gate)', async () => {
    const routes = [
      ['GET', '/api/coins/packs'], ['POST', '/api/webhooks/razorpay'], ['GET', '/api/wallet'], ['GET', '/api/wallet/transactions'],
      ['POST', '/api/wallet/orders'], ['POST', '/api/wallet/orders/000000000000000000000000/verify'],
      ['GET', '/api/admin/wallets?q=a'], ['GET', '/api/admin/wallet-transactions'], ['POST', '/api/admin/wallet/adjust'],
      ['GET', '/api/admin/coin-packs'], ['POST', '/api/admin/coin-packs'], ['PUT', '/api/admin/coin-packs/000000000000000000000000'], ['DELETE', '/api/admin/coin-packs/000000000000000000000000'],
      ['GET', '/api/admin/coin-orders'], ['GET', '/api/admin/coin-stats'], ['GET', '/api/admin/billing/rules'], ['PUT', '/api/admin/billing/rules'],
    ];
    for (const [method, path] of routes) {
      const r = await get(path, { method, headers: { cookie }, body: method === 'GET' || method === 'DELETE' ? undefined : '{}' });
      assert.equal(r.status, 404, `${method} ${path} -> ${r.status}`);
    }
    // a stranger still meets the gate, never a wallet
    assert.equal((await get('/api/coins/packs')).status, 401);
  });

  test('with WALLET_URL unset the same routes are served by the monolith again (rollback = unset it)', async () => {
    delete process.env.WALLET_URL;
    assert.equal((await get('/api/coins/packs')).status, 200);
    assert.equal((await get('/api/admin/billing/rules', { headers: { cookie } })).status, 200);
    assert.equal((await get('/api/admin/coin-packs', { headers: { cookie } })).status, 200);
    assert.equal((await get('/api/wallet')).status, 401, 'devotee route wants a token');
    assert.equal(stub.hits.length, 0, 'the wallet service was not called');
  });

  test('the wallet and coins seeds step aside (the wallet service seeds its packs), and unset they run again', async () => {
    await seedModules();
    assert.equal(await CoinPack.countDocuments(), 0);
    delete process.env.WALLET_URL;
    await seedModules();
    assert.equal(await CoinPack.countDocuments(), 6);
    await CoinPack.deleteMany({});
  });
});

describe('booting the monolith', () => {
  const boot = (env) => spawnSync(process.execPath, [fileURLToPath(new URL('../server.js', import.meta.url))], {
    env: { PATH: process.env.PATH, MONGODB_URI: dbUri('wallet_boot_refusal'), PORT: '0', ...env }, encoding: 'utf8', timeout: 15_000,
  });
  test('WALLET_URL without ENGAGEMENT_URL is refused (the billing rules would disagree about money), and so is a missing secret', () => {
    const a = boot({ WALLET_URL: 'http://127.0.0.1:9', INTERNAL_JWT_SECRET: SECRET });
    assert.equal(a.status, 1);
    assert.match(a.stderr, /WALLET_URL is set but ENGAGEMENT_URL is not/);
    const b = boot({ WALLET_URL: 'http://127.0.0.1:9', ENGAGEMENT_URL: 'http://127.0.0.1:9' });
    assert.equal(b.status, 1);
    assert.match(b.stderr, /INTERNAL_JWT_SECRET/);
  });
});

describe('the facade with WALLET_URL unset behaves like wallet.service', () => {
  test('debit / refund / balance go to the local ledger and the wallet service is never called', async () => {
    delete process.env.WALLET_URL;
    await mongoose.connect(dbUri('wallet_facade_local_tests'));
    await mongoose.connection.dropDatabase();
    await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
    try {
      await ledger.credit({ uid: 'f1', amount: 50, type: 'bonus', idempotencyKey: 'f1-c' });
      const d = await ledger.debitForOrder({ kind: 'booking', payload: {} }, { uid: 'f1', amount: 20, type: 'booking_debit', idempotencyKey: 'f1-d' });
      assert.equal(d.balance, 30);
      assert.equal(await ledger.getBalance('f1'), 30);
      assert.equal(await ledger.displayBalance('f1'), 30);
      const r = await ledger.refundDurably({ uid: 'f1', amount: 20, idempotencyKey: 'f1-r' }, { closes: 'f1-d' });
      assert.equal(r.balance, 50);
      assert.equal(await saga.WalletIntent.countDocuments(), 0, 'no intent is ever written without a wallet service');
      assert.equal(stub.hits.length, 0);
      assert.deepEqual(Object.keys(await ledger.reconcilePending({ olderThanMs: 0 })), ['checked', 'finished']);
    } finally {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  });
});

