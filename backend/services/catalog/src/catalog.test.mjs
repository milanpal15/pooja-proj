// Service-level tests for the catalog: health/seed, auth refusals, who may call what, role rules, every public contract shape,
// the priced snapshot, media (upload rules + the Range matrix), the orders-stats and settings clients, config, the route table.
// Run: TEST_MONGODB_URI=mongodb://127.0.0.1:27211/x node --test --test-concurrency=1 src/catalog.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, mock, test } from 'node:test';

import { CATALOG_ADMIN_ROUTES, CONTENT_KEYS, permissionsFor, signServiceToken } from '@bhakti/common';
import mongoose from 'mongoose';

import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { connectDb } from './db.js';
import { startJobs } from './jobs.js';
import { createSettingsReader, FALLBACK_SETTINGS } from './lib/engagement.js';
import { createOrdersStats, STATS_TTL_MS } from './lib/orders-stats.js';
import { Aarti, ChadhavaListing, Deity, Faq, HeroSlide, HomeSection, LiveCategory, LiveStream, Offering, Pooja, Seva, Temple } from './models.js';
import { SECRET, boot, fakeDeps, testConfig, token } from './test-kit.mjs';
import { seedCatalog } from './seed.js';

const OID = '000000000000000000000000';
const DAY = 86_400_000;
const sign = (claims, o = {}) => signServiceToken(claims, { secret: SECRET, ...o });

