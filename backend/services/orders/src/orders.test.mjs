// Service-level tests for the orders service: health, auth refusals, who may call what, every contract shape of bookings / chadhava orders /
// reviews (carried over from the monolith's module tests, so the bytes the app and dashboard read are the same), status transitions, review
// rules, masking, snapshots, push, config.
// Run: TEST_MONGODB_URI=mongodb://127.0.0.1:27251/x node --test --test-concurrency=1 src/orders.test.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { ORDERS_ADMIN_ROUTES, ORDERS_DEVOTEE_ROUTES, ORDERS_GONE, ORDERS_PUBLIC_GETS, permissionsFor, signServiceToken } from '@bhakti/common';
import mongoose from 'mongoose';

import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { connectDb } from './db.js';
import { createRedactor } from './lib/redact.js';
import { Booking, ChadhavaOrder, OrderIntent, PoojaReview } from './models.js';
import { bookingsRouters } from './modules/bookings/index.js';
import { chadhavaRouters } from './modules/chadhava/index.js';
import { reviewsRouters } from './modules/reviews/index.js';
import { seedOrders } from './seed.js';
import { EDITOR, PK, SECRET, VIEWER, boot, day, fakeIdentity, fakePush, names, testConfig, token } from './test-kit.mjs';

const sign = (claims, o = {}) => signServiceToken(claims, { secret: SECRET, ...o });
const OID = '000000000000000000000000';
const HOUR = 3_600_000;

