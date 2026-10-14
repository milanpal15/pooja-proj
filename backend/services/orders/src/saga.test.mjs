// The money saga of the orders service: every way a purchase / refund can go wrong between this service and the wallet, and what is left
// behind. Rules under test (docs/MICROSERVICES.md section 4, phase 5): a durable intent BEFORE the money moves; the SAME idempotency key on every
// retry; an ambiguous answer leaves the intent for the sweeper; exactly one debit; cancel refunds exactly once; a failed save refunds durably and
// quietly; catalog / wallet unavailable fail CLOSED before / without moving a coin.
// Run: TEST_MONGODB_URI=mongodb://127.0.0.1:27251/x node --test --test-concurrency=1 src/saga.test.mjs
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, mock, test } from 'node:test';

import { Booking, ChadhavaOrder, OrderIntent } from './models.js';
import { startJobs, stopJobs } from './jobs.js';
import { pruneIntents, sweep } from './modules/saga/index.js';
import { PK, boot, names } from './test-kit.mjs';

const NONE = { checked: 0, done: 0, failed: 0, expired: 0, waiting: 0 };
const bk = (uid, requestId) => `booking:${uid}:${requestId}`;
const ch = (uid, requestId) => `chadhava:${uid}:${requestId}`;

let h;
const fund = (uid, n) => h.wallet.fund(uid, n);
const book = (uid, over = {}) => h.call('POST', '/bookings', { uid, body: { poojaSlug: 'navratri', packageKey: 'family', names: names(4), prasad: false, requestId: `req-${Math.random()}`, ...over } });
const order = (uid, over = {}) => h.call('POST', '/chadhava/orders', { uid, body: { listingSlug: 'ganga-aarti', items: [{ key: 'flowers', qty: 2 }, { key: 'diya', qty: 1 }], requestId: `req-${Math.random()}`, ...over } });
const intent = (key) => OrderIntent.findOne({ key }).lean();
const sweepNow = (o = {}) => sweep({ minAgeMs: 0, ...o });
const only = (path, method, mode = 'lost') => (p, m) => (m === method && p === path ? mode : 'up');

before(async () => { h = await boot('orders_saga_tests', { extra: { INTENT_MIN_AGE_MS: '0' } }); });
after(() => h.stop());
afterEach(() => { h.wallet.mode = 'up'; h.catalog.mode = 'up'; mock.restoreAll(); });