/* ───────────────────────────────────────────────────────────────── health and seed ── */
describe('health and seeding', () => {
  let server; let url; let ready = false;
  before(async () => {
    const config = testConfig('catalog_health_tests');
    await connectDb(config);
    await mongoose.connection.dropDatabase();
    await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
    const deps = fakeDeps();
    server = http.createServer(createApp(config, { isReady: () => ready, dbPing: async () => {}, logger: { info() {}, warn() {}, error() {} }, settings: deps.settings, orders: deps.orders }));
    await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
    url = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => {
    await new Promise((ok) => server.close(ok));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  test('/health is 503 {starting:true} until seeded, then 200; needs no token; /health/deps lists mongo', async () => {
    let r = await fetch(`${url}/health`);
    assert.equal(r.status, 503);
    assert.equal((await r.json()).starting, true);
    await seedCatalog();
    ready = true;
    r = await fetch(`${url}/health`);
    assert.equal(r.status, 200);
    const deps = await (await fetch(`${url}/health/deps`)).json();
    assert.equal(deps.deps.mongo.ok, true);
  });

  test('seeds every default: 8+ deities, temples, aartis, sevas/faqs/knowledge, reminders, the Home layout, live categories, poojas, offerings', async () => {
    const counts = await Promise.all([Deity.countDocuments(), Temple.countDocuments(), Aarti.countDocuments(), Seva.countDocuments(), Faq.countDocuments(), HomeSection.countDocuments(), LiveCategory.countDocuments(), Pooja.countDocuments(), Offering.countDocuments()]);
    assert.ok(counts[0] >= 8 && counts[3] === 5 && counts[4] === 9 && counts[5] === 12 && counts[6] === 3 && counts[8] === 3, JSON.stringify(counts));
    assert.ok(counts[7] >= 1);
    // the GridFS indexes exist even though nothing was ever uploaded (a database that arrived by copy has files but no indexes)
    const idx = await mongoose.connection.db.collection('media.chunks').indexes();
    assert.ok(idx.some((i) => i.key.files_id === 1 && i.key.n === 1 && i.unique));
  });

  test('seeding twice is idempotent and never overwrites an operator\'s edit or resurrects what they deleted', async () => {
    await Deity.updateOne({ slug: 'shiva' }, { $set: { name: 'Edited' } });
    await HomeSection.deleteOne({ key: 'books' });
    await Offering.deleteOne({ key: 'prasad' });
    const before = await Promise.all([Deity.countDocuments(), HomeSection.countDocuments(), Pooja.countDocuments(), LiveCategory.countDocuments()]);
    await seedCatalog();
    await seedCatalog();
    assert.deepEqual(await Promise.all([Deity.countDocuments(), HomeSection.countDocuments(), Pooja.countDocuments(), LiveCategory.countDocuments()]), before);
    assert.equal((await Deity.findOne({ slug: 'shiva' })).name, 'Edited');
    assert.equal(await HomeSection.countDocuments({ key: 'books' }), 0, 'a deleted Home section stays deleted');
    assert.equal(await Offering.countDocuments({ key: 'prasad' }), 0, 'a deleted offering stays deleted (the catalogue is seeded only while it is EMPTY)');
  });

  test('a temple\'s legacy liveUrl becomes a stream at seed time, once', async () => {
    await Temple.create({ slug: 'seed-live', name: 'Seed Live', liveUrl: 'https://www.youtube.com/watch?v=iD7bdfmqzXE' });
    await seedCatalog();
    await seedCatalog();
    assert.equal(await LiveStream.countDocuments({ templeSlug: 'seed-live' }), 1);
    assert.equal(await Temple.countDocuments({ slug: 'seed-live', bookingEnabled: true }), 1, 'and the booking flag was backfilled');
  });
});

/* ──────────────────────────────────────────────────────────────── auth and callers ── */
describe('auth: nothing without a valid service token, and each route family has its own callers', () => {
  let h;
  before(async () => { h = await boot('catalog_auth_tests'); await seedCatalog(); });
  after(() => h.stop());

  test('no token, a malformed one, a wrong-secret one and an expired one are all 401 with a code - on every family', async () => {
    const bad = {
      none: null,
      junk: 'not-a-jwt',
      wrongSecret: signServiceToken({ iss: 'admin-bff', sub: 'x', perms: permissionsFor('admin') }, { secret: 'another-secret-1234567' }),
      expired: sign({ iss: 'admin-bff', sub: 'x', perms: permissionsFor('admin') }, { now: Date.now() - 3_600_000 }),
    };
    for (const path of ['/public/content', '/poojas', '/live', '/horoscope', '/panchang', '/chadhava/listings', '/pricing/pooja/x', '/media/6acf0a7fce86d1f7b8489916.png', '/content/deities', '/admin/poojas', '/horoscope/day/2026-01-01']) {
      for (const [name, tok] of Object.entries(bad)) {
        const r = await h.call('GET', path, { tok });
        assert.equal(r.status, 401, `${name} ${path}`);
        assert.ok(r.body.code, `${name} ${path} has a code`);
      }
    }
    assert.equal((await h.call('GET', '/live', { tok: bad.expired })).body.code, 'token_expired');
    assert.equal((await h.call('GET', '/live', { tok: bad.wrongSecret })).body.code, 'bad_signature');
    assert.equal((await h.call('GET', '/live', { tok: null })).body.code, 'missing_token');
  });

  test('an issuer that is not on the allow-list is refused even with a valid signature', async () => {
    const r = await h.call('GET', '/live', { tok: sign({ iss: 'some-other-service' }) });
    assert.deepEqual([r.status, r.body.code], [401, 'wrong_issuer']);
  });

  test('who may use what: public reads = either BFF or the monolith; operator routes = admin-bff; Jai = mobile-bff; snapshot = monolith/orders; media = the BFFs', async () => {
    const as = (iss, extra = {}) => sign({ iss, sub: iss === 'mobile-bff' ? 'dev1' : 'op', role: 'admin', perms: permissionsFor('admin'), ctx: { username: 'op' }, ...extra });
    const status = async (iss, method, path) => (await h.call(method, path, { tok: as(iss), body: method === 'GET' ? undefined : {} })).status;
    const forbidden = async (iss, method, path) => {
      const r = await h.call(method, path, { tok: as(iss), body: method === 'GET' ? undefined : {} });
      return r.status === 403 && r.body.code === 'wrong_issuer';
    };
    for (const iss of ['mobile-bff', 'admin-bff', 'monolith', 'pooja-api']) assert.equal(await status(iss, 'GET', '/poojas'), 200, `${iss} reads /poojas`);
    for (const iss of ['wallet', 'orders', 'calls', 'identity']) assert.ok(await forbidden(iss, 'GET', '/poojas'), `${iss} may not read /poojas`);
    assert.ok(await forbidden('mobile-bff', 'GET', '/content/deities'), 'a phone BFF can never act as an operator');
    assert.ok(await forbidden('mobile-bff', 'POST', '/admin/poojas'));
    assert.ok(await forbidden('monolith', 'GET', '/admin/poojas'));
    assert.equal(await status('admin-bff', 'GET', '/admin/poojas'), 200);
    assert.ok(await forbidden('admin-bff', 'POST', '/live/kashi/jai'), 'the dashboard cannot say Jai');
    assert.ok(await forbidden('monolith', 'POST', '/live/kashi/jai'));
    assert.ok(await forbidden('mobile-bff', 'GET', '/pricing/pooja/x'), 'prices are for the orders side only');
    assert.ok(await forbidden('admin-bff', 'GET', '/pricing/chadhava/x'));
    assert.equal(await status('monolith', 'GET', '/pricing/pooja/zzz'), 404, 'monolith: allowed (the slug is unknown)');
    assert.equal(await status('orders', 'GET', '/pricing/pooja/zzz'), 404);
    assert.ok(await forbidden('monolith', 'GET', '/media/6acf0a7fce86d1f7b8489916.png'));
    assert.equal(await status('mobile-bff', 'GET', '/media/6acf0a7fce86d1f7b8489916.png'), 404, 'mobile-bff: allowed (no such file)');
    assert.equal(await status('admin-bff', 'GET', '/media/6acf0a7fce86d1f7b8489916.png'), 404);
  });

  test('nothing else exists: an unknown path is a JSON 404', async () => {
    const r = await h.call('GET', '/nothing/here');
    assert.deepEqual([r.status, r.body], [404, { error: 'not found', code: 'not_found' }]);
  });
});

/* ───────────────────────────────────────────────────────────────────── role rules ── */
describe('role rules, re-checked from the signed permissions (defence in depth)', () => {
  let h;
  const as = (role) => token({ role, sub: role, perms: permissionsFor(role), ctx: { username: role } });
  before(async () => { h = await boot('catalog_roles_tests'); await seedCatalog(); });
  after(() => h.stop());
  const call = (role, method, path, body) => h.call(method, path, { tok: as(role), body });

  test('viewer reads but cannot write; editor writes content/horoscope/panchang; admin everything', async () => {
    assert.equal((await call('viewer', 'GET', '/content/deities')).status, 200);
    const v = await call('viewer', 'POST', '/content/deities', { slug: 'v1', name: 'v' });
    assert.deepEqual([v.status, v.body.code, v.body.needs], [403, 'forbidden', 'content:edit']);
    assert.equal((await call('editor', 'POST', '/content/deities', { slug: 'e1', name: 'e' })).status, 201);
    assert.equal((await call('admin', 'POST', '/content/deities', { slug: 'a1', name: 'a' })).status, 201);
    assert.equal((await call('viewer', 'PUT', '/horoscope/day/2026-01-01', { readings: [] })).body.needs, 'horoscope:edit');
    assert.equal((await call('editor', 'PUT', '/horoscope/day/2026-01-01', { readings: [] })).status, 200);
    assert.equal((await call('editor', 'POST', '/content/panchangs', { date: '2026-01-02', tithi: 'x' })).status, 201);
    assert.equal(await Deity.countDocuments({ slug: 'v1' }), 0, 'the refused write did not happen');
  });

  test('editors may change pooja and chadhava prices - the monolith enforces no money guard on catalog data, only on `settings` (engagement\'s)', async () => {
    const pk = (coins) => ({ key: 'a', persons: 1, coins });
    assert.equal((await call('editor', 'POST', '/admin/poojas', { slug: 'ed-p', title: 'P', packages: [pk(10)] })).status, 201);
    const row = await Pooja.findOne({ slug: 'ed-p' });
    assert.equal((await call('editor', 'PUT', `/admin/poojas/${row._id}`, { packages: [pk(99999)] })).status, 200);
    assert.equal((await call('viewer', 'PUT', `/admin/poojas/${row._id}`, { packages: [pk(1)] })).status, 403);
    assert.equal((await Pooja.findOne({ slug: 'ed-p' })).packages[0].coins, 99999);
  });

  test('unmapped operator paths are admin-only (fail closed): a 404 for an admin, a 403 for an editor', async () => {
    assert.equal((await call('editor', 'GET', '/admin/not-a-route')).status, 403);
    assert.equal((await call('admin', 'GET', '/admin/not-a-route')).status, 404);
  });

  test('a token with no subject or no permission list is a 401 on operator routes, not an open door', async () => {
    const noSub = sign({ iss: 'admin-bff', perms: permissionsFor('admin') });
    const noPerms = sign({ iss: 'admin-bff', sub: 'x', perms: undefined });
    assert.equal((await h.call('GET', '/content/deities', { tok: noSub })).status, 401);
    assert.equal((await h.call('GET', '/content/deities', { tok: noPerms })).status, 403, 'no permissions held');
  });
});

/* ───────────────────────────────────────────────────────────── public contract shapes ── */
describe('the public contracts (the app reads these byte for byte)', () => {
  let h;
  before(async () => { h = await boot('catalog_public_tests'); await seedCatalog(); });
  after(() => h.stop());

  test('/public/content: the keys, enabled rows only, ordered, the legacy temple liveUrl stripped, hero and home included', async () => {
    await Temple.create({ slug: 'live-t', name: 'Live T', liveUrl: 'https://www.youtube.com/watch?v=iD7bdfmqzXE', order: 99 });
    await Deity.create({ slug: 'hidden-d', name: 'H', enabled: false });
    await HeroSlide.create({ slug: 'h-on', kind: 'banner', title: 'On', enabled: true, order: 1 });
    await HeroSlide.create({ slug: 'h-off', kind: 'banner', title: 'Off', enabled: false });
    const r = await h.call('GET', '/public/content', { tok: sign({ iss: 'mobile-bff' }) });
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body), CONTENT_KEYS);
    assert.ok(!r.body.deities.some((d) => d.slug === 'hidden-d'));
    assert.ok(r.body.temples.some((t) => t.slug === 'live-t') && r.body.temples.every((t) => !('liveUrl' in t)));
    assert.ok(r.body.hero.some((s) => s.slug === 'h-on') && !r.body.hero.some((s) => s.slug === 'h-off'), 'enabled slides only');
    assert.equal(r.body.hero[0].slug, 'h-on', 'ordered');
    assert.ok(Array.isArray(r.body.home.sections) && r.body.home.sections.length >= 5);
    assert.deepEqual(r.body.festivals.map((f) => f.date), [...r.body.festivals.map((f) => f.date)].sort(), 'festivals by date');
    assert.equal('settings' in r.body, false, 'settings and the announcement are engagement\'s');
    assert.equal('announcement' in r.body, false);
  });

  test('panchang: the override for a date, or null; only filled fields travel', async () => {
    await h.call('POST', '/content/panchangs', { body: { date: '2026-03-03', tithi: 'Dashami', sunrise: '6:00 AM', note: '' } });
    const pub = (q) => h.call('GET', `/panchang${q}`, { tok: sign({ iss: 'mobile-bff' }) });
    assert.deepEqual((await pub('?date=2026-03-03')).body, { date: '2026-03-03', override: { tithi: 'Dashami', sunrise: '6:00 AM' } });
    assert.deepEqual((await pub('?date=2026-03-04')).body, { date: '2026-03-04', override: null });
    assert.match((await pub('?date=junk')).body.date, /^\d{4}-\d{2}-\d{2}$/, 'junk falls back to today');
  });

  test('horoscope: public reads the day\'s enabled readings; the day editor writes them; a blank sign is deleted', async () => {
    const put = await h.call('PUT', '/horoscope/day/2026-04-04', { body: { readings: [{ rashi: 'mesha', prediction: 'A', luckyNumber: '7' }, { rashi: 'karka', predictionHi: 'ब' }, { rashi: 'zzz', prediction: 'ignored' }] } });
    assert.deepEqual(put.body, { date: '2026-04-04', saved: 2, removed: 0 });
    const day = (await h.call('GET', '/horoscope/day/2026-04-04')).body;
    assert.equal(day.readings.length, 12);
    assert.equal(day.readings[0].prediction, 'A');
    const pub = (await h.call('GET', '/horoscope?date=2026-04-04', { tok: sign({ iss: 'admin-bff' }) })).body;
    assert.deepEqual(pub.readings.map((r) => r.rashi).sort(), ['karka', 'mesha']);
    const again = await h.call('PUT', '/horoscope/day/2026-04-04', { body: { readings: [{ rashi: 'mesha', prediction: '' }] } });
    assert.deepEqual(again.body, { date: '2026-04-04', saved: 0, removed: 1 });
    assert.equal((await h.call('GET', '/horoscope/day/nope')).status, 400);
  });

  test('chadhava offerings (the old flat catalogue): enabled rows plus the fee and minimum read from engagement settings', async () => {
    const r = (await h.call('GET', '/chadhava/offerings', { tok: sign({ iss: 'mobile-bff' }) })).body;
    assert.deepEqual(r.offerings.map((o) => o.key), ['flowers', 'prasad', 'vastram']);
    assert.deepEqual([r.serviceFee, r.minAmount], [5, 1]);
    h.deps.settingsData.chadhavaMinAmount = '3';
    assert.equal((await h.call('GET', '/chadhava/offerings', { tok: sign({ iss: 'mobile-bff' }) })).body.minAmount, 3);
  });
});

/* ───────────────────────────────────────────────────────────────── priced snapshot ── */
describe('the priced snapshot the orders side buys from', () => {
  let h;
  const orders = () => sign({ iss: 'monolith' });
  before(async () => {
    h = await boot('catalog_pricing_tests');
    await Temple.create({ slug: 'kashi', name: 'Kashi', location: 'Varanasi' });
    await Pooja.create({
      slug: 'rudra', title: 'Rudra', titleHi: 'रुद्र', templeSlug: 'kashi', place: 'Varanasi', poojaDate: '2030-01-01', bookingClosesAt: new Date('2029-12-30T00:00:00Z'),
      prasadAvailable: true, prasadFeeCoins: 99, cancelHours: 12,
      packages: [{ key: 'one', name: 'One', persons: 1, coins: 351, order: 1 }, { key: 'off', name: 'Off', persons: 2, coins: 5, enabled: false }],
    });
    await Pooja.create({ slug: 'draft', title: 'Draft', enabled: false, packages: [{ key: 'a', persons: 1, coins: 9 }] });
    await ChadhavaListing.create({ slug: 'pitru', title: 'Pitru', templeSlug: 'kashi', endsAt: new Date('2030-01-01T00:00:00Z'), offerings: [{ key: 'diya', title: 'Diya', coins: 21, order: 0 }, { key: 'gold', coins: 501, enabled: false }] });
  });
  after(() => h.stop());

  test('a pooja: everything a booking is priced and dated from, plus the temple name; disabled poojas do not exist', async () => {
    const r = await h.call('GET', '/pricing/pooja/rudra', { tok: orders() });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.pooja, {
      slug: 'rudra', title: 'Rudra', titleHi: 'रुद्र', enabled: true, templeSlug: 'kashi', place: 'Varanasi', poojaDate: '2030-01-01', publishAt: null,
      bookingClosesAt: '2029-12-30T00:00:00.000Z', cancelHours: 12, prasadAvailable: true, prasadFeeCoins: 99,
      packages: [{ key: 'one', name: 'One', nameHi: null, persons: 1, coins: 351, order: 1, enabled: true }, { key: 'off', name: 'Off', nameHi: null, persons: 2, coins: 5, order: 0, enabled: false }],
    });
    assert.deepEqual(r.body.temple, { slug: 'kashi', name: 'Kashi', location: 'Varanasi' });
    assert.ok(Math.abs(Date.parse(r.body.at) - Date.now()) < 5000);
    const d = await h.call('GET', '/pricing/pooja/draft', { tok: orders() });
    assert.deepEqual([d.status, d.body.code], [404, 'not_found']);
    assert.equal((await h.call('GET', '/pricing/pooja/nope', { tok: orders() })).status, 404);
  });

  test('a price edit is the very next answer (the snapshot is never cached here)', async () => {
    await Pooja.updateOne({ slug: 'rudra', 'packages.key': 'one' }, { $set: { 'packages.$.coins': 400 } });
    const r = await h.call('GET', '/pricing/pooja/rudra', { tok: orders() });
    assert.equal(r.body.pooja.packages[0].coins, 400);
  });

  test('a chadhava listing: offerings with their prices and enabled flags, the window, the temple name', async () => {
    const r = await h.call('GET', '/pricing/chadhava/pitru', { tok: orders() });
    assert.deepEqual(r.body.listing.offerings, [{ key: 'diya', title: 'Diya', coins: 21, order: 0, enabled: true }, { key: 'gold', title: null, coins: 501, order: 0, enabled: false }]);
    assert.deepEqual([r.body.listing.startsAt, r.body.listing.endsAt, r.body.listing.templeSlug], [null, '2030-01-01T00:00:00.000Z', 'kashi']);
    assert.deepEqual(r.body.temple, { slug: 'kashi', name: 'Kashi' });
    assert.equal((await h.call('GET', '/pricing/chadhava/nope', { tok: orders() })).status, 404);
  });

  test('existence (for the reviews route): published and enabled only', async () => {
    assert.equal((await h.call('GET', '/pricing/pooja/rudra/exists', { tok: orders() })).body.exists, true);
    assert.equal((await h.call('GET', '/pricing/pooja/draft/exists', { tok: orders() })).body.exists, false);
    assert.equal((await h.call('GET', '/pricing/pooja/nope/exists', { tok: orders() })).body.exists, false);
    await Pooja.updateOne({ slug: 'rudra' }, { $set: { publishAt: new Date(Date.now() + DAY) } });
    assert.equal((await h.call('GET', '/pricing/pooja/rudra/exists', { tok: orders() })).body.exists, false, 'not published yet');
  });
});

