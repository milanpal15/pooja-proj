// Phase 3 monolith side: the catalog client, the CATALOG_URL switch, the priced-snapshot purchases (fail CLOSED), the retired
// routes, the seeds that step aside, and GET /internal/orders/pooja-stats.
// Run: TEST_MONGODB_URI=mongodb://127.0.0.1:27211/x node --test --test-concurrency=1 src/lib/catalog-client.test.mjs
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, afterEach, before, beforeEach, describe, mock, test } from 'node:test';

import express from 'express';
import mongoose from 'mongoose';

import { createApp } from '../app.js';
import { seedDefaults } from '../db/seed.js';
import { Booking, Deity, HeroSlide, HomeSection, Operator, Pooja, PoojaReview, Setting, Temple } from '../models.js';
import { ChadhavaOrder, Offering } from '../modules/chadhava/chadhava.model.js';
import { LiveCategory, LiveStream } from '../modules/live/live.model.js';
import { hashPassword } from '../modules/operators/index.js';
import { sign } from '../modules/operators/session.js';
import * as bookingsModule from '../modules/bookings/index.js';
import * as chadhavaModule from '../modules/chadhava/index.js';
import { seedModules } from '../modules/index.js';
import { boot } from '../modules/test-kit.mjs';
import * as wallet from '../modules/wallet/wallet.service.js';
import * as catalog from './catalog-client.js';
import { signServiceToken, verifyServiceToken } from './service-jwt.js';