describe('bookings: the purchase saga', () => {
  test('a normal purchase: the intent is written BEFORE the money moves (and is closed `done` after), the same key reaches the wallet, one debit', async () => {
    fund('p1', 3000);
    const requestId = 'req-normal-0001';
    let atDebit = null;
    h.wallet.onRequest = async (path) => { if (path === '/debit') atDebit = await intent(bk('p1', requestId)); };
    const r = await book('p1', { requestId });
    h.wallet.onRequest = null;
    assert.equal(r.status, 201);
    const row = await intent(bk('p1', requestId));
    assert.deepEqual([row.status, row.kind, row.uid, row.amount, row.type, row.requestId], ['done', 'booking', 'p1', 1251, 'booking_debit', requestId]);
    assert.equal(row.payload.poojaTitle, 'Navratri Durga Pooja', 'the intent carries everything the booking is made from');
    assert.deepEqual([atDebit?.status, atDebit?.amount, atDebit?.payload?.packageKey], ['pending', 1251, 'family'], 'when the debit ARRIVED at the wallet the intent already existed, pending, holding the booking\'s fields');
    assert.equal(h.wallet.hits.filter((x) => x.path === '/debit').length, 1);
    assert.equal(h.wallet.hits.find((x) => x.path === '/debit').body.key, bk('p1', requestId));
    assert.equal(h.wallet.balance('p1'), 3000 - 1251);
  });

  test('insufficient coins: 402 in the monolith\'s body shape, nothing created, the intent closed failed; the same request after a top-up charges once', async () => {
    fund('p3', 100);
    const requestId = `req-short-${Math.random()}`;
    const r = await book('p3', { requestId });
    assert.equal(r.status, 402);
    assert.deepEqual(r.body, { error: 'Not enough coins.', code: 'insufficient_coins', needed: 1251, balance: 100, shortfall: 1151, type: 'booking_debit' });
    assert.equal(await Booking.countDocuments({ uid: 'p3' }), 0);
    assert.equal((await intent(bk('p3', requestId))).status, 'failed');
    fund('p3', 2000);
    const ok = await book('p3', { requestId });
    assert.equal(ok.status, 201);
    assert.equal(h.wallet.balance('p3'), 2100 - 1251);
    assert.equal((await intent(bk('p3', requestId))).status, 'done');
  });

  test('wallet DOWN (the request never arrived): 503 wallet_unavailable, no booking, no balance change; the sweeper waits, then expires it; the retry charges once', async () => {
    fund('p4', 3000);
    const requestId = `req-down-${Math.random()}`;
    h.wallet.mode = 'down';
    const r = await book('p4', { requestId });
    assert.deepEqual([r.status, r.body.code], [503, 'wallet_unavailable']);
    assert.equal(await Booking.countDocuments({ uid: 'p4' }), 0);
    assert.equal((await intent(bk('p4', requestId))).status, 'pending');
    h.wallet.mode = 'up';
    assert.deepEqual(await sweepNow({ graceMs: 60_000 }), { ...NONE, checked: 1, waiting: 1 }, 'not found at the wallet, but not yet old enough to call it "never arrived"');
    assert.equal(h.wallet.balance('p4'), 3000);
    assert.equal((await sweepNow({ graceMs: 0 })).expired, 1);
    assert.equal((await intent(bk('p4', requestId))).status, 'expired');
    assert.equal(await Booking.countDocuments({ uid: 'p4' }), 0);
    const retry = await book('p4', { requestId });
    assert.equal(retry.status, 201);
    assert.equal(h.wallet.balance('p4'), 3000 - 1251, 'charged exactly once');
    assert.equal((await intent(bk('p4', requestId))).status, 'done');
  });

  test('LOST ANSWER (the wallet charged, this service never heard): 503 to the user, then the sweeper writes the booking - one debit, one booking, nothing lost', async () => {
    fund('p5', 3000);
    const requestId = `req-lost-${Math.random()}`;
    h.wallet.mode = only('/debit', 'POST');
    const r = await book('p5', { requestId });
    assert.deepEqual([r.status, r.body.code], [503, 'wallet_unavailable']);
    assert.equal(h.wallet.balance('p5'), 3000 - 1251, 'the money DID move');
    assert.equal(await Booking.countDocuments({ uid: 'p5' }), 0, 'and there is no booking yet');
    assert.equal((await intent(bk('p5', requestId))).status, 'pending');

    h.wallet.mode = 'up';
    const s1 = await sweepNow();
    assert.deepEqual([s1.checked, s1.done], [1, 1]);
    const b = await Booking.find({ uid: 'p5' });
    assert.equal(b.length, 1);
    assert.deepEqual([b[0].totalCoins, b[0].status, b[0].poojaSlug, b[0].packageKey, b[0].templeName, b[0].persons, b[0].names.length], [1251, 'booked', 'navratri', 'family', 'Kashi Vishwanath', 4, 4]);
    assert.equal(b[0].walletTxnId, h.wallet.txns.get(bk('p5', requestId)).id);
    assert.equal(h.wallet.balance('p5'), 3000 - 1251);
    assert.deepEqual(await sweepNow(), NONE, 'a second sweep finds nothing to do');
    const retry = await book('p5', { requestId });
    assert.deepEqual([retry.status, retry.body.booking.id], [200, String(b[0]._id)], 'the user\'s own retry is an answer, not a second charge');
    assert.equal(h.wallet.postedFor('booking:p5:').length, 1);
  });

  test('FROZEN wallet (SIGSTOP-like): the call times out, the money moves after the thaw, exactly one debit, the sweeper completes the booking, a retry returns the same one', async () => {
    fund('p5f', 3000);
    const requestId = `req-frozen-${Math.random()}`;
    h.wallet.mode = 'slow'; // processes the debit, holds the answer past the client's timeout
    const t = Date.now();
    const r = await book('p5f', { requestId });
    assert.ok(Date.now() - t >= 1500, 'waited for the wallet timeout');
    assert.deepEqual([r.status, r.body.code], [503, 'wallet_unavailable']);
    h.wallet.mode = 'up';
    h.wallet.release();
    assert.equal(h.wallet.balance('p5f'), 3000 - 1251);
    assert.equal(await Booking.countDocuments({ uid: 'p5f' }), 0);
    assert.equal((await sweepNow()).done, 1);
    const b = await Booking.find({ uid: 'p5f' });
    assert.equal(b.length, 1);
    const retry = await book('p5f', { requestId });
    assert.deepEqual([retry.status, retry.body.booking.id], [200, String(b[0]._id)]);
    assert.equal(h.wallet.postedFor('booking:p5f:').length, 1, 'exactly one debit');
  });

  test('a wallet that NEVER answers (the request was never processed): 503 at the timeout, the intent stays pending, then expires; nothing was charged', async () => {
    fund('p5h', 3000);
    const requestId = `req-hang-${Math.random()}`;
    h.wallet.mode = 'hang';
    assert.equal((await book('p5h', { requestId })).status, 503);
    h.wallet.mode = 'up';
    assert.equal((await intent(bk('p5h', requestId))).status, 'pending');
    assert.equal((await sweepNow({ graceMs: 0 })).expired, 1);
    assert.equal(h.wallet.balance('p5h'), 3000);
  });

  test('LOST ANSWER, then the user retries BEFORE the sweeper (and at the same moment as it): one booking, one charge, the sweeper has nothing left', async () => {
    fund('p6', 3000);
    const requestId = `req-lost-retry-${Math.random()}`;
    h.wallet.mode = only('/debit', 'POST');
    assert.equal((await book('p6', { requestId })).status, 503);
    h.wallet.mode = 'up';
    const [a] = await Promise.all([book('p6', { requestId }), sweepNow()]);
    assert.ok([200, 201].includes(a.status));
    assert.equal(await Booking.countDocuments({ uid: 'p6' }), 1, 'one booking however the race went');
    assert.equal(h.wallet.balance('p6'), 3000 - 1251, 'one charge');
    assert.equal((await intent(bk('p6', requestId))).status, 'done');
    assert.equal((await sweepNow()).checked, 0);
  });

  test('a debit the wallet REFUSED but whose answer was lost is closed failed by the sweeper - no booking appears from a charge that never happened', async () => {
    fund('p7', 10);
    const requestId = `req-refused-${Math.random()}`;
    h.wallet.mode = only('/debit', 'POST');
    assert.equal((await book('p7', { requestId })).status, 503);
    h.wallet.mode = 'up';
    assert.equal((await sweepNow()).failed, 1);
    assert.equal(await Booking.countDocuments({ uid: 'p7' }), 0);
    assert.equal(h.wallet.balance('p7'), 10);
  });

  test('the wallet still unreachable when the sweeper looks: it waits, keeps the intent, counts the attempt, and finishes later', async () => {
    fund('p8', 3000);
    const requestId = `req-wait-${Math.random()}`;
    h.wallet.mode = only('/debit', 'POST');
    await book('p8', { requestId });
    h.wallet.mode = 'down';
    const s = await sweepNow();
    assert.deepEqual([s.checked, s.waiting, s.done], [1, 1, 0]);
    const row = await intent(bk('p8', requestId));
    assert.equal(row.attempts, 1);
    assert.ok(row.lastError);
    assert.equal(await Booking.countDocuments({ uid: 'p8' }), 0);
    h.wallet.mode = 'up';
    assert.equal((await sweepNow()).done, 1);
    assert.equal(await Booking.countDocuments({ uid: 'p8' }), 1);
  });

  test('a debit still PENDING at the wallet is waited for, not guessed', async () => {
    fund('p8p', 3000);
    const requestId = `req-pend-${Math.random()}`;
    h.wallet.mode = only('/debit', 'POST');
    await book('p8p', { requestId });
    h.wallet.mode = 'up';
    h.wallet.txns.get(bk('p8p', requestId)).status = 'pending';
    assert.deepEqual(await sweepNow(), { ...NONE, checked: 1, waiting: 1 });
    h.wallet.txns.get(bk('p8p', requestId)).status = 'posted';
    assert.equal((await sweepNow()).done, 1);
  });

  test('a booking that cannot be SAVED after the debit gives the coins back (durably, quietly, with ofKey) and the sweeper does not resurrect it', async () => {
    fund('p9', 3000);
    const requestId = `req-nosave-${Math.random()}`;
    mock.method(Booking, 'create', async () => { throw new Error('disk full'); });
    const r = await book('p9', { requestId });
    assert.equal(r.status, 500);
    mock.restoreAll();
    assert.equal(h.wallet.balance('p9'), 3000, 'refunded');
    assert.equal(h.wallet.postedFor('booking:p9:').length, 2, 'one debit, one refund row (the :failed key)');
    const refund = h.wallet.hits.filter((x) => x.path === '/refund').at(-1);
    assert.deepEqual([refund.body.key, refund.body.ofKey, refund.body.amount], [`${bk('p9', requestId)}:failed`, bk('p9', requestId), 1251]);
    assert.equal((await intent(bk('p9', requestId))).status, 'refunded');
    assert.equal((await intent(`${bk('p9', requestId)}:failed`)).status, 'done');
    assert.deepEqual(await sweepNow(), NONE);
    assert.equal(await Booking.countDocuments({ uid: 'p9' }), 0);
  });

  test('...and when the wallet is down at that moment the refund is QUEUED and still arrives exactly once (the caller is not told twice)', async () => {
    fund('p10', 3000);
    const requestId = `req-nosave2-${Math.random()}`;
    mock.method(Booking, 'create', async () => {
      h.wallet.mode = only('/refund', 'POST', 'down'); // the wallet drops right after the debit
      throw new Error('disk full');
    });
    assert.equal((await book('p10', { requestId })).status, 500);
    mock.restoreAll();
    assert.equal(h.wallet.balance('p10'), 3000 - 1251, 'not refunded yet');
    assert.equal((await intent(bk('p10', requestId))).status, 'refunded', 'the order intent is closed so the sweeper never writes this booking');
    assert.equal((await intent(`${bk('p10', requestId)}:failed`)).status, 'pending');
    h.wallet.mode = 'up';
    assert.equal((await sweepNow()).done, 1);
    assert.equal(h.wallet.balance('p10'), 3000);
    assert.equal((await sweepNow()).checked, 0);
    assert.equal(await Booking.countDocuments({ uid: 'p10' }), 0);
  });

  test('cancel refunds once at the wallet; repeat cancels never refund again', async () => {
    fund('p11', 3000);
    const id = (await book('p11')).body.booking.id;
    const c1 = await h.call('POST', `/bookings/${id}/cancel`, { uid: 'p11' });
    const c2 = await h.call('POST', `/bookings/${id}/cancel`, { uid: 'p11' });
    const c3 = await h.call('POST', `/bookings/${id}/cancel`, { uid: 'p11' });
    assert.deepEqual([c1.status, c1.body.booking.status, c1.body.balance, c2.status, c2.body.balance, c3.body.balance], [200, 'cancelled', 3000, 200, 3000, 3000]);
    assert.equal(h.wallet.balance('p11'), 3000);
    assert.equal(h.wallet.postedFor(`booking:${id}:refund`).length, 1);
    assert.equal((await intent(`booking:${id}:refund`)).status, 'done');
  });

  test('cancel while the wallet is DOWN: 503, the refund is queued, the sweeper pays it once when the wallet is back, a later retry adds nothing', async () => {
    fund('p12', 3000);
    const id = (await book('p12')).body.booking.id;
    h.wallet.mode = 'down';
    const c1 = await h.call('POST', `/bookings/${id}/cancel`, { uid: 'p12' });
    assert.deepEqual([c1.status, c1.body.code], [503, 'wallet_unavailable']);
    assert.equal(h.wallet.balance('p12'), 3000 - 1251);
    assert.equal((await intent(`booking:${id}:refund`)).status, 'pending');
    h.wallet.mode = 'up';
    assert.equal((await sweepNow()).done, 1);
    assert.equal(h.wallet.balance('p12'), 3000);
    const c2 = await h.call('POST', `/bookings/${id}/cancel`, { uid: 'p12' });
    assert.deepEqual([c2.status, c2.body.balance], [200, 3000]);
    assert.equal(h.wallet.balance('p12'), 3000, 'refunded exactly once');
    assert.equal(h.wallet.postedFor(`booking:${id}:refund`).length, 1);
  });

  test('cancel whose refund answer was LOST: the refund happened, the retry and the sweeper both find it done', async () => {
    fund('p13', 3000);
    const id = (await book('p13')).body.booking.id;
    h.wallet.mode = only('/refund', 'POST');
    assert.equal((await h.call('POST', `/bookings/${id}/cancel`, { uid: 'p13' })).status, 503);
    assert.equal(h.wallet.balance('p13'), 3000, 'the refund DID land');
    h.wallet.mode = 'up';
    await sweepNow();
    assert.equal((await h.call('POST', `/bookings/${id}/cancel`, { uid: 'p13' })).status, 200);
    assert.equal(h.wallet.balance('p13'), 3000);
    assert.equal(h.wallet.postedFor(`booking:${id}:refund`).length, 1);
  });

  test('two cancels at the same moment: one flag, one refund', async () => {
    fund('p13b', 3000);
    const id = (await book('p13b')).body.booking.id;
    const rs = await Promise.all([1, 2, 3, 4, 5].map(() => h.call('POST', `/bookings/${id}/cancel`, { uid: 'p13b' })));
    assert.ok(rs.every((r) => r.status === 200 && r.body.balance === 3000), JSON.stringify(rs.map((r) => [r.status, r.body.code])));
    assert.equal(h.wallet.balance('p13b'), 3000);
    assert.equal(h.wallet.postedFor(`booking:${id}:refund`).length, 1);
    assert.deepEqual((await Booking.findById(id).lean()).statusHistory.map((s) => s.status), ['booked', 'cancelled']);
  });

  test('a refund the wallet REFUSES (no such debit / already refunded): the caller gets the wallet\'s answer, the intent is closed failed - not retried forever, not a 500', async () => {
    fund('p14r', 3000);
    const id = (await book('p14r', { requestId: 'req-refuse-0001' })).body.booking.id;
    h.wallet.txns.delete(bk('p14r', 'req-refuse-0001')); // the wallet has no such debit any more
    const c = await h.call('POST', `/bookings/${id}/cancel`, { uid: 'p14r' });
    assert.deepEqual([c.status, c.body.code], [409, 'refund_no_debit']);
    assert.equal((await intent(`booking:${id}:refund`)).status, 'failed');
    assert.equal((await sweepNow()).checked, 0);

    // the same business refusal found by the SWEEPER (the refund was queued while the wallet was down) is closed failed too, loudly
    fund('p14s', 3000);
    const id2 = (await book('p14s', { requestId: 'req-refuse-0002' })).body.booking.id;
    h.wallet.mode = 'down';
    assert.equal((await h.call('POST', `/bookings/${id2}/cancel`, { uid: 'p14s' })).status, 503);
    h.wallet.mode = 'up';
    h.wallet.txns.delete(bk('p14s', 'req-refuse-0002'));
    assert.equal((await sweepNow()).failed, 1);
    assert.equal((await intent(`booking:${id2}:refund`)).status, 'failed');
    assert.equal(h.wallet.balance('p14s'), 3000 - 1251, 'nothing was paid out');
  });

  test('the wallet never reaches a refund without ofKey: the client refuses to send one', async () => {
    await assert.rejects(() => h.ctx.wallet.refund({ uid: 'x', amount: 5, idempotencyKey: 'k' }), (e) => e.status === 400 && e.code === 'bad_request');
  });
});