/* ─────────────────────────────────────────────────────────────────────────── media ── */
describe('media: upload rules and the Range matrix', () => {
  let h; let dir;
  const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(300_000, 3)]); // >1 GridFS chunk
  const up = (name, bytes = PNG, type = 'text/html', tok = token()) => {
    const f = new FormData();
    f.append('file', new Blob([bytes], { type }), name);
    return fetch(`${h.url}/internal/catalog/content/upload`, { method: 'POST', headers: { authorization: `Bearer ${tok}` }, body: f });
  };
  const media = (id, headers = {}, method = 'GET') => fetch(`${h.url}/internal/catalog/media/${id}`, { method, headers: { authorization: `Bearer ${sign({ iss: 'mobile-bff' })}`, ...headers } });
  let file; let id;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'catalog-legacy-'));
    writeFileSync(join(dir, 'old.txt'), 'legacy bytes');
    h = await boot('catalog_media_tests', { extra: { MAX_UPLOAD_MB: '1', UPLOAD_DIR: dir } });
    const r = await up('pic.png');
    file = (await r.json()).url;
    id = file.replace('/uploads/', '');
  });
  after(() => h.stop());

  test('upload: host-relative /uploads/<id>.<ext>; the stored type comes from the EXTENSION, never from what the browser claimed', async () => {
    assert.match(file, /^\/uploads\/[0-9a-f]{24}\.png$/);
    const r = await media(id);
    assert.equal(r.headers.get('content-type'), 'image/png');
    const jpg = await (await up('a.JPG', Buffer.from('x'), 'text/html')).json();
    assert.equal((await media(jpg.url.replace('/uploads/', ''))).headers.get('content-type'), 'image/jpeg');
    const html = await (await up('evil.png', Buffer.from('<script>1</script>'), 'text/html')).json();
    assert.equal((await media(html.url.replace('/uploads/', ''))).headers.get('content-type'), 'image/png');
  });

  test('upload refusals: svg/html/exe 415, no file 400, over the limit 413 with the size in the sentence, a bad token 401, a viewer 403', async () => {
    for (const name of ['x.svg', 'x.html', 'x.exe', 'noext']) {
      const r = await up(name, Buffer.from('x'));
      assert.equal(r.status, 415, name);
      assert.match((await r.json()).error, /not allowed/);
    }
    const none = await fetch(`${h.url}/internal/catalog/content/upload`, { method: 'POST', headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json' }, body: '{}' });
    assert.equal(none.status, 400);
    const big = await up('big.png', Buffer.alloc(1024 * 1024 + 10, 1));
    assert.deepEqual([big.status, (await big.json()).error], [413, 'File is larger than 1MB.']);
    assert.equal((await up('a.png', Buffer.from('x'), 'image/png', 'junk')).status, 401);
    assert.equal((await up('a.png', Buffer.from('x'), 'image/png', token({ role: 'viewer', perms: permissionsFor('viewer') }))).status, 403);
  });

  test('every allowed audio/image extension is accepted', async () => {
    for (const ext of ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'mp3', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'flac', 'mp4']) {
      const r = await up(`f.${ext}`, Buffer.from('x'));
      assert.equal(r.status, 200, ext);
    }
  });

  test('the headers: immutable cache, ETag = the id, Accept-Ranges, nosniff and CSP sandbox - also on a 404', async () => {
    const r = await media(id);
    assert.deepEqual(
      ['cache-control', 'etag', 'accept-ranges', 'x-content-type-options', 'content-security-policy', 'content-length'].map((k) => r.headers.get(k)),
      ['public, max-age=31536000, immutable', `"${id.split('.')[0]}"`, 'bytes', 'nosniff', 'sandbox', String(PNG.length)],
    );
    assert.ok(Buffer.from(await r.arrayBuffer()).equals(PNG));
    const nf = await media('000000000000000000000000.png');
    assert.equal(nf.status, 404);
    assert.equal(nf.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(nf.headers.get('content-security-policy'), 'sandbox');
  });

  test('Range matrix: 100-199, suffix, open-ended, 0-0, clamped end -> 206 with the exact bytes; unsatisfiable / malformed / multi -> 416 bytes */size', async () => {
    const slice = async (range) => {
      const r = await media(id, { range });
      return { status: r.status, cr: r.headers.get('content-range'), cl: r.headers.get('content-length'), body: Buffer.from(await r.arrayBuffer()) };
    };
    const n = PNG.length;
    let r = await slice('bytes=100-199');
    assert.deepEqual([r.status, r.cr, r.cl], [206, `bytes 100-199/${n}`, '100']);
    assert.ok(r.body.equals(PNG.subarray(100, 200)));
    r = await slice('bytes=-500');
    assert.deepEqual([r.status, r.cr], [206, `bytes ${n - 500}-${n - 1}/${n}`]);
    assert.ok(r.body.equals(PNG.subarray(n - 500)));
    r = await slice(`bytes=${n - 10}-`);
    assert.ok(r.body.equals(PNG.subarray(n - 10)));
    r = await slice('bytes=0-0');
    assert.deepEqual([r.status, r.body.length], [206, 1]);
    r = await slice(`bytes=${n - 5}-999999999`);
    assert.deepEqual([r.status, r.cr], [206, `bytes ${n - 5}-${n - 1}/${n}`]);
    r = await slice('bytes=262140-262150'); // straddles the 255 KB chunk boundary
    assert.ok(r.body.equals(PNG.subarray(262140, 262151)));
    for (const bad of ['bytes=999999999-', 'bytes=abc', 'bytes=0-1,5-9', 'bytes=5-2', 'items=0-1']) {
      r = await slice(bad);
      assert.deepEqual([r.status, r.cr], [416, `bytes */${n}`], bad);
    }
  });

  test('conditional + HEAD: a matching ETag is 304 with no body; HEAD has the headers and no body (also with a Range)', async () => {
    const etag = `"${id.split('.')[0]}"`;
    const hit = await media(id, { 'if-none-match': etag });
    assert.equal(hit.status, 304);
    assert.equal((await hit.arrayBuffer()).byteLength, 0);
    assert.equal((await media(id, { 'if-none-match': '"other"' })).status, 200);
    const head = await media(id, {}, 'HEAD');
    assert.deepEqual([head.status, head.headers.get('content-length'), (await head.arrayBuffer()).byteLength], [200, String(PNG.length), 0]);
    const hr = await media(id, { range: 'bytes=10-19' }, 'HEAD');
    assert.deepEqual([hr.status, hr.headers.get('content-range')], [206, `bytes 10-19/${PNG.length}`]);
  });

  test('unknown id, not an id, a traversal attempt -> 404 JSON; a file from before GridFS is served from UPLOAD_DIR but nothing outside it', async () => {
    for (const f of ['000000000000000000000000.png', 'nothing.png', '..%2F..%2Fetc%2Fpasswd', '%2e%2e']) assert.equal((await media(f)).status, 404, f);
    const legacy = await media('old.txt');
    assert.equal(legacy.status, 200);
    assert.equal(await legacy.text(), 'legacy bytes');
    assert.equal((await media('..%2Fold.txt')).status, 404);
  });

  test('the orphan-delete route removes a file by its URL (twice is not an error); it is an operator write (viewer 403)', async () => {
    const x = (await (await up('gone.png', Buffer.from('bye'))).json()).url;
    const del = (tok = token()) => h.call('DELETE', '/content/upload', { tok, body: { url: x } });
    assert.equal((await media(x.replace('/uploads/', ''))).status, 200);
    assert.equal((await del(token({ role: 'viewer', perms: permissionsFor('viewer') }))).status, 403);
    assert.deepEqual((await del()).body, { ok: true });
    assert.equal((await media(x.replace('/uploads/', ''))).status, 404);
    assert.deepEqual((await del()).body, { ok: false });
    assert.equal((await h.call('DELETE', '/content/upload', { body: {} })).status, 400);
  });

  test('a long file really is chunked in GridFS (more than one chunk) and the bucket is named `media`', async () => {
    const chunks = await mongoose.connection.db.collection('media.chunks').countDocuments({ files_id: new mongoose.Types.ObjectId(id.split('.')[0]) });
    assert.ok(chunks >= 2, `chunks ${chunks}`);
  });
});