/* ───────────────────────────────────────────────────────────────── health and indexes ── */
describe('health and indexes', () => {
  let server; let url; let ready = false;
  before(async () => {
    const config = testConfig('orders_health_tests');
    await connectDb(config);
    await mongoose.connection.dropDatabase();
    server = http.createServer(createApp(config, { isReady: () => ready, dbPing: async () => {}, logger: { info() {}, warn() {}, error() {} } }));
    await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
    url = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => {
    await new Promise((ok) => { server.closeAllConnections?.(); server.close(ok); });
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  test('/health is 503 {starting:true} until ready, then 200; needs no token; /health/deps lists mongo', async () => {
    let r = await fetch(`${url}/health`);
    assert.equal(r.status, 503);
    assert.equal((await r.json()).starting, true);
    await seedOrders();
    ready = true;
    r = await fetch(`${url}/health`);
    assert.equal(r.status, 200);
    assert.equal((await (await fetch(`${url}/health/deps`)).json()).deps.mongo.ok, true);
  });

  test('the service owns exactly bookings, chadhavaorders, poojareviews, orderintents - and builds the unique indexes the idempotency rests on', async () => {
    await Promise.all([Booking.create({ uid: 'x', bookingRef: 'BKT-AAAAA', requestId: 'r-1' }), ChadhavaOrder.create({ uid: 'x', ref: 'CHD-AAAAA', requestId: 'r-1' }),
      PoojaReview.create({ bookingId: 'b', uid: 'x', poojaSlug: 's', rating: 5 }), OrderIntent.create({ key: 'k', kind: 'booking', uid: 'x', amount: 1 })]);
    const names = (await mongoose.connection.db.listCollections().toArray()).map((c) => c.name).sort();
    assert.deepEqual(names.filter((n) => !n.startsWith('system.')), ['bookings', 'chadhavaorders', 'orderintents', 'poojareviews']);
    await assert.rejects(Booking.create({ uid: 'x', bookingRef: 'BKT-BBBBB', requestId: 'r-1' }), (e) => e.code === 11000, 'unique on (uid, requestId)');
    await assert.rejects(Booking.create({ uid: 'y', bookingRef: 'BKT-AAAAA', requestId: 'r-2' }), (e) => e.code === 11000, 'unique bookingRef');
    await assert.rejects(ChadhavaOrder.create({ uid: 'x', ref: 'CHD-BBBBB', requestId: 'r-1' }), (e) => e.code === 11000);
    await assert.rejects(PoojaReview.create({ bookingId: 'b', uid: 'z', poojaSlug: 's', rating: 1 }), (e) => e.code === 11000, 'one review per booking');
    await assert.rejects(OrderIntent.create({ key: 'k', kind: 'booking', uid: 'x', amount: 1 }), (e) => e.code === 11000, 'one intent per wallet key');
  });
});

/* ──────────────────────────────────────────────────────────────── auth and callers ── */
describe('auth: nothing without a valid service token, and each route family has its own callers', () => {
  let h;
  before(async () => { h = await boot('orders_auth_tests'); });
  after(() => h.stop());

  const FAMILIES = [
    ['GET', '/bookings'], ['GET', `/bookings/${OID}`], ['POST', '/bookings'], ['POST', `/bookings/${OID}/cancel`], ['POST', `/bookings/${OID}/review`],
    ['POST', '/chadhava/orders'], ['GET', '/chadhava/orders'], ['POST', `/chadhava/orders/${OID}/cancel`], ['POST', '/chadhava'],
    ['GET', '/poojas/navratri/reviews'], ['GET', '/pooja-stats'],
    ['GET', '/admin/bookings'], ['PUT', `/admin/bookings/${OID}/status`], ['GET', '/admin/reviews'], ['PUT', `/admin/reviews/${OID}`],
    ['GET', '/admin/chadhava-orders'], ['PUT', `/admin/chadhava-orders/${OID}/status`],
  ];

  test('no token, a garbage token, a token signed with another secret and an expired token are 401 on every route', async () => {
    const bad = {
      none: null,
      garbage: 'not.a.token',
      otherSecret: signServiceToken({ iss: 'mobile-bff', sub: 'u1' }, { secret: 'another-secret-another-secret-1' }),
      expired: sign({ iss: 'mobile-bff', sub: 'u1' }, { now: Date.now() - 10 * 60_000 }),
    };
    for (const [m, p] of FAMILIES) for (const [name, tok] of Object.entries(bad)) {
      const r = await h.call(m, p, { tok, body: m === 'GET' ? undefined : {} });
      assert.equal(r.status, 401, `${name} ${m} ${p}`);
    }
    assert.equal((await h.call('GET', '/bookings', { tok: null })).body.code, 'missing_token');
  });

  test('an issuer that is not on the allow-list is refused even with a valid signature', async () => {
    for (const iss of ['some-other-service', 'wallet', 'engagement', 'monolith', 'calls']) {
      const r = await h.call('GET', '/bookings', { tok: sign({ iss, sub: 'u1' }) });
      assert.deepEqual([r.status, r.body.code], [401, 'wrong_issuer'], iss);
    }
  });

  test('who may use what: devotee routes = mobile-bff; operator routes = admin-bff; stats = catalog; the public review list and the 410 = either BFF', async () => {
    const as = (iss) => sign({ iss, sub: iss === 'admin-bff' ? 'op1' : 'u1', role: iss === 'admin-bff' ? 'admin' : 'devotee', perms: iss === 'admin-bff' ? permissionsFor('admin') : [] });
    const wrong = async (iss, m, p) => { const r = await h.call(m, p, { tok: as(iss), body: m === 'GET' ? undefined : {} }); return r.status === 403 && r.body.code === 'wrong_issuer'; };
    const allowed = async (iss, m, p) => !(await wrong(iss, m, p));

    const devotee = FAMILIES.filter(([, p]) => /^\/(bookings|chadhava\/orders)/.test(p));
    for (const [m, p] of devotee) {
      for (const iss of ['admin-bff', 'catalog']) assert.ok(await wrong(iss, m, p), `${iss} ${m} ${p}`);
      assert.ok(await allowed('mobile-bff', m, p), p);
    }
    for (const [m, p] of FAMILIES.filter(([, x]) => x.startsWith('/admin'))) {
      for (const iss of ['mobile-bff', 'catalog']) assert.ok(await wrong(iss, m, p), `${iss} ${m} ${p}`);
      assert.ok(await allowed('admin-bff', m, p), p);
    }
    for (const iss of ['mobile-bff', 'admin-bff']) assert.ok(await wrong(iss, 'GET', '/pooja-stats'), `${iss} stats`);
    assert.ok(await allowed('catalog', 'GET', '/pooja-stats'));
    for (const p of ['/poojas/navratri/reviews']) {
      for (const iss of ['mobile-bff', 'admin-bff']) assert.ok(await allowed(iss, 'GET', p), `${iss} ${p}`);
      assert.ok(await wrong('catalog', 'GET', p));
    }
    for (const iss of ['mobile-bff', 'admin-bff']) assert.ok(await allowed(iss, 'POST', '/chadhava'), iss);
    assert.ok(await wrong('catalog', 'POST', '/chadhava'));
  });

  test('an unknown path is a refusal for everyone (fail closed), and 404 under /admin even for an admin', async () => {
    assert.equal((await h.call('GET', '/nothing', { tok: sign({ iss: 'mobile-bff', sub: 'u1' }) })).status, 403);
    assert.equal((await h.call('GET', '/admin/nothing', { perms: permissionsFor('admin') })).status, 404);
  });

  test('a devotee token without a subject is 401; an operator token without a subject, or with no permissions, is refused', async () => {
    assert.equal((await h.call('GET', '/bookings', { tok: sign({ iss: 'mobile-bff', sub: null }) })).status, 401);
    assert.equal((await h.call('GET', '/admin/bookings', { tok: sign({ iss: 'admin-bff', sub: null, perms: permissionsFor('admin') }) })).status, 401);
    const none = await h.call('GET', '/admin/bookings', { tok: sign({ iss: 'admin-bff', sub: 'op', perms: [] }) });
    assert.deepEqual([none.status, none.body.code, none.body.needs], [403, 'forbidden', 'orders:view']);
  });

  test('roles: everyone with the dashboard reads; a status change, a review hide and "mark offered" need orders:edit', async () => {
    for (const [name, perms] of [['editor', EDITOR], ['viewer', VIEWER]]) {
      for (const p of ['/admin/bookings', '/admin/reviews', '/admin/chadhava-orders']) assert.equal((await h.call('GET', p, { perms })).status, 200, `${name} ${p}`);
      for (const [m, p, body] of [['PUT', `/admin/bookings/${OID}/status`, { status: 'sankalp' }], ['PUT', `/admin/reviews/${OID}`, { hidden: true }], ['PUT', `/admin/chadhava-orders/${OID}/status`, { status: 'offered' }]]) {
        const r = await h.call(m, p, { perms, body });
        assert.deepEqual([r.status, r.body.code, r.body.needs], [403, 'forbidden', 'orders:edit'], `${name} ${m} ${p}`);
      }
    }
    assert.equal((await h.call('PUT', `/admin/bookings/${OID}/status`, { perms: ['orders:edit'], body: { status: 'sankalp' } })).status, 404, 'orders:edit alone passes the gate');
  });
});

/* ──────────────────────────────────────────────────────────────────────── bookings ── */
describe('bookings: the monolith\'s contract, priced by the catalog, paid at the wallet', () => {
  let h;
  const fund = (uid, n) => h.wallet.fund(uid, n);
  const book = (uid, over = {}, o = {}) => h.call('POST', '/bookings', { uid, ...o, body: { poojaSlug: 'navratri', packageKey: 'family', names: names(4), prasad: false, requestId: `req-${Math.random()}`, ...over } });
  before(async () => { h = await boot('orders_bookings_tests'); });
  after(() => h.stop());

  test('happy path: 4 persons, priced from the catalog snapshot, the wallet debited once, the exact response shape', async () => {
    fund('b1', 2000);
    const r = await book('b1', { prasad: true, address: { line1: '1 Ghat Rd', city: 'Varanasi', pincode: '221001' }, totalCoins: 1, price: 1, packageCoins: 1 });
    assert.equal(r.status, 201);
    assert.deepEqual(Object.keys(r.body), ['booking', 'balance']);
    const b = r.body.booking;
    assert.deepEqual(Object.keys(b), ['id', 'bookingRef', 'kind', 'poojaSlug', 'poojaTitle', 'poojaTitleHi', 'templeName', 'place', 'poojaDate', 'packageKey', 'packageName', 'persons', 'names', 'prasad', 'totalCoins', 'packageCoins', 'prasadCoins', 'status', 'statusHistory', 'refunded', 'canCancel', 'cancelBy', 'review', 'canReview', 'createdAt']);
    assert.deepEqual([b.packageCoins, b.prasadCoins, b.totalCoins, b.persons, b.status, b.kind], [1251, 99, 1350, 4, 'booked', 'pooja']);
    assert.match(b.bookingRef, /^BKT-[A-Z0-9]{5}$/);
    assert.deepEqual([b.canCancel, b.canReview, b.refunded, b.review], [true, false, false, null]);
    assert.equal(b.names.length, 4);
    assert.deepEqual([b.templeName, b.place, b.poojaTitle, b.packageName], ['Kashi Vishwanath', 'Varanasi', 'Navratri Durga Pooja', 'Family']);
    assert.deepEqual(b.statusHistory.map((x) => x.status), ['booked']);
    assert.equal(b.cancelBy, new Date(new Date(`${day(10)}T00:00:00+05:30`).getTime() - 24 * HOUR).toISOString());
    assert.equal(r.body.balance, 650);
    assert.equal(h.wallet.balance('b1'), 650);
    assert.equal(h.wallet.postedFor('booking:b1:').length, 1);
    const list = await h.call('GET', '/bookings', { uid: 'b1' });
    assert.deepEqual(Object.keys(list.body), ['bookings']);
    assert.equal(list.body.bookings.length, 1);
    assert.equal((await h.call('GET', `/bookings/${b.id}`, { uid: 'b1' })).body.booking.bookingRef, b.bookingRef);
    assert.equal((await h.call('GET', `/bookings/${b.id}`, { uid: 'someone' })).status, 404);
    assert.equal((await h.call('GET', '/bookings', { tok: null })).status, 401);
    const doc = await Booking.findOne({ uid: 'b1' }).lean();
    assert.deepEqual([doc.walletTxnId, doc.requestId, doc.devoteeName, doc.gotra], [h.wallet.txns.get(`booking:b1:${doc.requestId}`).id, doc.requestId, 'Devotee 1', 'Kashyap']);
  });

  test('validation: names count, name/gotra length, package, pooja, prasad address, request id', async () => {
    fund('v1', 5000);
    for (const bad of [names(3), names(5), [], undefined, 'x']) assert.equal((await book('v1', { names: bad })).body.code, 'invalid_names');
    assert.equal((await book('v1', { names: names(1), packageKey: 'individual' })).status, 201);
    assert.equal((await book('v1', { names: [{ name: 'A', gotra: '' }], packageKey: 'individual' })).body.code, 'invalid_names');
    assert.equal((await book('v1', { names: [{ name: 'Asha', gotra: 'x'.repeat(41) }], packageKey: 'individual' })).body.code, 'invalid_names');
    assert.equal((await book('v1', { packageKey: 'nope' })).status, 404);
    assert.equal((await book('v1', { poojaSlug: 'nope' })).status, 404);
    assert.equal((await book('v1', { prasad: true })).body.code, 'invalid_address');
    assert.equal((await book('v1', { prasad: true, address: { line1: 'a', city: 'b', pincode: '12' } })).body.code, 'invalid_address');
    for (const requestId of ['x', 'y'.repeat(101), 5, undefined]) assert.equal((await book('v1', { requestId })).body.code, 'bad_request_id');
    assert.equal(h.wallet.balance('v1'), 5000 - 551, 'only the one good booking moved money');
  });

  test('prasad is refused for a pooja that does not offer it', async () => {
    h.catalog.poojas.set('plain', { slug: 'plain', title: 'Plain', packages: [PK('individual', 1, 100)] });
    fund('pa1', 500);
    const r = await book('pa1', { poojaSlug: 'plain', packageKey: 'individual', names: names(1), prasad: true, address: { line1: 'a', city: 'b', pincode: '123456' } });
    assert.deepEqual([r.status, r.body.code], [400, 'prasad_unavailable']);
    assert.equal(h.wallet.balance('pa1'), 500);
  });

  test('insufficient coins: 402 with shortfall, balance and needed; nothing stored', async () => {
    fund('i1', 1000);
    const r = await book('i1');
    assert.equal(r.status, 402);
    assert.deepEqual(r.body, { error: 'Not enough coins.', code: 'insufficient_coins', needed: 1251, balance: 1000, shortfall: 251, type: 'booking_debit' });
    assert.equal(await Booking.countDocuments({ uid: 'i1' }), 0);
    assert.equal(h.wallet.balance('i1'), 1000);
  });

  test('a retried requestId returns the same booking (200) and debits once, even in parallel', async () => {
    fund('r1', 5000);
    const a = await book('r1', { requestId: 'same-request-1' });
    const b = await book('r1', { requestId: 'same-request-1' });
    assert.deepEqual([a.status, b.status, a.body.booking.id === b.body.booking.id], [201, 200, true]);
    assert.equal(h.wallet.balance('r1'), 5000 - 1251);
    const rs = await Promise.all([1, 2, 3].map(() => book('r1', { requestId: 'race-request-1' })));
    assert.ok(rs.every((x) => x.status === 200 || x.status === 201));
    assert.equal(new Set(rs.map((x) => x.body.booking.id)).size, 1);
    assert.equal(h.wallet.balance('r1'), 5000 - 2 * 1251);
    assert.equal(await Booking.countDocuments({ uid: 'r1' }), 2);
    assert.equal(h.wallet.postedFor('booking:r1:').length, 2, 'exactly one debit per request id');
  });

  test('closed windows: past bookingClosesAt, past date, disabled package, disabled pooja, unpublished', async () => {
    fund('c9', 3000);
    h.catalog.poojas.set('closed-one', { slug: 'closed-one', title: 'Closed', bookingClosesAt: new Date(Date.now() - 1000).toISOString(), packages: [PK('individual', 1, 100)] });
    h.catalog.poojas.set('past-one', { slug: 'past-one', title: 'Past', poojaDate: day(-1), packages: [PK('individual', 1, 100)] });
    h.catalog.poojas.set('off-one', { slug: 'off-one', title: 'Off', enabled: false, packages: [PK('individual', 1, 100)] });
    h.catalog.poojas.set('pk-off', { slug: 'pk-off', title: 'PkOff', packages: [{ ...PK('individual', 1, 100), enabled: false }] });
    h.catalog.poojas.set('later', { slug: 'later', title: 'Later', publishAt: new Date(Date.now() + HOUR).toISOString(), packages: [PK('individual', 1, 100)] });
    for (const slug of ['closed-one', 'past-one']) assert.equal((await book('c9', { poojaSlug: slug, packageKey: 'individual', names: names(1) })).body.code, 'booking_closed');
    for (const slug of ['off-one', 'pk-off', 'later']) assert.equal((await book('c9', { poojaSlug: slug, packageKey: 'individual', names: names(1) })).status, 404, slug);
    assert.equal(h.wallet.balance('c9'), 3000);
  });

  test('cancel before the cut-off refunds once, idempotently, at the wallet WITH ofKey = the booking\'s debit; not yours is 404', async () => {
    fund('x1', 2000);
    const b = (await book('x1', { requestId: 'cancel-req-1' })).body.booking;
    assert.equal(h.wallet.balance('x1'), 749);
    const c1 = await h.call('POST', `/bookings/${b.id}/cancel`, { uid: 'x1' });
    const c2 = await h.call('POST', `/bookings/${b.id}/cancel`, { uid: 'x1' });
    assert.deepEqual([c1.status, c1.body.booking.status, c1.body.booking.refunded, c1.body.balance], [200, 'cancelled', true, 2000]);
    assert.equal(c2.body.balance, 2000);
    assert.equal(h.wallet.balance('x1'), 2000);
    assert.equal(h.wallet.postedFor(`booking:${b.id}:refund`).length, 1);
    const sent = h.wallet.hits.filter((x) => x.path === '/refund').at(-1);
    assert.deepEqual([sent.body.ofKey, sent.body.key, sent.body.amount, sent.body.uid, sent.iss], ['booking:x1:cancel-req-1', `booking:${b.id}:refund`, 1251, 'x1', 'orders']);
    assert.deepEqual((await h.call('GET', '/bookings', { uid: 'x1' })).body.bookings[0].statusHistory.map((s) => s.status), ['booked', 'cancelled']);
    assert.equal((await h.call('POST', `/bookings/${b.id}/cancel`, { uid: 'someone' })).status, 404);
    assert.equal((await h.call('POST', '/bookings/not-an-id/cancel', { uid: 'x1' })).status, 404);
  });

  test('cancel after cancelBy, or once the booking has moved on, is 409 cannot_cancel with no refund', async () => {
    fund('x2', 3000);
    const b = (await book('x2')).body.booking;
    await Booking.updateOne({ _id: b.id }, { $set: { cancelBy: new Date(Date.now() - 1000) } });
    const late = await h.call('POST', `/bookings/${b.id}/cancel`, { uid: 'x2' });
    assert.deepEqual([late.status, late.body.code], [409, 'cannot_cancel']);
    assert.equal((await h.call('GET', `/bookings/${b.id}`, { uid: 'x2' })).body.booking.canCancel, false);
    const b2 = (await book('x2')).body.booking;
    await h.call('PUT', `/admin/bookings/${b2.id}/status`, { body: { status: 'sankalp' } });
    assert.equal((await h.call('POST', `/bookings/${b2.id}/cancel`, { uid: 'x2' })).status, 409);
    assert.equal(h.wallet.balance('x2'), 3000 - 2 * 1251);
  });

  test('status moves forward only, writes statusHistory, and cancelled is final', async () => {
    fund('s1', 5000);
    const b = (await book('s1')).body.booking;
    const put = (id, status) => h.call('PUT', `/admin/bookings/${id}/status`, { body: { status } });
    assert.equal((await put(b.id, 'booked')).body.code, 'invalid_status');
    assert.equal((await put(b.id, 'cancelled')).body.code, 'invalid_status');
    assert.equal((await put(b.id, undefined)).body.code, 'invalid_status');
    const s = await put(b.id, 'sankalp');
    assert.deepEqual([s.status, s.body.booking.status], [200, 'sankalp']);
    const again = await put(b.id, 'sankalp');
    assert.deepEqual([again.status, again.body.code, again.body.from, again.body.to], [409, 'invalid_transition', 'sankalp', 'sankalp']);
    const p = await put(b.id, 'performed');
    assert.deepEqual(p.body.booking.statusHistory.map((x) => x.status), ['booked', 'sankalp', 'performed']);
    assert.equal((await put(b.id, 'sankalp')).body.code, 'invalid_transition');
    const skip = (await book('s1')).body.booking; // a step may be skipped
    assert.equal((await put(skip.id, 'performed')).body.booking.status, 'performed');
    const c = (await book('s1')).body.booking;
    await h.call('POST', `/bookings/${c.id}/cancel`, { uid: 's1' });
    assert.equal((await put(c.id, 'sankalp')).status, 409);
    assert.equal((await put(OID, 'sankalp')).status, 404);
    assert.equal((await put('nope', 'sankalp')).status, 404);
  });

  test('two operators changing the same booking at once: one wins, the other is a clean 409', async () => {
    fund('s2', 2000);
    const b = (await book('s2')).body.booking;
    const rs = await Promise.all(Array.from({ length: 6 }, () => h.call('PUT', `/admin/bookings/${b.id}/status`, { body: { status: 'sankalp' } })));
    assert.equal(rs.filter((r) => r.status === 200).length, 1);
    assert.ok(rs.filter((r) => r.status !== 200).every((r) => r.status === 409 && r.body.code === 'invalid_transition'));
    assert.deepEqual((await Booking.findById(b.id).lean()).statusHistory.map((x) => x.status), ['booked', 'sankalp']);
  });

  test('history is a snapshot: renaming a pooja or raising a price in the catalog never rewrites an existing booking', async () => {
    fund('h1', 5000);
    const b = (await book('h1')).body.booking;
    const p = h.catalog.poojas.get('navratri');
    h.catalog.poojas.set('navratri', { ...p, title: 'RENAMED', place: 'Elsewhere', packages: p.packages.map((k) => ({ ...k, coins: k.coins * 10, name: 'Changed' })) });
    h.catalog.temples.set('kashi', { slug: 'kashi', name: 'Other Temple', location: 'Nowhere' });
    try {
      const again = (await h.call('GET', `/bookings/${b.id}`, { uid: 'h1' })).body.booking;
      assert.deepEqual(again, b, 'the booking reads exactly as it was bought');
      assert.deepEqual([again.poojaTitle, again.packageName, again.totalCoins, again.templeName, again.place], ['Navratri Durga Pooja', 'Family', 1251, 'Kashi Vishwanath', 'Varanasi']);
      const row = (await h.call('GET', '/admin/bookings?q=' + b.bookingRef)).body.bookings[0];
      assert.deepEqual([row.poojaTitle, row.totalCoins], ['Navratri Durga Pooja', 1251]);
      // ...and cancelling refunds what was PAID, not the new price
      const c = await h.call('POST', `/bookings/${b.id}/cancel`, { uid: 'h1' });
      assert.equal(c.body.balance, 5000);
    } finally {
      h.catalog.poojas.set('navratri', p);
      h.catalog.temples.set('kashi', { slug: 'kashi', name: 'Kashi Vishwanath', location: 'Varanasi' });
    }
  });

  test('the price is computed here: a changed catalog price is charged as read at purchase time, a client price is ignored', async () => {
    fund('pp', 5000);
    const p = h.catalog.poojas.get('navratri');
    h.catalog.poojas.set('navratri', { ...p, packages: p.packages.map((k) => (k.key === 'family' ? { ...k, coins: 1000 } : k)) });
    try {
      const r = await book('pp', { price: 1, totalCoins: 1, packageCoins: 1, coins: 1 });
      assert.deepEqual([r.status, r.body.booking.totalCoins, r.body.balance], [201, 1000, 4000]);
    } finally { h.catalog.poojas.set('navratri', p); }
  });

  test('review: only performed, once, rating 1-5, text <= 500; first name only (the token\'s name first, the typed name last); admin can hide', async () => {
    fund('rv', 5000);
    const b = (await book('rv')).body.booking;
    const rev = (id, body, uid = 'rv', name = 'Meera Sharma') => h.call('POST', `/bookings/${id}/review`, { uid, body, name });
    assert.equal((await rev(b.id, { rating: 5 })).body.code, 'not_reviewable'); // still booked
    await h.call('PUT', `/admin/bookings/${b.id}/status`, { body: { status: 'performed' } });
    assert.equal((await h.call('GET', `/bookings/${b.id}`, { uid: 'rv' })).body.booking.canReview, true);
    for (const bad of [{ rating: 0 }, { rating: 6 }, { rating: 4.5 }, { rating: '5' }, {}, { rating: 5, text: 'x'.repeat(501) }, { rating: 5, text: 7 }]) {
      assert.equal((await rev(b.id, bad)).body.code, 'invalid_review');
    }
    assert.equal((await rev(b.id, { rating: 5 }, 'other')).status, 404);
    const ok = await rev(b.id, { rating: 5, text: '  Wonderful  ' });
    assert.deepEqual([ok.status, ok.body.booking.review.rating, ok.body.booking.review.text, ok.body.booking.canReview], [201, 5, 'Wonderful', false]);
    assert.deepEqual(Object.keys(ok.body), ['booking']);
    assert.equal((await rev(b.id, { rating: 1 })).body.code, 'not_reviewable'); // once
    assert.equal((await PoojaReview.findOne({ bookingId: b.id }).lean()).name, 'Meera');
    const list = (await h.call('GET', '/admin/reviews')).body.reviews;
    assert.deepEqual([list[0].poojaTitle, list[0].rating, list[0].bookingRef], ['Navratri Durga Pooja', 5, b.bookingRef]);
    assert.equal((await h.call('PUT', `/admin/reviews/${list[0].id}`, { body: { hidden: 'yes' } })).status, 400);
    assert.equal((await h.call('PUT', `/admin/reviews/${list[0].id}`, { body: { hidden: true } })).body.review.hidden, true);
    assert.equal((await h.call('GET', '/admin/reviews?hidden=false')).body.reviews.length, 0);
    assert.equal((await h.call('GET', '/admin/reviews?hidden=true')).body.reviews.length, 1);
  });

  test('review name: the signed token\'s name wins; with no name there it asks the identity directory; with neither it falls back to the typed name, then "Devotee"', async () => {
    h.identity.users.push({ uid: 'rn2', name: 'Lakshmi Iyer', contact: '+91 99999 00002' });
    const mk = async (uid) => { fund(uid, 2000); const b = (await book(uid, { names: [{ name: 'Gopal Das', gotra: '' }, ...names(3)] })).body.booking; await h.call('PUT', `/admin/bookings/${b.id}/status`, { body: { status: 'performed' } }); return b; };
    const cases = [['rn1', 'Tara Devi', 'Tara'], ['rn2', undefined, 'Lakshmi'], ['rn3', undefined, 'Gopal']];
    for (const [uid, name, want] of cases) {
      const b = await mk(uid);
      await h.call('POST', `/bookings/${b.id}/review`, { uid, name, body: { rating: 4 } });
      assert.equal((await PoojaReview.findOne({ bookingId: b.id }).lean()).name, want, uid);
    }
    h.identity.down = true; // identity down: never an error, just the next fallback
    h.identity.users.push({ uid: 'rn4', name: 'Never Seen' });
    const b4 = await mk('rn4');
    assert.equal((await h.call('POST', `/bookings/${b4.id}/review`, { uid: 'rn4', body: { rating: 3 } })).status, 201);
    assert.equal((await PoojaReview.findOne({ bookingId: b4.id }).lean()).name, 'Gopal');
    h.identity.down = false;
  });

  test('two reviews raced for one booking: exactly one is stored', async () => {
    fund('rr', 2000);
    const b = (await book('rr')).body.booking;
    await h.call('PUT', `/admin/bookings/${b.id}/status`, { body: { status: 'performed' } });
    const rs = await Promise.all(Array.from({ length: 5 }, () => h.call('POST', `/bookings/${b.id}/review`, { uid: 'rr', body: { rating: 5 } })));
    assert.equal(rs.filter((r) => r.status === 201).length, 1, JSON.stringify(rs.map((r) => r.body)));
    assert.ok(rs.filter((r) => r.status !== 201).every((r) => r.status === 409 && r.body.code === 'not_reviewable'));
    assert.equal(await PoojaReview.countDocuments({ bookingId: b.id }), 1);
  });

  test('review moderation: edit text, hide + edit, validation, immutable fields, the devotee\'s words kept', async () => {
    const r0 = await PoojaReview.create({ bookingId: 'bk-mod', bookingRef: 'REF-MOD', uid: 'rv-mod', poojaSlug: 'navratri', poojaTitle: 'Navratri Durga Pooja', name: 'Meera', rating: 4, text: 'Rude  word here' });
    const id = String(r0._id);
    const put = (body) => h.call('PUT', `/admin/reviews/${id}`, { body });
    for (const bad of [{}, { rating: 1 }, { text: 5 }, { text: null }, { text: ['a'] }, { text: 'x'.repeat(501) }, { hidden: 'no' }, { text: 'ok', hidden: 1 }]) {
      const r = await put(bad);
      assert.deepEqual([r.status, r.body.code], [400, 'invalid_review'], JSON.stringify(bad));
    }
    assert.equal((await h.call('PUT', `/admin/reviews/${OID}`, { body: { text: 'x' } })).status, 404);
    assert.equal((await PoojaReview.findById(id).lean()).edited, false);

    const a = await put({ text: '  Lovely word  ', rating: 1, name: 'Hacker', uid: 'zzz', bookingId: 'other', originalText: 'fake', edited: false });
    assert.equal(a.status, 200);
    assert.deepEqual([a.body.review.text, a.body.review.edited, a.body.review.hidden, a.body.review.rating], ['Lovely word', true, false, 4]);
    assert.ok(a.body.review.editedAt);
    let d = await PoojaReview.findById(id).lean();
    assert.deepEqual([d.rating, d.name, d.uid, d.bookingId, d.originalText], [4, 'Meera', 'rv-mod', 'bk-mod', 'Rude  word here']);

    const b = await put({ hidden: true, text: '' });
    assert.deepEqual([b.status, b.body.review.hidden, b.body.review.text], [200, true, '']);
    d = await PoojaReview.findById(id).lean();
    assert.equal(d.originalText, 'Rude  word here', 'the FIRST original is kept');

    const at = d.editedAt.getTime();
    await put({ hidden: false });
    assert.equal((await PoojaReview.findById(id).lean()).editedAt.getTime(), at, 'hide-only is not an edit');
    const fresh = await PoojaReview.create({ bookingId: 'bk-mod2', uid: 'rv-mod2', poojaSlug: 'navratri', name: 'A', rating: 5, text: 'same' });
    const same = await h.call('PUT', `/admin/reviews/${fresh._id}`, { body: { text: ' same ' } });
    assert.deepEqual([same.body.review.edited, same.body.review.editedAt], [false, null], 'unchanged text is not an edit');
    const row = (await h.call('GET', '/admin/reviews')).body.reviews.find((x) => x.id === id);
    assert.deepEqual(Object.keys(row), ['id', 'bookingRef', 'poojaTitle', 'rating', 'text', 'hidden', 'edited', 'editedAt', 'createdAt', 'uid', 'who']);
    assert.equal('originalText' in row, false, 'the original text is never in the list');
    await PoojaReview.deleteMany({ bookingId: { $in: ['bk-mod', 'bk-mod2'] } });
  });

  test('admin list: filters, search, the row shape; a role without devotees:view gets masked names and cannot search by them', async () => {
    h.identity.users.push({ uid: 'b1', name: 'Asha Rao', contact: '+91 1' });
    const all = await h.call('GET', '/admin/bookings');
    assert.equal(all.status, 200);
    assert.ok(all.body.bookings.length >= 5);
    const withAddr = all.body.bookings.find((b) => b.address);
    assert.deepEqual(Object.keys(withAddr), ['id', 'bookingRef', 'kind', 'poojaSlug', 'poojaTitle', 'poojaTitleHi', 'templeName', 'place', 'poojaDate', 'packageKey', 'packageName', 'persons', 'names', 'prasad', 'totalCoins', 'packageCoins', 'prasadCoins', 'status', 'statusHistory', 'refunded', 'canCancel', 'cancelBy', 'review', 'canReview', 'createdAt', 'uid', 'who', 'devoteeName', 'gotra', 'address']);
    assert.deepEqual([withAddr.who, withAddr.address, withAddr.devoteeName, withAddr.gotra], ['Asha Rao', { line1: '1 Ghat Rd', city: 'Varanasi', pincode: '221001' }, 'Devotee 1', 'Kashyap']);
    const performed = (await h.call('GET', '/admin/bookings?status=performed')).body.bookings;
    assert.ok(performed.length >= 1 && performed.every((x) => x.status === 'performed'));
    assert.ok((await h.call('GET', '/admin/bookings?q=Devotee%201')).body.bookings.length >= 1);
    assert.equal((await h.call('GET', '/admin/bookings?limit=2')).body.bookings.length, 2);
    assert.ok((await h.call('GET', '/admin/bookings?status=whatever')).body.bookings.length >= 5, 'an unknown status filters nothing');

    // an editor holds orders:view but not devotees:view
    const masked = (await h.call('GET', '/admin/bookings?q=Navratri', { perms: EDITOR })).body.bookings.find((b) => b.uid === 'b1');
    const ps = createRedactor('session-secret-session-secret-12').pseudonym('b1');
    assert.deepEqual([masked.who, masked.devoteeName, masked.gotra, masked.address], [ps, ps, '', null]);
    assert.ok(masked.names.every((n) => n.name === ps && n.gotra === ''));
    assert.ok(!JSON.stringify(masked).includes('Ghat Rd') && !JSON.stringify(masked).includes('Kashyap') && !JSON.stringify(masked).includes('Asha'));
    assert.equal((await h.call('GET', '/admin/bookings?q=Devotee%201', { perms: EDITOR })).body.bookings.length, 0, 'a masked role cannot find a person by a typed name');
    assert.ok((await h.call('GET', '/admin/bookings?q=BKT', { perms: EDITOR })).body.bookings.length >= 5, 'but can search by reference');
    const reviews = (await h.call('GET', '/admin/reviews', { perms: VIEWER })).body.reviews;
    assert.ok(reviews.every((r) => r.who === createRedactor('session-secret-session-secret-12').pseudonym(r.uid)));
  });

  test('status changes push to the devotee (best effort): the right title / body / data, and a failing push never fails the request', async () => {
    h.identity.users.push({ uid: 'pu', name: 'Pushy', deviceId: 'dev-1' });
    fund('pu', 3000);
    const b = (await book('pu')).body.booking;
    const sent0 = h.push.sent.length;
    assert.equal((await h.call('PUT', `/admin/bookings/${b.id}/status`, { body: { status: 'sankalp' } })).status, 200);
    assert.deepEqual(h.push.sent.at(-1), { uid: 'pu', title: 'Sankalp taken', body: 'The sankalp for your Navratri Durga Pooja booking has been taken.', data: { type: 'booking_status', bookingId: b.id, status: 'sankalp' } });
    h.push.throws = true;
    const r = await h.call('PUT', `/admin/bookings/${b.id}/status`, { body: { status: 'performed' } });
    h.push.throws = false;
    assert.equal(r.status, 200, 'a push that explodes does not reach the operator');
    assert.equal(h.push.sent.length, sent0 + 1);
    const nothing = await h.call('PUT', `/admin/bookings/${b.id}/status`, { body: { status: 'performed' } });
    assert.equal(nothing.status, 409);
    assert.equal(h.push.sent.length, sent0 + 1, 'a refused change sends nothing');
  });
});

/* ───────────────────────────────────────────────────────────────── chadhava orders ── */
describe('chadhava orders: the monolith\'s contract', () => {
  let h;
  const fund = (uid, n) => h.wallet.fund(uid, n);
  const order = (uid, body = {}) => h.call('POST', '/chadhava/orders', { uid, body: { listingSlug: 'ganga-aarti', items: [{ key: 'flowers', qty: 2 }, { key: 'diya', qty: 1 }], requestId: `req-${Math.random()}`, ...body } });
  before(async () => {
    h = await boot('orders_chadhava_tests');
    h.catalog.listings.set('closed', { slug: 'closed', title: 'Closed', endsAt: new Date(Date.now() - HOUR).toISOString(), offerings: [{ key: 'a', title: 'A', coins: 5, enabled: true }] });
    h.catalog.listings.set('future', { slug: 'future', title: 'Future', startsAt: new Date(Date.now() + HOUR).toISOString(), offerings: [{ key: 'a', title: 'A', coins: 5, enabled: true }] });
    h.catalog.listings.set('ends-soon', { slug: 'ends-soon', title: 'Ends soon', endsAt: new Date(Date.now() + 48 * HOUR).toISOString(), offerings: [{ key: 'a', title: 'A', coins: 5, enabled: true }] });
  });
  after(() => h.stop());

  test('the total is computed from the catalog\'s snapshot; client prices are ignored; the response shape', async () => {
    fund('d1', 100);
    const r = await order('d1', { items: [{ key: 'flowers', qty: 2, coins: 1, price: 0 }, { key: 'diya', qty: 1 }], totalCoins: 1, total: 1 });
    assert.equal(r.status, 201);
    assert.deepEqual(Object.keys(r.body), ['order', 'balance']);
    assert.deepEqual(Object.keys(r.body.order), ['id', 'ref', 'listingSlug', 'listingTitle', 'listingTitleHi', 'items', 'totalCoins', 'status', 'refunded', 'canCancel', 'createdAt']);
    assert.equal(r.body.order.totalCoins, 43); // 2*11 + 21
    assert.deepEqual(r.body.order.items, [{ key: 'flowers', title: 'Flowers', qty: 2, coins: 11 }, { key: 'diya', title: 'Diya', qty: 1, coins: 21 }]);
    assert.match(r.body.order.ref, /^CHD-[A-Z0-9]{5}$/);
    assert.deepEqual([r.body.order.status, r.body.order.canCancel, r.body.balance, r.body.order.listingTitleHi], ['booked', true, 57, 'गंगा आरती']);
    assert.equal(h.wallet.postedFor('chadhava:d1:').length, 1);
    const list = await h.call('GET', '/chadhava/orders', { uid: 'd1' });
    assert.deepEqual([Object.keys(list.body), list.body.orders.length], [['orders'], 1]);
    assert.equal((await h.call('GET', '/chadhava/orders', { tok: null })).status, 401);
    const doc = await ChadhavaOrder.findOne({ uid: 'd1' }).lean();
    assert.deepEqual([doc.templeName, doc.templeSlug, doc.walletTxnId], ['Kashi Vishwanath', 'kashi', h.wallet.txns.get(`chadhava:d1:${doc.requestId}`).id]);
  });

  test('validation and errors: invalid_items, listing_closed, not_found, 402 with shortfall', async () => {
    fund('d2', 30);
    assert.equal((await order('d2', { items: [{ key: 'hidden', qty: 1 }] })).body.code, 'invalid_items'); // disabled offering
    assert.equal((await order('d2', { items: [{ key: 'nope', qty: 1 }] })).body.code, 'invalid_items');
    for (const items of [[], [{ key: 'flowers', qty: 0 }], [{ key: 'flowers', qty: 21 }], [{ key: 'flowers', qty: 1.5 }], 'x']) assert.equal((await order('d2', { items })).body.code, 'invalid_items');
    assert.equal((await order('d2', { listingSlug: 'closed' })).body.code, 'listing_closed');
    assert.equal((await order('d2', { listingSlug: 'future' })).body.code, 'listing_closed');
    assert.equal((await order('d2', { listingSlug: 'nope' })).status, 404);
    assert.equal((await order('d2', { requestId: 'short' })).body.code, 'bad_request_id');
    const r = await order('d2');
    assert.deepEqual([r.status, r.body.code, r.body.needed, r.body.balance, r.body.shortfall], [402, 'insufficient_coins', 43, 30, 13]);
    assert.equal(await ChadhavaOrder.countDocuments({ uid: 'd2' }), 0);
    assert.equal(h.wallet.balance('d2'), 30);
  });

  test('idempotent retry charges once, in series and in parallel', async () => {
    fund('d3', 200);
    const a = await order('d3', { requestId: 'chad-same-1' });
    const b = await order('d3', { requestId: 'chad-same-1' });
    assert.deepEqual([a.status, b.status, a.body.order.id === b.body.order.id], [201, 200, true]);
    const rs = await Promise.all([1, 2, 3, 4].map(() => order('d3', { requestId: 'chad-race-1' })));
    assert.equal(new Set(rs.map((r) => r.body.order.id)).size, 1);
    assert.equal(h.wallet.balance('d3'), 200 - 86);
    assert.equal(h.wallet.postedFor('chadhava:d3:').length, 2);
  });

  test('cancel refunds while booked and before the listing ends (ofKey = the order\'s debit); then 409; not yours is 404', async () => {
    fund('k1', 100);
    const o = (await order('k1', { requestId: 'chad-cancel-1', listingSlug: 'ends-soon', items: [{ key: 'a', qty: 3 }] })).body.order;
    assert.equal(o.totalCoins, 15);
    const c1 = await h.call('POST', `/chadhava/orders/${o.id}/cancel`, { uid: 'k1' });
    const c2 = await h.call('POST', `/chadhava/orders/${o.id}/cancel`, { uid: 'k1' });
    assert.deepEqual([c1.status, c1.body.order.status, c1.body.order.refunded, c1.body.balance, c2.body.balance], [200, 'cancelled', true, 100, 100]);
    assert.equal(h.wallet.postedFor(`chadhava:${o.id}:refund`).length, 1);
    assert.equal(h.wallet.hits.filter((x) => x.path === '/refund').at(-1).body.ofKey, 'chadhava:k1:chad-cancel-1');
    assert.equal((await h.call('POST', `/chadhava/orders/${o.id}/cancel`, { uid: 'other' })).status, 404);
    const late = (await order('k1', { listingSlug: 'ends-soon', items: [{ key: 'a', qty: 1 }] })).body.order;
    await ChadhavaOrder.updateOne({ _id: late.id }, { $set: { cancelBy: new Date(Date.now() - 1000) } });
    assert.equal((await h.call('POST', `/chadhava/orders/${late.id}/cancel`, { uid: 'k1' })).status, 409);
    assert.equal(h.wallet.balance('k1'), 95);
  });

  test('admin: the orders list, "mark offered" once (cancel then refused), the retired free-amount chadhava is 410', async () => {
    fund('m1', 100);
    const o = (await order('m1')).body.order;
    h.identity.users.push({ uid: 'm1', name: 'Mani', deviceId: 'dev-m1' });
    const list = (await h.call('GET', '/admin/chadhava-orders')).body.orders;
    assert.ok(list.length >= 3);
    assert.deepEqual(Object.keys(list[0]), ['id', 'ref', 'listingSlug', 'listingTitle', 'listingTitleHi', 'items', 'totalCoins', 'status', 'refunded', 'canCancel', 'createdAt', 'uid', 'who', 'templeName', 'at']);
    assert.equal(list.find((x) => x.id === o.id).who, 'Mani');
    assert.equal((await h.call('PUT', `/admin/chadhava-orders/${o.id}/status`, { body: { status: 'booked' } })).status, 400);
    assert.equal((await h.call('PUT', `/admin/chadhava-orders/${o.id}/status`, { body: { status: 'offered' } })).body.order.status, 'offered');
    assert.deepEqual(h.push.sent.at(-1), { uid: 'm1', title: 'Chadhava offered', body: 'Your chadhava for Ganga Aarti Chadhava has been offered.', data: { type: 'chadhava_status', orderId: o.id, status: 'offered' } });
    const again = await h.call('PUT', `/admin/chadhava-orders/${o.id}/status`, { body: { status: 'offered' } });
    assert.deepEqual([again.status, again.body.code], [409, 'invalid_transition']);
    assert.equal((await h.call('POST', `/chadhava/orders/${o.id}/cancel`, { uid: 'm1' })).status, 409);
    assert.equal((await h.call('PUT', `/admin/chadhava-orders/${OID}/status`, { body: { status: 'offered' } })).status, 404);
    const gone = await h.call('POST', '/chadhava', { iss: 'mobile-bff', tok: sign({ iss: 'mobile-bff' }), body: { templeSlug: 'x', amount: 21 } });
    assert.deepEqual([gone.status, gone.body], [410, { error: 'This chadhava is no longer offered. Please update the app.', code: 'gone' }]);
  });

  test('history is a snapshot: a later catalog price change never rewrites an order', async () => {
    const before = (await h.call('GET', '/chadhava/orders', { uid: 'd1' })).body.orders[0];
    const l = h.catalog.listings.get('ganga-aarti');
    h.catalog.listings.set('ganga-aarti', { ...l, title: 'RENAMED', offerings: l.offerings.map((o) => ({ ...o, coins: o.coins * 10, title: 'Changed' })) });
    try {
      assert.deepEqual((await h.call('GET', '/chadhava/orders', { uid: 'd1' })).body.orders[0], before);
      assert.deepEqual([before.listingTitle, before.totalCoins, before.items[0].title], ['Ganga Aarti Chadhava', 43, 'Flowers']);
    } finally { h.catalog.listings.set('ganga-aarti', l); }
  });
});

/* ───────────────────────────────────────────────── public reviews, stats for the catalog ── */
describe('public reviews and the numbers the catalog shows', () => {
  let h;
  before(async () => {
    h = await boot('orders_reviews_tests');
    const mk = (i, over) => ({ bookingId: `bk${i}`, uid: `u${i}`, poojaSlug: 'navratri', packageName: 'Family', name: `N${i}`, rating: 5, text: `t${i}`, createdAt: new Date(Date.now() - i * 1000), ...over });
    await PoojaReview.insertMany([mk(1, { rating: 5 }), mk(2, { rating: 4 }), mk(3, { rating: 1, hidden: true }), mk(4, { rating: 4 }), mk(5, { poojaSlug: 'other', rating: 2 })]);
    await Booking.insertMany([
      { uid: 'a', bookingRef: 'BKT-A1', poojaSlug: 'navratri', status: 'booked' }, { uid: 'b', bookingRef: 'BKT-A2', poojaSlug: 'navratri', status: 'performed' },
      { uid: 'c', bookingRef: 'BKT-A3', poojaSlug: 'navratri', status: 'cancelled' }, { uid: 'd', bookingRef: 'BKT-A4', poojaSlug: 'only-bookings', status: 'sankalp' },
    ]);
  });
  after(() => h.stop());

  test('GET /poojas/:slug/reviews: visible only, newest first, the exact row shape, limit and before; an unknown pooja is 404', async () => {
    const r = await h.call('GET', '/poojas/navratri/reviews', { iss: 'mobile-bff', tok: sign({ iss: 'mobile-bff' }) });
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body), ['reviews']);
    assert.deepEqual(r.body.reviews.map((x) => x.name), ['N1', 'N2', 'N4']);
    assert.deepEqual(Object.keys(r.body.reviews[0]), ['id', 'name', 'rating', 'text', 'createdAt', 'packageName']);
    const call = (q, iss = 'admin-bff') => h.call('GET', `/poojas/navratri/reviews${q}`, { tok: sign({ iss }) });
    assert.deepEqual((await call('?limit=1')).body.reviews.map((x) => x.name), ['N1']);
    assert.equal((await call('?limit=0')).body.reviews.length, 3, 'a falsy limit means the default of 20, as in the monolith');
    assert.equal((await call('?limit=-5')).body.reviews.length, 1, 'a negative limit is clamped to 1');
    assert.equal((await call('?limit=1000')).body.reviews.length, 3, 'and an enormous one to 50');
    assert.equal((await call(`?before=${encodeURIComponent(new Date(Date.now() - 1500).toISOString())}`)).body.reviews.length, 2);
    assert.deepEqual([(await call('?before=nope')).status, (await call('?before=nope')).body.code], [400, 'bad_before']);
    assert.equal((await h.call('GET', '/poojas/ghost/reviews', { tok: sign({ iss: 'mobile-bff' }) })).status, 404);
  });

  test('the catalog being down while listing reviews: an unknown slug is an empty list, never a 500', async () => {
    h.catalog.mode = 'down';
    try {
      const r = await h.call('GET', '/poojas/never-heard-of/reviews', { tok: sign({ iss: 'mobile-bff' }) });
      assert.deepEqual([r.status, r.body], [200, { reviews: [] }]);
    } finally { h.catalog.mode = 'up'; }
  });

  test('GET /pooja-stats keeps the monolith\'s shape exactly: booking counts without cancelled ones, ratings from visible reviews only', async () => {
    const r = await h.call('GET', '/pooja-stats', { tok: sign({ iss: 'catalog' }) });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, {
      stats: {
        navratri: { bookingCount: 2, rating: { avg: 4.3, count: 3 } },
        'only-bookings': { bookingCount: 1, rating: null },
        other: { bookingCount: 0, rating: { avg: 2, count: 1 } },
      },
    });
  });
});