describe('chadhava orders: the same sagas', () => {
  test('paid at the wallet, 402 shape, lost answer completed by the sweeper, cancel refunds once (also when the wallet was down)', async () => {
    fund('c1', 500);
    const ok = await order('c1', { requestId: 'chad-first-0001' });
    assert.deepEqual([ok.status, ok.body.order.totalCoins, ok.body.balance], [201, 43, 457]);

    const lostId = `req-clost-${Math.random()}`;
    h.wallet.mode = only('/debit', 'POST');
    assert.equal((await order('c1', { requestId: lostId })).status, 503);
    h.wallet.mode = 'up';
    assert.equal(h.wallet.balance('c1'), 457 - 43);
    assert.equal(await ChadhavaOrder.countDocuments({ uid: 'c1' }), 1);
    assert.equal((await sweepNow()).done, 1);
    assert.equal(await ChadhavaOrder.countDocuments({ uid: 'c1' }), 2);
    assert.equal((await ChadhavaOrder.findOne({ uid: 'c1', requestId: lostId })).walletTxnId, h.wallet.txns.get(ch('c1', lostId)).id);
    assert.equal(h.wallet.balance('c1'), 414);
    assert.equal((await order('c1', { requestId: lostId })).status, 200);
    assert.equal(h.wallet.balance('c1'), 414);

    fund('c2', 5);
    const short = await order('c2');
    assert.deepEqual([short.status, short.body.code, short.body.shortfall], [402, 'insufficient_coins', 38]);

    const id = ok.body.order.id;
    h.wallet.mode = 'down';
    assert.equal((await h.call('POST', `/chadhava/orders/${id}/cancel`, { uid: 'c1' })).status, 503);
    h.wallet.mode = 'up';
    assert.equal((await sweepNow()).done, 1);
    assert.equal((await h.call('POST', `/chadhava/orders/${id}/cancel`, { uid: 'c1' })).status, 200);
    assert.equal(h.wallet.balance('c1'), 414 + 43);
    assert.equal(h.wallet.postedFor(`chadhava:${id}:refund`).length, 1);
  });

  test('an order that cannot be saved gives the coins back (ofKey = its debit) and is never resurrected', async () => {
    fund('c3', 500);
    const requestId = `req-cnosave-${Math.random()}`;
    mock.method(ChadhavaOrder, 'create', async () => { throw new Error('disk full'); });
    assert.equal((await order('c3', { requestId })).status, 500);
    mock.restoreAll();
    assert.equal(h.wallet.balance('c3'), 500);
    assert.equal(h.wallet.hits.filter((x) => x.path === '/refund').at(-1).body.ofKey, ch('c3', requestId));
    assert.equal((await intent(ch('c3', requestId))).status, 'refunded');
    assert.deepEqual(await sweepNow(), NONE);
    assert.equal(await ChadhavaOrder.countDocuments({ uid: 'c3' }), 0);
  });
});