/* ───────────────────────────────────────────────── the orders-stats and settings clients ── */
describe('the orders-stats client degrades to absent, never to an error', () => {
  const cfg = (extra) => testConfig('unused', { ORDERS_URL: 'http://orders.test', ...extra });
  const jsonRes = (body, status = 200) => ({ status, text: async () => JSON.stringify(body) });

  test('unset: count 0, no rating, no network', async () => {
    const s = createOrdersStats(testConfig('unused'));
    assert.deepEqual(await s.forSlug('x'), { bookingCount: 0, rating: null });
    assert.equal((await s.all()).size, 0);
  });

  test('asks GET /internal/orders/pooja-stats with a catalog-issued token; caches 30 s; concurrent callers share one request', async () => {
    let calls = 0; let seen;
    const fetchImpl = async (url, init) => { calls++; seen = { url, auth: init.headers.authorization }; return jsonRes({ stats: { p1: { bookingCount: 3, rating: { avg: 4.5, count: 2 } } } }); };
    const s = createOrdersStats(cfg(), { fetchImpl });
    const [a, b] = await Promise.all([s.forSlug('p1'), s.forSlug('p1')]);
    assert.deepEqual(a, { bookingCount: 3, rating: { avg: 4.5, count: 2 } });
    assert.deepEqual(b, a);
    assert.equal(calls, 1);
    assert.equal(seen.url, 'http://orders.test/internal/orders/pooja-stats');
    assert.equal(JSON.parse(Buffer.from(seen.auth.split('.')[1], 'base64url')).iss, 'catalog');
    assert.deepEqual(await s.forSlug('unknown'), { bookingCount: 0, rating: null });
    assert.equal(calls, 1, 'cached');
    const t0 = Date.now();
    const m = mock.method(Date, 'now', () => t0 + STATS_TTL_MS + 1);
    await s.forSlug('p1');
    assert.equal(calls, 2, 'refreshed after 30 s');
    m.mock.restore();
  });

  test('failure (down, 500, 401, garbage): absent - and the stale numbers are NOT kept', async () => {
    let mode = 'ok';
    const fetchImpl = async () => {
      if (mode === 'down') throw new Error('ECONNREFUSED');
      if (mode === '500') return jsonRes({ error: 'x' }, 500);
      if (mode === '401') return jsonRes({ error: 'x' }, 401);
      return jsonRes({ stats: { p1: { bookingCount: 3, rating: { avg: 4, count: 1 } } } });
    };
    const s = createOrdersStats(cfg(), { fetchImpl });
    assert.equal((await s.forSlug('p1')).bookingCount, 3);
    for (const m of ['down', '500', '401']) {
      mode = m;
      s._reset();
      assert.deepEqual(await s.forSlug('p1'), { bookingCount: 0, rating: null }, m);
      assert.equal((await s.all()).size, 0);
    }
  });
});