/* ──────────────────────────────────────────────────────────────── the BFF route tables ── */
describe('every route the BFFs forward exists here, and every route here is forwarded', () => {
  let h;
  before(async () => { h = await boot('orders_routes_tests'); });
  after(() => h.stop());

  const walk = (stack, found = new Set()) => {
    for (const l of stack) {
      if (l.route) for (const m of Object.keys(l.route.methods)) found.add(`${m.toUpperCase()} ${l.route.path}`);
      else if (l.handle?.stack) walk(l.handle.stack, found);
    }
    return found;
  };

  test('table -> service: each entry is a real route (not the 404 fall-through)', async () => {
    const rows = [
      ...ORDERS_ADMIN_ROUTES.map((r) => ({ ...r, who: 'admin' })),
      ...ORDERS_DEVOTEE_ROUTES.map((r) => ({ ...r, who: 'devotee' })),
      ...ORDERS_PUBLIC_GETS.map((r) => ({ method: 'GET', path: r.path, sample: r.path.replace(':slug', 'navratri'), who: 'public' })),
      { ...ORDERS_GONE, who: 'gone' },
    ];
    for (const r of rows) {
      const path = r.sample ?? r.path;
      const res = await h.call(r.method, path, r.who === 'admin' ? { body: r.method === 'GET' ? undefined : { status: 'sankalp' } } : r.who === 'devotee' ? { uid: 'route-probe', body: r.method === 'GET' ? undefined : {} } : { tok: sign({ iss: 'mobile-bff' }), body: r.method === 'GET' ? undefined : {} });
      assert.ok(!(res.status === 404 && res.body?.error === 'not found'), `${r.method} ${path} hit the 404 fall-through`);
    }
  });

  test('service -> table: every route the three modules register is in a BFF table (a new one needs an entry there and an area)', () => {
    const b = bookingsRouters();
    const c = chadhavaRouters();
    const r = reviewsRouters();
    const found = new Set();
    for (const router of [b.devotee, b.admin, c.public, c.devotee, c.admin, r.public, r.admin]) walk(router.stack, found);
    const mine = new Set([
      ...ORDERS_ADMIN_ROUTES.map((x) => `${x.method} ${x.path}`),
      ...ORDERS_DEVOTEE_ROUTES.map((x) => `${x.method} ${x.path}`),
      ...ORDERS_PUBLIC_GETS.map((x) => `GET ${x.path}`),
      `${ORDERS_GONE.method} ${ORDERS_GONE.path}`,
      'GET /pooja-stats', // catalog's, not a BFF route
    ]);
    assert.deepEqual([...found].sort(), [...mine].sort());
  });
});