describe('concurrency: the wallet is the only judge of a balance', () => {
  test('20 parallel DIFFERENT bookings against a balance that affords 7: exactly 7 booked, 13 are 402, the wallet never overdrawn, every intent closed', async () => {
    fund('con1', 1251 * 7);
    const rs = await Promise.all(Array.from({ length: 20 }, () => book('con1')));
    assert.equal(rs.filter((r) => r.status === 201).length, 7);
    assert.equal(rs.filter((r) => r.status === 402).length, 13);
    assert.equal(h.wallet.balance('con1'), 0);
    assert.equal(await Booking.countDocuments({ uid: 'con1' }), 7);
    assert.equal(h.wallet.postedFor('booking:con1:').length, 7);
    assert.equal(await OrderIntent.countDocuments({ uid: 'con1', status: 'pending' }), 0, 'every intent was closed by its own request');
    assert.equal((await sweepNow()).checked, 0);
  });

  test('20 parallel chadhava orders against a balance that affords 7: exactly 7', async () => {
    fund('con2', 43 * 7);
    const rs = await Promise.all(Array.from({ length: 20 }, () => order('con2')));
    assert.equal(rs.filter((r) => r.status === 201).length, 7);
    assert.equal(rs.filter((r) => r.status === 402).length, 13);
    assert.equal(h.wallet.balance('con2'), 0);
    assert.equal(await ChadhavaOrder.countDocuments({ uid: 'con2' }), 7);
  });

  test('20 parallel copies of the SAME request: one booking, one debit', async () => {
    fund('con3', 5000);
    const requestId = 'req-same-for-all';
    const rs = await Promise.all(Array.from({ length: 20 }, () => book('con3', { requestId })));
    assert.ok(rs.every((r) => r.status === 200 || r.status === 201), JSON.stringify(rs.map((r) => r.status)));
    assert.equal(new Set(rs.map((r) => r.body.booking.id)).size, 1);
    assert.equal(await Booking.countDocuments({ uid: 'con3' }), 1);
    assert.equal(h.wallet.postedFor('booking:con3:').length, 1);
  });
});