describe('the engagement settings reader', () => {
  const cfg = () => testConfig('unused');
  const ok = (settings) => ({ status: 200, text: async () => JSON.stringify({ settings }) });

  test('reads settings/map with a catalog token, caches 15 s, types numbers', async () => {
    let calls = 0; let url;
    const r = createSettingsReader(cfg(), { fetchImpl: async (u) => { calls++; url = u; return ok({ prasadDelivery: '120', bad: 'x' }); } });
    assert.equal(await r.getNumber('prasadDelivery', 0), 120);
    assert.equal(await r.getNumber('bad', 7), 7);
    assert.equal(await r.getNumber('missing', 9), 9);
    assert.equal(calls, 1);
    assert.match(url, /\/internal\/engagement\/settings\/map$/);
  });

  test('engagement down: the last good value, then the documented defaults; a STRICT read refuses to guess', async () => {
    let down = false;
    const r = createSettingsReader(cfg(), { fetchImpl: async () => { if (down) throw new Error('down'); return ok({ prasadDelivery: '120' }); } });
    down = true;
    assert.equal(await r.getNumber('prasadDelivery', 0), 99, 'documented default while nothing was ever read');
    await assert.rejects(r.getNumber('prasadDelivery', 0, { strict: true }));
    down = false;
    r._reset();
    assert.equal(await r.getNumber('prasadDelivery', 0, { strict: true }), 120);
    down = true;
    const t0 = Date.now();
    const m = mock.method(Date, 'now', () => t0 + 60_000);
    assert.equal(await r.getNumber('prasadDelivery', 0), 120, 'stale beats a default');
    m.mock.restore();
    assert.equal(FALLBACK_SETTINGS.prasadDelivery, '99');
  });
});