/* ───────────────────────────────────────────────────────────────────────────── masking ── */
describe('masking: the same pseudonym algorithm as the monolith and the wallet', () => {
  const mono = (f) => new URL(`../../../../pooja-api/src/access/${f}`, import.meta.url);
  const have = existsSync(fileURLToPath(mono('redact.js')));

  test('createRedactor produces the monolith\'s pseudonyms for the same secret, and masks bookings the same way', { skip: !have && 'pooja-api not checked out next to backend/' }, async () => {
    const secret = 'parity-session-secret-1234567890';
    const prev = process.env.ADMIN_SESSION_SECRET;
    process.env.ADMIN_SESSION_SECRET = secret;
    const m = await import(`${mono('redact.js').href}?parity=${Date.now()}`);
    if (prev === undefined) delete process.env.ADMIN_SESSION_SECRET; else process.env.ADMIN_SESSION_SECRET = prev;
    const mine = createRedactor(secret);
    for (const uid of ['u1', 'abc123', 'a-very-long-firebase-uid-0001', '', undefined]) assert.equal(mine.pseudonym(uid), m.pseudonym(uid), String(uid));
    const rows = [{ uid: 'u9', who: 'Asha', note: 'refund for Asha', createdBy: 'ops', names: [{ name: 'Asha', gotra: 'K' }], address: { line1: 'x' }, devoteeName: 'Asha', gotra: 'K' }];
    const reqNo = { can: () => false };
    const reqYes = { can: () => true };
    assert.deepEqual(mine.redactBookings(rows, reqNo), m.redactBookings(rows, reqNo));
    assert.deepEqual(mine.redactWho(rows, reqNo), m.redactWho(rows, reqNo));
    assert.deepEqual(mine.redactBookings(rows, reqYes), rows);
    assert.deepEqual(mine.redactBookings(rows, {}), m.redactBookings(rows, {}), 'fail closed: no req.can = masked');
  });
});