describe('fail closed: the catalog and the wallet', () => {
  test('catalog down / broken / hung: 503 catalog_unavailable BEFORE any coin moves - the wallet is not even called', async () => {
    fund('f1', 5000);
    for (const mode of ['down', 'broken', 'hang']) {
      h.catalog.mode = mode;
      const before = h.wallet.hits.length;
      const b = await book('f1');
      const c = await order('f1');
      assert.deepEqual([b.status, b.body.code, c.status, c.body.code], [503, 'catalog_unavailable', 503, 'catalog_unavailable'], mode);
      assert.equal(h.wallet.hits.length, before, `${mode}: no wallet call`);
    }
    assert.equal(h.wallet.balance('f1'), 5000);
    assert.equal(await Booking.countDocuments({ uid: 'f1' }), 0);
    assert.equal(await OrderIntent.countDocuments({ uid: 'f1' }), 0, 'not even an intent: nothing was about to be charged');
  });

  test('the price is never cached for a purchase: a changed price is charged as read each time, and a vanished pooja is 404 at once', async () => {
    fund('f2', 9000);
    const p = h.catalog.poojas.get('navratri');
    assert.equal((await book('f2')).body.booking.totalCoins, 1251);
    h.catalog.poojas.set('navratri', { ...p, packages: p.packages.map((k) => (k.key === 'family' ? { ...k, coins: 2000 } : k)) });
    assert.equal((await book('f2')).body.booking.totalCoins, 2000, 'the very next purchase saw the new price');
    h.catalog.poojas.delete('navratri');
    assert.equal((await book('f2')).status, 404);
    h.catalog.poojas.set('navratri', p);
  });

  test('a retry of a request that already succeeded needs NO catalog and NO wallet answer: it returns the first result', async () => {
    fund('f3', 3000);
    const requestId = 'req-retry-offline';
    const first = await book('f3', { requestId });
    h.catalog.mode = 'down';
    h.wallet.mode = 'down';
    const again = await book('f3', { requestId });
    assert.deepEqual([again.status, again.body.booking.id], [200, first.body.booking.id]);
    assert.equal(again.body.balance, undefined, 'the balance is only shown when the wallet can say; never a made-up 0');
  });

  test('every way the wallet can fail to answer a purchase is 503 wallet_unavailable - never success, never a 500 - and never a booking', async () => {
    fund('f4', 5000);
    for (const mode of ['down', 'broken', 'forbidden']) {
      h.wallet.mode = mode;
      const requestId = `req-f4-${mode}`;
      assert.deepEqual([(await book('f4', { requestId })).status, (await book('f4', { requestId })).body.code], [503, 'wallet_unavailable'], mode);
      assert.deepEqual([(await order('f4')).status], [503], mode);
    }
    assert.equal(await Booking.countDocuments({ uid: 'f4' }), 0);
    assert.equal(await ChadhavaOrder.countDocuments({ uid: 'f4' }), 0);
    assert.equal(h.wallet.balance('f4'), 5000);
  });

  test('an unreadable wallet answer (200 with garbage) is unavailable, not success', async () => {
    fund('f5', 5000);
    const real = globalThis.fetch;
    mock.method(globalThis, 'fetch', async (u, init) => (String(u).startsWith(h.wallet.url) && String(u).includes('/debit') ? new Response('<html>oops</html>', { status: 200 }) : real(u, init)));
    const r = await book('f5');
    assert.deepEqual([r.status, r.body.code], [503, 'wallet_unavailable']);
    assert.equal(await Booking.countDocuments({ uid: 'f5' }), 0, 'no booking is written from an answer nobody could read');
  });

  test('the balance next to an already-booked request is shown only when the wallet can say', async () => {
    fund('f6', 3000);
    const requestId = 'req-balance-shown';
    await book('f6', { requestId });
    assert.equal((await book('f6', { requestId })).body.balance, 3000 - 1251);
  });
});