const SECRET = 'test-secret-test-secret-1234';
const IDENTITY_MODE = Boolean(process.env.IDENTITY_MODE);
const dbUri = (n) => {
  const u = new URL(process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27211/x');
  u.pathname = `/${n}`;
  return u.toString();
};
const DAY = 86_400_000;
const day = (plus) => new Date(Date.now() + 5.5 * 3_600_000 + plus * DAY).toISOString().slice(0, 10);

/* ------------------------------------------------------------ a stand-in for the catalog service ── */
let stub;
let stubUrl;
let hits;
let mode = 'up'; // up | down (connection dropped) | broken (500) | forbidden (401)
let state;
const fresh = () => ({
  pooja: {
    slug: 'navratri', title: 'Navratri', titleHi: 'नवरात्रि', enabled: true, templeSlug: 'kashi', place: 'Varanasi', poojaDate: day(10),
    publishAt: null, bookingClosesAt: null, cancelHours: 24, prasadAvailable: true, prasadFeeCoins: 99,
    packages: [
      { key: 'individual', name: 'Individual', nameHi: null, persons: 1, coins: 551, order: 1, enabled: true },
      { key: 'family', name: 'Family', nameHi: null, persons: 4, coins: 1251, order: 4, enabled: true },
      { key: 'old', name: 'Old', nameHi: null, persons: 2, coins: 5, order: 2, enabled: false },
    ],
  },
  temple: { slug: 'kashi', name: 'Kashi Vishwanath', location: 'Varanasi' },
  listing: {
    slug: 'pitru', title: 'Pitru', titleHi: null, templeSlug: 'gaya', startsAt: null, endsAt: new Date(Date.now() + 2 * DAY).toISOString(), enabled: true,
    offerings: [{ key: 'flowers', title: 'Flowers', coins: 11, order: 1, enabled: true }, { key: 'diya', title: 'Diya', coins: 21, order: 0, enabled: true }, { key: 'gold', title: 'Gold', coins: 501, order: 2, enabled: false }],
  },
  listingTemple: { slug: 'gaya', name: 'Vishnupad' },
  exists: true,
});
const stubHandler = (req, res) => {
  hits.push({ method: req.method, url: req.url, auth: req.headers.authorization });
  req.resume();
  if (mode === 'down') return req.socket.destroy();
  const json = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (mode === 'broken') return json(500, { error: 'boom' });
  if (mode === 'forbidden') return json(401, { error: 'no', code: 'bad_signature' });
  const claims = verifyServiceToken(req.headers.authorization?.replace(/^Bearer /, ''), { secret: SECRET, issuers: ['monolith'] });
  if (!claims) return json(401, { error: 'no', code: 'bad_signature' });
  let m;
  if ((m = /^\/internal\/catalog\/pricing\/pooja\/([^/]+)\/exists$/.exec(req.url))) return json(200, { exists: state.exists && m[1] === 'navratri' });
  if ((m = /^\/internal\/catalog\/pricing\/pooja\/([^/]+)$/.exec(req.url))) return m[1] === 'navratri' ? json(200, { pooja: state.pooja, temple: state.temple, at: new Date().toISOString() }) : json(404, { error: 'That pooja is not available.', code: 'not_found' });
  if ((m = /^\/internal\/catalog\/pricing\/chadhava\/([^/]+)$/.exec(req.url))) return m[1] === 'pitru' ? json(200, { listing: state.listing, temple: state.listingTemple, at: new Date().toISOString() }) : json(404, { error: 'nf', code: 'not_found' });
  json(404, { error: 'nope' });
};

before(async () => {
  stub = http.createServer(stubHandler);
  await new Promise((ok) => stub.listen(0, '127.0.0.1', ok));
  stubUrl = `http://127.0.0.1:${stub.address().port}`;
});
after(() => new Promise((ok) => stub.close(ok)));
beforeEach(() => {
  hits = [];
  mode = 'up';
  state = fresh();
  process.env.INTERNAL_JWT_SECRET = SECRET;
  process.env.CATALOG_URL = stubUrl;
  catalog._reset();
});
afterEach(() => {
  delete process.env.CATALOG_URL;
  mock.restoreAll();
});

describe('catalog client', () => {
  test('a booking read is signed by the monolith, shaped like the lean documents, and NEVER cached', async () => {
    const a = await catalog.poojaForBooking('navratri');
    const b = await catalog.poojaForBooking('navratri');
    assert.equal(hits.length, 2, 'two purchases, two reads');
    assert.equal(verifyServiceToken(hits[0].auth.replace(/^Bearer /, ''), { secret: SECRET }).iss, 'monolith');
    assert.equal(a.pooja.packages.find((k) => k.key === 'individual').coins, 551);
    assert.equal(a.pooja.titleHi, 'नवरात्रि');
    assert.equal(a.pooja.publishAt, null);
    assert.equal(a.pooja.packages[0].nameHi, undefined, 'null text becomes absent, as on a lean document');
    assert.equal(a.temple.name, 'Kashi Vishwanath');
    assert.deepEqual(b.pooja, a.pooja);
    state.pooja.bookingClosesAt = new Date(Date.now() + DAY).toISOString();
    assert.ok((await catalog.poojaForBooking('navratri')).pooja.bookingClosesAt instanceof Date);
  });

  test('not available is null (the caller says 404); every other failure is a clear 503 catalog_unavailable', async () => {
    assert.equal(await catalog.poojaForBooking('nope'), null);
    assert.equal(await catalog.chadhavaForOrder('nope'), null);
    for (const m of ['down', 'broken', 'forbidden']) {
      mode = m;
      for (const call of [() => catalog.poojaForBooking('navratri'), () => catalog.chadhavaForOrder('pitru')]) {
        await assert.rejects(call(), (e) => e.status === 503 && e.code === 'catalog_unavailable', m);
      }
    }
  });

  test('a stale answer is never used for a purchase: the read that worked a second ago does not help once catalog is down', async () => {
    await catalog.poojaForBooking('navratri');
    mode = 'down';
    await assert.rejects(catalog.poojaForBooking('navratri'), (e) => e.status === 503);
  });

  test('the chadhava snapshot carries Date windows and the temple name', async () => {
    const x = await catalog.chadhavaForOrder('pitru');
    assert.ok(x.listing.endsAt instanceof Date);
    assert.equal(x.listing.startsAt, null);
    assert.equal(x.temple.name, 'Vishnupad');
    assert.equal(x.listing.offerings.find((o) => o.key === 'flowers').coins, 11);
  });

  test('existence (the reviews route) is cached 15 s and degrades to "assume it exists" when catalog is down', async () => {
    assert.equal(await catalog.poojaExists('navratri'), true);
    assert.equal(await catalog.poojaExists('navratri'), true);
    assert.equal(hits.length, 1, 'cached');
    assert.equal(await catalog.poojaExists('zzz'), false);
    mode = 'down';
    assert.equal(await catalog.poojaExists('other'), true, 'cannot ask: do not invent a 404');
    assert.equal(await catalog.poojaExists('navratri'), true, 'still cached');
  });

  test('catalogEnabled follows the variable', () => {
    assert.equal(catalog.catalogEnabled(), true);
    delete process.env.CATALOG_URL;
    assert.equal(catalog.catalogEnabled(), false);
  });
});

describe('purchases are priced from the catalog snapshot (fail closed)', () => {
  let h;
  const fund = (uid, n) => wallet.credit({ uid, amount: n, type: 'bonus', idempotencyKey: `fund:${uid}:${Math.random()}` });
  const names = (n) => Array.from({ length: n }, (_, i) => ({ name: `Devotee ${i + 1}`, gotra: i ? '' : 'Kashyap' }));
  const book = (uid, over = {}) => h.call('POST', '/bookings', { uid, body: { poojaSlug: 'navratri', packageKey: 'family', names: names(4), requestId: `req-${Math.random()}`, ...over } });
  const order = (uid, over = {}) => h.call('POST', '/chadhava/orders', { uid, body: { listingSlug: 'pitru', items: [{ key: 'flowers', qty: 2 }, { key: 'diya', qty: 1 }], requestId: `req-${Math.random()}`, ...over } });

  before(async () => {
    process.env.CATALOG_URL = stubUrl;
    process.env.INTERNAL_JWT_SECRET = SECRET;
    // The harness mounts one module's routers; the bookings and the chadhava devotee routers are mounted side by side.
    h = await boot({ routers: (d) => ({ devotee: express.Router().use(bookingsModule.routers(d).devotee).use(chadhavaModule.routers(d).devotee) }) }, 'catalog_purchase_tests');
    // NOTHING catalog-ish exists in this database: the pooja and the temple live only behind the stub.
    assert.equal(await Pooja.countDocuments(), 0);
    assert.equal(await Temple.countDocuments(), 0);
  });
  after(() => h.stop());

  test('a booking is priced from the snapshot; a price in the request body is ignored; temple name comes from catalog', async () => {
    await fund('c1', 5000);
    const r = await book('c1', { totalCoins: 1, price: 1, packageCoins: 1, prasad: true, address: { line1: '1 Ghat Rd', city: 'Varanasi', pincode: '221001' } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const b = r.body.booking;
    assert.deepEqual([b.packageCoins, b.prasadCoins, b.totalCoins, b.templeName, b.place, b.poojaTitleHi], [1251, 99, 1350, 'Kashi Vishwanath', 'Varanasi', 'नवरात्रि']);
    assert.equal(r.body.balance, 3650);
    assert.equal(b.cancelBy, new Date(new Date(`${day(10)}T00:00:00+05:30`).getTime() - 24 * 3_600_000).toISOString(), 'cut-off computed from the snapshot');
    assert.equal(await Pooja.countDocuments(), 0, 'it did not read the local collection');
  });

  test('an edit in catalog is the very next price (no cache in the purchase path)', async () => {
    await fund('c2', 5000);
    state.pooja.packages[1].coins = 999;
    assert.equal((await book('c2')).body.booking.totalCoins, 999);
    state.pooja.packages[1].coins = 1000;
    assert.equal((await book('c2')).body.booking.totalCoins, 1000);
  });

  test('business rules still apply to the snapshot: unknown / unpublished / closed / disabled package / prasad', async () => {
    await fund('c3', 5000);
    assert.equal((await book('c3', { poojaSlug: 'nope' })).status, 404);
    assert.equal((await book('c3', { packageKey: 'old', names: names(2) })).status, 404, 'a disabled package is not on offer');
    assert.equal((await book('c3', { packageKey: 'nope' })).status, 404);
    state.pooja.publishAt = new Date(Date.now() + DAY).toISOString();
    assert.equal((await book('c3')).status, 404, 'not published yet');
    state.pooja.publishAt = null;
    state.pooja.bookingClosesAt = new Date(Date.now() - 1000).toISOString();
    assert.equal((await book('c3')).body.code, 'booking_closed');
    state.pooja.bookingClosesAt = null;
    state.pooja.prasadAvailable = false;
    assert.equal((await book('c3', { prasad: true, address: { line1: 'x', city: 'y', pincode: '123456' } })).body.code, 'prasad_unavailable');
    assert.equal(await wallet.getBalance('c3'), 5000, 'nothing was charged for any of those');
  });

  test('catalog down: 503 catalog_unavailable (not 500), and no coin moved', async () => {
    await fund('c4', 3000);
    for (const m of ['down', 'broken', 'forbidden']) {
      mode = m;
      const r = await book('c4');
      assert.deepEqual([r.status, r.body.code], [503, 'catalog_unavailable'], m);
      const o = await order('c4');
      assert.deepEqual([o.status, o.body.code], [503, 'catalog_unavailable'], m);
    }
    assert.equal(await wallet.getBalance('c4'), 3000);
    assert.equal(await Booking.countDocuments({ uid: 'c4' }), 0);
    assert.equal(await ChadhavaOrder.countDocuments({ uid: 'c4' }), 0);
  });

  test('a retry of a request that already succeeded does not need catalog at all', async () => {
    await fund('c5', 3000);
    const requestId = `req-retry-${Math.random()}`;
    const first = await book('c5', { requestId });
    assert.equal(first.status, 201);
    mode = 'down';
    const again = await book('c5', { requestId });
    assert.equal(again.status, 200);
    assert.equal(again.body.booking.id, first.body.booking.id);
    assert.equal(await wallet.getBalance('c5'), 3000 - first.body.booking.totalCoins);
  });

  test('a chadhava order is priced from the snapshot (2 x 11 + 21), enabled offerings only, window enforced', async () => {
    await fund('c6', 500);
    const r = await order('c6', { total: 1, items: [{ key: 'flowers', qty: 2 }, { key: 'diya', qty: 1 }] });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.order.totalCoins, 43);
    assert.equal(r.body.balance, 457);
    const row = await ChadhavaOrder.findOne({ uid: 'c6' }).lean();
    assert.deepEqual([row.templeName, row.listingTitle], ['Vishnupad', 'Pitru']);
    state.listing.offerings[0].coins = 50;
    assert.equal((await order('c6', { items: [{ key: 'flowers', qty: 2 }] })).body.order.totalCoins, 100, 'the next order sees the new price');
    assert.equal((await order('c6', { items: [{ key: 'gold', qty: 1 }] })).body.code, 'invalid_items');
    assert.equal((await order('c6', { listingSlug: 'nope' })).status, 404);
    state.listing.endsAt = new Date(Date.now() - 1000).toISOString();
    assert.equal((await order('c6')).body.code, 'listing_closed');
    assert.equal((await ChadhavaOrder.findOne({ uid: 'c6', totalCoins: 100 })).cancelBy.getTime() > Date.now(), true, 'cancel-by is the listing end at order time');
  });
});

describe('the monolith app with CATALOG_URL set', { skip: IDENTITY_MODE && 'cookie sessions are phase 1; IDENTITY_URL set (phase 2) moves them to the admin BFF' }, () => {
  let server;
  let base;
  const cookies = {};
  before(async () => {
    process.env.INTERNAL_JWT_SECRET = SECRET;
    await mongoose.connect(dbUri('catalog_mode_app_tests'));
    await mongoose.connection.dropDatabase();
    await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
    for (const role of ['admin']) {
      const o = await Operator.create({ username: `${role}1`, passwordHash: hashPassword('password-123'), role });
      cookies[role] = `pooja_admin=${encodeURIComponent(sign({ uid: String(o._id), role, exp: Date.now() + 3600_000 }))}`;
    }
    server = http.createServer(createApp());
    await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => {
    await new Promise((ok) => server.close(ok));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  const req = async (method, path, { cookie, body, headers } = {}) => {
    const res = await fetch(`${base}${path}`, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* html 404 */ }
    return { status: res.status, body: json };
  };

  test('everything catalog owns answers 404 - public, app, admin and media', async () => {
    const admin = { cookie: cookies.admin };
    for (const [m, p, o] of [
      ['GET', '/api/content'], ['GET', '/api/horoscope?date=2026-01-01'], ['GET', '/api/panchang?date=2026-01-01'],
      ['GET', '/api/live'], ['GET', '/api/live/x'], ['POST', '/api/live/x/jai', { headers: { authorization: 'Bearer x' } }],
      ['GET', '/api/poojas'], ['GET', '/api/poojas/x'],
      ['GET', '/api/chadhava/offerings'], ['GET', '/api/chadhava/listings'], ['GET', '/api/chadhava/listings/x'],
      ['GET', '/uploads/6acf0a7fce86d1f7b8489916.png'],
      ...['deities', 'temples', 'aartis', 'festivals', 'sevas', 'knowledge', 'faqs', 'hero', 'reminders', 'tones', 'wallpaper-styles', 'horoscopes', 'panchangs'].map((r) => ['GET', `/api/content/${r}`, admin]),
      ['POST', '/api/content/deities', { ...admin, body: { slug: 'x', name: 'x' } }], ['PUT', '/api/content/hero/order', { ...admin, body: { ids: [] } }],
      ['POST', '/api/content/upload', admin], ['DELETE', '/api/content/upload', { ...admin, body: { url: '/uploads/x.png' } }],
      ['GET', '/api/horoscope/day/2026-01-01', admin], ['PUT', '/api/horoscope/day/2026-01-01', { ...admin, body: { readings: [] } }],
      ['GET', '/api/admin/home-sections', admin], ['GET', '/api/admin/poojas', admin], ['POST', '/api/admin/poojas/import-sevas', admin], ['GET', '/api/admin/poojas/x', admin],
      ['GET', '/api/admin/offerings', admin], ['GET', '/api/admin/chadhava-listings', admin], ['GET', '/api/admin/chadhava-categories', admin],
      ['GET', '/api/admin/live-streams', admin], ['POST', '/api/admin/live-streams/check', { ...admin, body: {} }], ['GET', '/api/admin/live-categories', admin],
    ]) {
      // With a session, so the gate lets the request through to the (absent) route; a stranger on a route that is not on PUBLIC
      // meets the gate first (401), exactly as with the retired engagement routes.
      assert.equal((await req(m, p, { cookie: cookies.admin, ...o })).status, 404, `${m} ${p}`);
    }
    for (const p of ['/api/content', '/api/horoscope', '/api/panchang', '/api/live', '/api/live/x']) assert.equal((await req('GET', p)).status, 404, `${p} (public, no session)`);
  });

  test('what the monolith KEEPS still works: reviews, the 410, orders, bookings, wallet', async () => {
    const admin = { cookie: cookies.admin };
    assert.equal((await req('GET', '/api/poojas/navratri/reviews')).status, 200);
    assert.equal((await req('GET', '/api/poojas/nope/reviews')).status, 404, 'catalog says it does not exist');
    assert.equal((await req('POST', '/api/chadhava', { body: { amount: 1 } })).status, 410);
    assert.equal((await req('GET', '/api/chadhava/orders')).status, 401);
    assert.equal((await req('GET', '/api/admin/bookings', admin)).status, 200);
    assert.equal((await req('GET', '/api/admin/reviews', admin)).status, 200);
    assert.equal((await req('GET', '/api/admin/chadhava-orders', admin)).status, 200);
    assert.equal((await req('GET', '/api/coins/packs')).status, 200);
    assert.equal((await req('GET', '/api/content/settings', admin)).status, 200, 'settings follow ENGAGEMENT_URL, not this switch');
  });

  test('the seeds step aside: no catalog collection is created here, but the settings still are (engagement unset)', async () => {
    await seedDefaults();
    await seedModules();
    for (const M of [Deity, Temple, HeroSlide, HomeSection, LiveStream, LiveCategory, Offering, Pooja]) assert.equal(await M.countDocuments(), 0, M.modelName);
    assert.ok((await Setting.countDocuments()) > 0);
  });

  test('GET /internal/orders/pooja-stats: service JWT from `catalog` only; counts live bookings; ratings from visible reviews', async () => {
    const get = (token) => fetch(`${base}/internal/orders/pooja-stats`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
    assert.equal((await get()).status, 401);
    assert.equal((await get(signServiceToken({ iss: 'admin-bff' }, { secret: SECRET }))).status, 401, 'only catalog');
    assert.equal((await get(signServiceToken({ iss: 'monolith' }, { secret: SECRET }))).status, 401);
    assert.equal((await get(signServiceToken({ iss: 'catalog' }, { secret: 'another-secret-1234567' }))).status, 401);
    const empty = await (await get(signServiceToken({ iss: 'catalog' }, { secret: SECRET }))).json();
    assert.deepEqual(empty, { stats: {} });

    const now = new Date();
    await Booking.create({ uid: 'u', bookingRef: 'BKT-AAAAA', poojaSlug: 'p1', status: 'booked' });
    await Booking.create({ uid: 'u', bookingRef: 'BKT-AAAAB', poojaSlug: 'p1', status: 'performed' });
    await Booking.create({ uid: 'u', bookingRef: 'BKT-AAAAC', poojaSlug: 'p1', status: 'cancelled' });
    await Booking.create({ uid: 'u', bookingRef: 'BKT-AAAAD', poojaSlug: 'p2', status: 'booked' });
    await PoojaReview.create([
      { bookingId: 'b1', uid: 'u', poojaSlug: 'p1', rating: 5, createdAt: now },
      { bookingId: 'b2', uid: 'u', poojaSlug: 'p1', rating: 4 },
      { bookingId: 'b3', uid: 'u', poojaSlug: 'p1', rating: 1, hidden: true },
      { bookingId: 'b4', uid: 'u', poojaSlug: 'p3', rating: 3 },
    ]);
    const r = await get(signServiceToken({ iss: 'catalog' }, { secret: SECRET }));
    assert.equal(r.status, 200);
    assert.deepEqual((await r.json()).stats, {
      p1: { bookingCount: 2, rating: { avg: 4.5, count: 2 } },
      p2: { bookingCount: 1, rating: null },
      p3: { bookingCount: 0, rating: { avg: 3, count: 1 } },
    });
    delete process.env.CATALOG_URL;
    assert.equal((await get(signServiceToken({ iss: 'catalog' }, { secret: SECRET }))).status, 404, 'not mounted without CATALOG_URL');
    process.env.CATALOG_URL = stubUrl;
  });
});

describe('CATALOG_URL unset: the monolith behaves exactly as before', { skip: IDENTITY_MODE && 'cookie sessions are phase 1; IDENTITY_URL set (phase 2) moves them to the admin BFF' }, () => {
  test('catalog data is served from its own collections and the catalog is never called', async () => {
    delete process.env.CATALOG_URL;
    await mongoose.connect(dbUri('catalog_unset_tests'));
    await mongoose.connection.dropDatabase();
    await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
    await seedDefaults();
    await seedModules();
    assert.ok((await Deity.countDocuments()) > 0 && (await Offering.countDocuments()) > 0 && (await HomeSection.countDocuments()) > 0 && (await Pooja.countDocuments()) > 0);
    const s = http.createServer(createApp());
    await new Promise((ok) => s.listen(0, '127.0.0.1', ok));
    const b = `http://127.0.0.1:${s.address().port}`;
    const get = async (p) => (await fetch(`${b}${p}`)).status;
    for (const p of ['/api/content', '/api/horoscope', '/api/panchang', '/api/live', '/api/poojas', '/api/chadhava/listings', '/api/chadhava/offerings']) assert.equal(await get(p), 200, p);
    assert.equal(await get('/api/poojas/zzz'), 404);
    assert.equal((await fetch(`${b}/internal/orders/pooja-stats`)).status, 404);
    assert.equal(hits.length, 0, 'catalog was never called');
    await new Promise((ok) => s.close(ok));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
});