/* ──────────────────────────────────────────────────────────────────────────── config ── */
describe('config', () => {
  const here = (p) => fileURLToPath(new URL(p, import.meta.url));

  test('the required variables, the defaults, and the parsing', () => {
    const base = { INTERNAL_JWT_SECRET: 'x'.repeat(16), WALLET_URL: 'http://w/', CATALOG_URL: 'http://c//', IDENTITY_URL: ' http://i ', ENGAGEMENT_URL: 'http://e' };
    const c = loadConfig(base);
    assert.deepEqual([c.port, c.dbName, c.walletUrl, c.catalogUrl, c.identityUrl, c.engagementUrl], [4070, 'orders', 'http://w', 'http://c', 'http://i', 'http://e']);
    assert.deepEqual([c.allowedIssuers, c.walletTimeoutMs, c.sweepEveryMs, c.intentMinAgeMs, c.intentGraceMs, c.intentRetentionDays, c.pruneEveryMs], [['mobile-bff', 'admin-bff', 'catalog', 'identity'], 5000, 5000, 10000, 120000, 30, 3600000]);
    assert.ok(Object.isFrozen(c));
    for (const k of ['INTERNAL_JWT_SECRET', 'WALLET_URL', 'CATALOG_URL', 'IDENTITY_URL', 'ENGAGEMENT_URL']) {
      const { [k]: _gone, ...rest } = base;
      assert.throws(() => loadConfig(rest), new RegExp(k), `${k} is required`);
    }
    assert.throws(() => loadConfig({ ...base, INTERNAL_JWT_SECRET: 'short' }), /16 characters/);
    assert.equal(loadConfig({ ...base, INTENT_RETENTION_DAYS: '0' }).intentRetentionDays, 30, 'a nonsense retention falls back to the default, never to "delete everything"');
    assert.equal(loadConfig({ ...base, INTENT_RETENTION_DAYS: '7' }).intentRetentionDays, 7);
    assert.equal(loadConfig({ ...base, SWEEP_EVERY_MS: '0' }).sweepEveryMs, 0);
  });

  test('.env.example lists exactly the variables config.js reads', () => {
    const cfg = readFileSync(here('./config.js'), 'utf8');
    const read = new Set([...cfg.matchAll(/name: '([A-Z_]+)'/g)].map((m) => m[1]).concat(['NODE_ENV', 'RENDER_GIT_COMMIT', 'GIT_COMMIT']));
    const example = new Set(readFileSync(here('../.env.example'), 'utf8').split('\n').map((l) => /^([A-Z_]+)=/.exec(l)?.[1]).filter(Boolean));
    assert.deepEqual([...read].sort(), [...example].sort());
  });

  test('config.js is the only file that reads the environment', async () => {
    const { readdirSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
    const offenders = walk(here('.')).filter((f) => /\.(js|mjs)$/.test(f) && !f.endsWith('config.js') && !f.endsWith('.test.mjs') && !/test-kit|-stub\.mjs$/.test(f) && /process\.env/.test(readFileSync(f, 'utf8')));
    assert.deepEqual(offenders, []);
  });
});