describe('the sweeper: rows that arrive from elsewhere (the DB split, a crash) are resolved', () => {
  test('an unfinished intent copied from the monolith\'s walletintents (a booking debit that landed) becomes its booking; the finished ones are untouched', async () => {
    const uid = 'sp1';
    const requestId = 'req-copied-0001';
    fund(uid, 5000);
    h.wallet.mode = only('/debit', 'POST');
    await book(uid, { requestId }); // leaves the exact intent + posted debit a crash would
    h.wallet.mode = 'up';
    const copied = await OrderIntent.findOne({ key: bk(uid, requestId) }).lean();
    await OrderIntent.deleteOne({ key: copied.key });
    await OrderIntent.collection.insertOne({ ...copied, _id: undefined, createdAt: copied.createdAt, updatedAt: copied.updatedAt }); // as split-db inserts it: raw, same fields
    assert.equal(await Booking.countDocuments({ uid }), 0);
    assert.equal((await sweepNow()).done, 1);
    assert.equal(await Booking.countDocuments({ uid }), 1);
    assert.equal((await intent(bk(uid, requestId))).status, 'done');
    assert.equal(h.wallet.balance(uid), 5000 - 1251);
  });

  test('the sweeper does not touch an intent younger than the minimum age (a live request may still be finishing it)', async () => {
    fund('sp2', 3000);
    const requestId = 'req-young-0001';
    h.wallet.mode = only('/debit', 'POST');
    await book('sp2', { requestId });
    h.wallet.mode = 'up';
    assert.equal((await sweep({ minAgeMs: 60_000 })).checked, 0);
    assert.equal(await Booking.countDocuments({ uid: 'sp2' }), 0);
    assert.equal((await sweepNow()).done, 1);
  });

  test('the background job (startJobs) resolves a lost answer by itself, and stops when told to', async () => {
    fund('sp3', 3000);
    const requestId = 'req-job-0001';
    h.wallet.mode = only('/debit', 'POST');
    await book('sp3', { requestId });
    h.wallet.mode = 'up';
    const lines = [];
    startJobs({ sweepEveryMs: 40, pruneEveryMs: 0, intentRetentionDays: 30 }, { info: (m) => lines.push(m), error: (m) => lines.push(`E ${m}` ) });
    const t = Date.now();
    while ((await Booking.countDocuments({ uid: 'sp3' })) === 0 && Date.now() - t < 5000) await new Promise((r) => setTimeout(r, 40));
    stopJobs();
    assert.ok(lines.some((l) => /saga sweeper started/.test(l)));
    assert.equal(await Booking.countDocuments({ uid: 'sp3' }), 1, 'the sweeper job wrote the booking behind the lost answer on its own');
    assert.equal((await intent(bk('sp3', requestId))).status, 'done');
    assert.equal(h.wallet.postedFor('booking:sp3:').length, 1);
    const n = await OrderIntent.countDocuments();
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(await OrderIntent.countDocuments(), n, 'stopped: nothing runs any more');
  });
});