/* ──────────────────────────────────────────────────────────── table + config + jobs ── */
describe('every route the admin BFF forwards exists here, and every operator route here is forwarded', () => {
  let h;
  before(async () => { h = await boot('catalog_table_tests'); });
  after(() => h.stop());

  test('table -> service: each entry is a real route (not the 404 fall-through)', async () => {
    for (const r of CATALOG_ADMIN_ROUTES) {
      const path = (r.sample ?? r.path).replace(':date', '2026-01-01');
      const res = await h.call(r.method, path, { body: r.method === 'GET' ? undefined : r.body ? { url: '/uploads/000000000000000000000000.png' } : {} });
      assert.ok(!(res.status === 404 && res.body?.code === 'not_found' && res.body?.error === 'not found'), `${r.method} ${path} is not registered in the catalog service`);
    }
  });

  test('service -> table: every operator route the catalog registers is in the BFF table (a new one needs an entry there and an area)', () => {
    // Walk the express stack of the real app.
    const config = testConfig('unused');
    const app = createApp(config, { isReady: () => true, ...fakeDeps() });
    const found = new Set();
    const walk = (stack, prefix) => {
      for (const l of stack) {
        if (l.route) for (const m of Object.keys(l.route.methods)) found.add(`${m.toUpperCase()} ${prefix}${l.route.path}`);
        else if (l.name === 'router' && l.handle.stack) {
          const src = l.regexp.source.replace(/^\^/, '').replace(/\\\/\?\(\?=\\\/\|\$\)$/, '').replace(/\\\//g, '/');
          walk(l.handle.stack, prefix + (src === '(?:)' ? '' : src));
        }
      }
    };
    walk(app._router.stack, '');
    const operator = [...found].map((s) => s.replace('/internal/catalog', '').replace(/(.)\/$/, '$1')).filter((s) => /^[A-Z]+ \/(content\/|admin\/|horoscope\/day)/.test(s));
    assert.ok(operator.length > 70, `walked ${operator.length}`);
    const table = new Set(CATALOG_ADMIN_ROUTES.map((r) => `${r.method} ${r.path.replace(/:\w+/g, ':p')}`));
    table.add('POST /content/upload'); // streamed by the BFF (media), not through the JSON router
    for (const s of operator) assert.ok(table.has(s.replace(/:\w+/g, ':p')), `${s} is not forwarded by the admin BFF`);
  });
});

describe('config', () => {
  const need = { INTERNAL_JWT_SECRET: SECRET, ENGAGEMENT_URL: 'http://e/' };
  test('the required variables, the defaults, and the parsing', () => {
    assert.throws(() => loadConfig({ ENGAGEMENT_URL: 'http://e' }), /INTERNAL_JWT_SECRET/);
    assert.throws(() => loadConfig({ INTERNAL_JWT_SECRET: SECRET }), /ENGAGEMENT_URL/);
    assert.throws(() => loadConfig({ INTERNAL_JWT_SECRET: 'short', ENGAGEMENT_URL: 'http://e' }), /16 characters/);
    const c = loadConfig(need);
    assert.deepEqual([c.port, c.dbName, c.maxUploadMb, c.probeEnabled, c.ordersUrl, c.engagementUrl, c.isProduction], [4050, 'catalog', 25, true, '', 'http://e', false]);
    assert.ok(c.allowedIssuers.includes('monolith') && c.allowedIssuers.includes('pooja-api'));
    const o = loadConfig({ ...need, PORT: '5000', DB_NAME: 'c2', MAX_UPLOAD_MB: '3', LIVE_PROBE: 'off', ORDERS_URL: 'http://o/', ALLOWED_ISSUERS: 'a, b', NODE_ENV: 'production', GIT_COMMIT: 'abc', YOUTUBE_API_KEY: ' k ' });
    assert.deepEqual([o.port, o.dbName, o.maxUploadMb, o.probeEnabled, o.ordersUrl, o.allowedIssuers, o.isProduction, o.commit, o.youtubeApiKey], [5000, 'c2', 3, false, 'http://o', ['a', 'b'], true, 'abc', 'k']);
    assert.throws(() => { o.port = 1; }, TypeError, 'frozen');
  });

  test('config.js is the only file that reads the environment', async () => {
    const { execFileSync } = await import('node:child_process');
    const { fileURLToPath } = await import('node:url');
    const out = execFileSync('grep', ['-rl', '--include=*.js', 'process\\.env', fileURLToPath(new URL('.', import.meta.url))], { encoding: 'utf8' }).split('\n').filter(Boolean);
    assert.deepEqual(out.map((p) => p.split('/src/')[1]), ['config.js']);
  });
});

describe('the background probe job is guarded', () => {
  test('LIVE_PROBE off: nothing is scheduled; on: one 60 s interval (mocked - tests never probe for real)', () => {
    const logs = [];
    const log = { info: (m) => logs.push(m) };
    const iv = mock.method(globalThis, 'setInterval', () => ({ unref() {} }));
    const to = mock.method(globalThis, 'setTimeout', () => ({ unref() {} }));
    try {
      startJobs({ probeEnabled: false }, log);
      assert.equal(iv.mock.callCount(), 0);
      assert.match(logs.at(-1), /disabled/);
      startJobs({ probeEnabled: true }, log);
      assert.equal(iv.mock.callCount(), 1);
      assert.equal(iv.mock.calls[0].arguments[1], 60_000);
    } finally {
      iv.mock.restore();
      to.mock.restore();
    }
  });

  test('nothing under test starts it: probeSoon is a no-op while the job is not running', async () => {
    const { probeSoon } = await import('./modules/live/probe.js');
    const find = mock.method(LiveStream, 'find', () => { throw new Error('probe ran'); });
    try {
      // `startJobs(enabled)` above left the (mocked) timer variable set only if startProbe really created one; it did not.
      assert.doesNotThrow(() => probeSoon());
    } finally {
      find.mock.restore();
    }
  });
});