describe('refund intents queued before the wallet checked refunds (copied by the DB split) are upgraded, not refused', () => {
  test('a pending refund with no ofKey gets the debit it reverses from its key: `<debit>:failed`, and `booking:<id>:refund` / `chadhava:<id>:refund` via the order row', async () => {
    await OrderIntent.updateMany({ status: 'pending' }, { $set: { status: 'expired' } }); // what earlier tests left waiting is not under test here
    fund('lg1', 3000);
    const b = (await book('lg1', { requestId: 'req-legacy-0001' })).body.booking;
    fund('lg2', 500);
    const o = (await order('lg2', { requestId: 'req-legacy-0002' })).body.order;
    // as the monolith left them: pending refund intents with no ofKey at all
    const mk = (key, uid, amount, refType, refId) => ({ key, kind: 'refund', uid, amount, refType, refId, status: 'pending', openedAt: new Date(Date.now() - 60_000), createdAt: new Date(), updatedAt: new Date() });
    await OrderIntent.collection.insertMany([
      mk(`booking:${b.id}:refund`, 'lg1', 1251, 'booking', b.id),
      mk(`chadhava:${o.id}:refund`, 'lg2', 43, 'chadhava', o.id),
    ]);
    // a failed-save refund for a debit that did land
    h.wallet.fund('lg3', 100);
    await h.ctx.wallet.debit({ uid: 'lg3', amount: 30, type: 'booking_debit', idempotencyKey: 'booking:lg3:req-legacy-0003' });
    await OrderIntent.collection.insertOne(mk('booking:lg3:req-legacy-0003:failed', 'lg3', 30, 'booking', 'req-legacy-0003'));
    const s = await sweepNow();
    assert.deepEqual([s.checked, s.done, s.failed], [3, 3, 0], JSON.stringify(s));
    assert.equal(h.wallet.balance('lg1'), 3000);
    assert.equal(h.wallet.balance('lg2'), 500);
    assert.equal(h.wallet.balance('lg3'), 100);
    const sent = h.wallet.hits.filter((x) => x.path === '/refund').slice(-3).map((x) => x.body.ofKey).sort();
    assert.deepEqual(sent, [bk('lg1', 'req-legacy-0001'), ch('lg2', 'req-legacy-0002'), bk('lg3', 'req-legacy-0003')].sort());
  });

  test('a pending refund whose debit cannot be derived is closed failed - loudly, never paid on a guess', async () => {
    await OrderIntent.updateMany({ status: 'pending' }, { $set: { status: 'expired' } });
    await OrderIntent.collection.insertOne({ key: 'mystery:refund:1', kind: 'refund', uid: 'lg4', amount: 5, status: 'pending', openedAt: new Date(Date.now() - 60_000), createdAt: new Date(), updatedAt: new Date() });
    const before = h.wallet.hits.length;
    assert.equal((await sweepNow()).failed, 1);
    assert.equal(h.wallet.hits.length, before, 'the wallet was not even asked');
    assert.equal((await intent('mystery:refund:1')).status, 'failed');
  });
});

describe('pruning: old terminal intents go, pending ones never do', () => {
  test('terminal intents older than the retention are deleted; younger ones and every pending one stay', async () => {
    const old = new Date(Date.now() - 40 * 86_400_000);
    const young = new Date(Date.now() - 5 * 86_400_000);
    const mk = (key, status, at) => ({ key, kind: 'booking', uid: 'pr', amount: 1, status, openedAt: at, createdAt: at, updatedAt: at });
    await OrderIntent.collection.insertMany([
      mk('pr-done-old', 'done', old), mk('pr-failed-old', 'failed', old), mk('pr-expired-old', 'expired', old), mk('pr-refunded-old', 'refunded', old),
      mk('pr-done-young', 'done', young), mk('pr-pending-old', 'pending', old), mk('pr-pending-young', 'pending', young),
    ]);
    assert.equal(await pruneIntents({ retentionDays: 30 }), 4);
    const left = (await OrderIntent.find({ uid: 'pr' }).lean()).map((x) => x.key).sort();
    assert.deepEqual(left, ['pr-done-young', 'pr-pending-old', 'pr-pending-young']);
    assert.equal(await pruneIntents({ retentionDays: 30 }), 0, 'idempotent');
    assert.equal(await pruneIntents({ retentionDays: 1 }), 1, 'a shorter retention reaches the 5-day-old one');
    assert.equal(await OrderIntent.countDocuments({ key: 'pr-pending-old' }), 1);
  });
});
