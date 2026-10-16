// Needs a local mongod (TEST_MONGODB_URI). NO real network: every upstream call goes to a stub fetch.
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import { boot } from '../../test-kit.mjs';
import { Temple } from '../../models.js';
import { BUCKETS, bucketFor, cell, haversine, parseParams, snap } from './places.geo.js';
import { buildQuery, normalise } from './places.overpass.js';
import { PlaceCache } from './places.model.js';
import { createPlacesService } from './places.service.js';
import { clientIdOf } from './places.routes.js';
import { loadConfig } from '../../config.js';

const URLS = ['http://a.test/api/interpreter', 'http://b.test/api/interpreter'];
const baseEnv = { INTERNAL_JWT_SECRET: 'test-secret-test-secret-1234', ENGAGEMENT_URL: 'http://127.0.0.1:1', OVERPASS_URLS: URLS.join(','), PLACES_UPSTREAM_PER_SEC: '1000' };
const cfg = (extra = {}) => loadConfig({ ...baseEnv, ...extra });
const logger = { info() {}, warn() {}, error() {} };

const node = (id, lat, lon, tags = {}) => ({ type: 'node', id, lat, lon, tags: { amenity: 'place_of_worship', religion: 'hindu', ...tags } });
const way = (id, lat, lon, tags = {}) => ({ type: 'way', id, center: { lat, lon }, nodes: [1, 2, 3], tags: { amenity: 'place_of_worship', religion: 'hindu', ...tags } });
const relation = (id, lat, lon, tags = {}) => ({ type: 'relation', id, center: { lat, lon }, members: [], tags: { amenity: 'place_of_worship', religion: 'hindu', ...tags } });

/** A scripted fetch: `handler(url, init, n)` -> { status?, body?, headers?, delayMs?, throws? }. Records every call. */
function stubFetch(handler) {
  const f = async (url, init) => {
    f.calls.push({ url, init, query: new URLSearchParams(init.body).get('data') });
    const r = (await handler(url, init, f.calls.length)) ?? {};
    if (r.delayMs) await new Promise((ok) => setTimeout(ok, r.delayMs));
    if (r.hang) await new Promise((_, no) => init.signal.addEventListener('abort', () => no(new Error('aborted'))));
    if (r.throws) throw new Error(r.throws);
    const status = r.status ?? 200;
    const text = typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? { elements: [] });
    return { ok: status >= 200 && status < 300, status, headers: new Map(Object.entries(r.headers ?? {})), text: async () => text };
  };
  f.calls = [];
  return f;
}
const ok = (...elements) => ({ body: { elements } });

// Mumbai-ish. 19.0176, 72.8561 snaps to 19.00 / 72.85.
const P = { lat: '19.0176', lng: '72.8561' };

let h;
const net = stubFetch(() => ok(node(1, 19.0176, 72.8561, { name: 'Shri Ram Mandir', 'name:hi': 'श्री राम मंदिर' })));
// One app for the file (mongoose has one connection): the route tests below reach the real catalog app, with a 5/minute limit.
before(async () => { h = await boot('places_tests', { fetchImpl: net, extra: { OVERPASS_URLS: URLS.join(','), PLACES_UPSTREAM_PER_SEC: '1000', PLACES_RATE_PER_MIN: '5' } }); });
after(async () => { await h.stop(); });
beforeEach(async () => { await PlaceCache.deleteMany({}); await Temple.deleteMany({}); });

describe('parameters', () => {
  const bad = (q) => assert.throws(() => parseParams(q), (e) => e.status === 400 && e.code === 'bad_params');

  test('validation matrix', () => {
    for (const q of [
      {}, { lat: '19' }, { lng: '72' }, { lat: '', lng: '72' }, { lat: 'abc', lng: '72' }, { lat: '19', lng: 'NaN' }, { lat: 'Infinity', lng: '72' },
      { lat: '1e1', lng: '72' }, { lat: '0x10', lng: '72' }, { lat: ['19', '20'], lng: '72' }, { lat: { a: 1 }, lng: '72' }, { lat: '91', lng: '72' },
      { lat: '-90.0001', lng: '72' }, { lat: '19', lng: '180.5' }, { lat: '19', lng: '-181' }, { lat: '19', lng: '72', radius: 'big' }, { lat: '19', lng: '72', radius: '5km' },
      { lat: '19', lng: '72', radius: ['1', '2'] }, { lat: '19 ', lng: '72;drop' },
    ]) bad(q);
  });

  test('good values, boundaries, default and clamped radius', () => {
    assert.deepEqual(parseParams({ lat: '19.0176', lng: '72.8561' }), { lat: 19.0176, lng: 72.8561, radius: 8000 });
    assert.deepEqual(parseParams({ lat: '90', lng: '-180', radius: '1' }), { lat: 90, lng: -180, radius: 500 });
    assert.equal(parseParams({ lat: '-90', lng: '180', radius: '999999' }).radius, 25000);
    assert.equal(parseParams({ lat: '1', lng: '1', radius: '3000.4' }).radius, 3000);
    assert.equal(parseParams({ lat: '1', lng: '1', radius: '' }).radius, 8000);
    assert.equal(parseParams({ lat: ' 12 ', lng: '-7.5' }).lat, 12);
  });

  test('grid snapping and radius buckets', () => {
    assert.equal(snap(19.0176), 19);
    assert.equal(snap(72.8561), 72.85);
    assert.equal(snap(19.0251), 19.05);
    assert.equal(snap(-33.8688), -33.85);
    assert.equal(snap(0.024), 0);
    assert.deepEqual([500, 2000, 2001, 5000, 5001, 10000, 10001, 20000, 20001, 25000].map(bucketFor), [2000, 2000, 5000, 5000, 10000, 10000, 20000, 20000, 25000, 25000]);
    assert.deepEqual(BUCKETS, [2000, 5000, 10000, 20000, 25000]);
    assert.equal(cell(19.0176, 72.8561, 8000).key, '19.00:72.85:10000');
    assert.equal(cell(19.0176, 72.8561, 8000).key, cell(19.02, 72.87, 9000).key, 'two nearby requests share one row');
    assert.notEqual(cell(19.0176, 72.8561, 8000).key, cell(19.0176, 72.8561, 12000).key);
  });

  test('the Overpass query: three element kinds, hindu place of worship, centre output, radius + snap margin', () => {
    const q = buildQuery({ lat: 19, lng: 72.85, radius: 10000 }, 20);
    assert.match(q, /^\[out:json\]\[timeout:20\];/);
    for (const k of ['node', 'way', 'relation']) assert.match(q, new RegExp(`${k}\\["amenity"="place_of_worship"\\]\\["religion"="hindu"\\]\\(around:14000,19.00000,72.85000\\)`));
    assert.match(q, /out center tags;$/);
  });
});

describe('normaliser', () => {
  test('node, way and relation fixtures; ways/relations use their centre', () => {
    const out = normalise([
      node(123456, 19.0, 72.8, { name: 'Shri Ram Mandir', 'name:hi': 'श्री राम मंदिर', 'addr:suburb': 'Prabhadevi', 'addr:city': 'Mumbai', deity: 'rama' }),
      way(77, 19.1, 72.9, { name: 'Siddhivinayak Temple', 'addr:housenumber': '12', 'addr:street': 'S K Bole Marg', 'addr:city': 'Mumbai', deity: 'ganesha;parvati' }),
      relation(9, 19.2, 73.0, { name: 'Mahalaxmi', is_in: 'Mumbai, Maharashtra, India', denomination: 'shaktism' }),
    ]);
    assert.deepEqual(out[0], { id: 'osm:node/123456', name: 'Shri Ram Mandir', nameHi: 'श्री राम मंदिर', lat: 19, lng: 72.8, address: 'Prabhadevi, Mumbai', deity: 'Rama' });
    assert.deepEqual(out[1], { id: 'osm:way/77', name: 'Siddhivinayak Temple', nameHi: null, lat: 19.1, lng: 72.9, address: '12 S K Bole Marg, Mumbai', deity: 'Ganesha, Parvati' });
    assert.deepEqual(out[2], { id: 'osm:relation/9', name: 'Mahalaxmi', nameHi: null, lat: 19.2, lng: 73, address: 'Mumbai, Maharashtra, India', deity: 'Shaktism' });
  });

  test('name fallback order is name, name:hi, name:en; a Devanagari name doubles as nameHi; nothing invented', () => {
    const [a, b, c, d] = normalise([
      node(1, 1, 1, { name: 'Plain', 'name:hi': 'सादा', 'name:en': 'Plain EN' }),
      node(2, 1, 1, { 'name:hi': 'हनुमान मंदिर', 'name:en': 'Hanuman Mandir' }),
      node(3, 1, 1, { 'name:en': 'Only English' }),
      node(4, 1, 1, { name: 'शिव मंदिर' }),
    ]);
    assert.deepEqual([a.name, a.nameHi], ['Plain', 'सादा']);
    assert.deepEqual([b.name, b.nameHi], ['हनुमान मंदिर', 'हनुमान मंदिर']);
    assert.deepEqual([c.name, c.nameHi, c.address, c.deity], ['Only English', null, null, null]);
    assert.deepEqual([d.name, d.nameHi], ['शिव मंदिर', 'शिव मंदिर']);
  });

  test('deity from deity, deity:en, deity:<other>; never "hindu", never wikidata', () => {
    const o = normalise([
      node(1, 1, 1, { name: 'a', deity: 'shiva' }),
      node(2, 1, 1, { name: 'b', 'deity:hi': 'हनुमान' }),
      node(3, 1, 1, { name: 'c', 'deity:wikidata': 'Q1' }),
      node(4, 1, 1, { name: 'd', denomination: 'hindu' }),
    ]);
    assert.deepEqual(o.map((x) => x.deity), ['Shiva', 'हनुमान', null, null]);
  });

  test('unnamed, malformed, untagged and coordinate-less elements are skipped; duplicates collapse', () => {
    const out = normalise([
      node(1, 1, 1, {}), node(2, 1, 1, { name: '   ' }), null, 'x', 42, {}, { type: 'node' },
      { type: 'node', id: 3, lat: 'north', lon: 1, tags: { name: 'bad lat' } },
      { type: 'node', id: 4, lat: 95, lon: 1, tags: { name: 'out of range' } },
      { type: 'way', id: 5, tags: { name: 'way without centre' } },
      { type: 'tower', id: 6, lat: 1, lon: 1, tags: { name: 'wrong kind' } },
      { type: 'node', id: 'abc', lat: 1, lon: 1, tags: { name: 'bad id' } },
      { type: 'node', id: 7, lat: 1, lon: 1, tags: 'nope' },
      node(8, 2, 2, { name: 'Good' }), node(8, 2, 2, { name: 'Good again' }),
    ]);
    assert.deepEqual(out.map((x) => x.id), ['osm:node/8']);
    assert.deepEqual(normalise(undefined), []);
    assert.deepEqual(normalise({ not: 'an array' }), []);
  });
});

describe('service: cache, expiry, stale', () => {
  const mk = (fetchImpl, over = {}, config = cfg()) => {
    const clock = { t: Date.UTC(2026, 9, 1) };
    const svc = createPlacesService(config, { fetchImpl, now: () => clock.t, sleep: async () => {}, logger, ...over });
    return { svc, clock };
  };
  const ELS = ok(node(1, 19.0176, 72.8561, { name: 'Near' }), node(2, 19.03, 72.88, { name: 'Further' }), node(3, 19.2, 72.95, { name: 'Far away' }));

  test('miss -> one upstream call; hit -> none; response is sorted from the REQUESTED point, filtered by radius, with attribution', async () => {
    const f = stubFetch(() => ELS);
    const { svc } = mk(f);
    const r1 = await svc.temples({ ...P, radius: '5000' });
    assert.equal(f.calls.length, 1);
    assert.equal(r1.cachedAt, null);
    assert.equal(r1.stale, false);
    assert.deepEqual(r1.temples.map((t) => t.name), ['Near', 'Further']);
    assert.deepEqual(r1.temples[0], { id: 'osm:node/1', name: 'Near', nameHi: null, lat: 19.0176, lng: 72.8561, address: null, deity: null, distanceM: 0 });
    assert.ok(r1.temples[1].distanceM > 0 && r1.temples[1].distanceM <= 5000);
    assert.deepEqual(r1.center, { lat: 19.0176, lng: 72.8561, radius: 5000 });
    assert.equal(r1.attribution, '© OpenStreetMap contributors');
    assert.equal(r1.source, 'openstreetmap');
    assert.equal(f.calls[0].url, URLS[0]);
    assert.equal(f.calls[0].init.headers['user-agent'], 'BhaktiApp/1.0 (temples map)');
    assert.match(f.calls[0].query, /around:9000,19.00000,72.85000/, 'bucket 5000 + snap margin');

    const r2 = await svc.temples({ ...P, radius: '5000' });
    assert.equal(f.calls.length, 1, 'fresh cache: no upstream call');
    assert.equal(r2.stale, false);
    assert.equal(typeof r2.cachedAt, 'string');
    assert.deepEqual(r2.temples, r1.temples);

    // a different point in the same cell and bucket, and a smaller radius, are answered from the same row
    const r3 = await svc.temples({ lat: '19.02', lng: '72.87', radius: '3000' });
    assert.equal(f.calls.length, 1);
    assert.ok(r3.temples.every((t) => t.distanceM <= 3000));
    // a different bucket is a different row
    await svc.temples({ ...P, radius: '9000' });
    assert.equal(f.calls.length, 2);
    assert.equal(await PlaceCache.countDocuments(), 2);
  });

  test('radius filter uses the requested radius; the far temple appears in a bigger one', async () => {
    const { svc } = mk(stubFetch(() => ELS));
    assert.equal((await svc.temples({ ...P, radius: '2000' })).temples.length, 1);
    assert.equal((await svc.temples({ ...P, radius: '25000' })).temples.length, 3);
  });

  test('expiry: an expired row triggers a refresh; 7 days is the default and PLACES_CACHE_DAYS changes it', async () => {
    const f = stubFetch(() => ELS);
    const { svc, clock } = mk(f);
    await svc.temples(P);
    clock.t += 7 * 86_400_000 - 1000;
    await svc.temples(P);
    assert.equal(f.calls.length, 1, 'still fresh just before 7 days');
    clock.t += 2000;
    const r = await svc.temples(P);
    assert.equal(f.calls.length, 2, 'refreshed after 7 days');
    assert.equal(r.stale, false);

    await PlaceCache.deleteMany({});
    const g = stubFetch(() => ELS);
    const m = mk(g, {}, cfg({ PLACES_CACHE_DAYS: '1' }));
    await m.svc.temples(P);
    m.clock.t += 86_400_000 + 1;
    await m.svc.temples(P);
    assert.equal(g.calls.length, 2);
  });

  test('the TTL index purges later than expiry, so an expired row survives for stale-while-error', async () => {
    const idx = await PlaceCache.collection.indexes();
    assert.equal(idx.find((i) => i.key.purgeAt)?.expireAfterSeconds, 0);
    const f = stubFetch(() => ELS);
    const { svc } = mk(f);
    await svc.temples(P);
    const row = await PlaceCache.findOne().lean();
    assert.equal(row.expiresAt - row.fetchedAt, 7 * 86_400_000);
    assert.equal(row.purgeAt - row.expiresAt, 30 * 86_400_000);
    assert.equal(row.places.length, 3);
  });

  test('stale-while-error: every instance down + an expired row = the row with stale:true; nothing cached = 503 places_unavailable', async () => {
    let down = false;
    const f = stubFetch(() => (down ? { status: 503 } : ELS));
    const { svc, clock } = mk(f);
    await svc.temples(P);
    down = true;
    clock.t += 8 * 86_400_000;
    const r = await svc.temples(P);
    assert.equal(r.stale, true);
    assert.ok(r.temples.length > 0);
    assert.equal(typeof r.cachedAt, 'string');

    down = true;
    await assert.rejects(() => svc.temples({ lat: '12.9', lng: '77.6' }), (e) => e.status === 503 && e.code === 'places_unavailable');
  });

  test('a 200 with a runtime-error remark is not cached and counts as a failure', async () => {
    const f = stubFetch(() => ({ body: { elements: [node(1, 19, 72.85, { name: 'x' })], remark: 'runtime error: Query timed out in "query" at line 3' } }));
    const { svc } = mk(f);
    await assert.rejects(() => svc.temples(P), (e) => e.code === 'places_unavailable');
    assert.equal(await PlaceCache.countDocuments(), 0);
  });

  test('an empty area is an empty list (and is cached)', async () => {
    const f = stubFetch(() => ok());
    const { svc } = mk(f);
    const r = await svc.temples(P);
    assert.deepEqual(r.temples, []);
    await svc.temples(P);
    assert.equal(f.calls.length, 1);
  });
});

describe('service: single-flight', () => {
  test('N parallel requests for one cell = ONE upstream call', async () => {
    const f = stubFetch(() => ({ ...ok(node(1, 19.0176, 72.8561, { name: 'Near' })), delayMs: 60 }));
    const svc = createPlacesService(cfg({ PLACES_RATE_PER_MIN: '1000' }), { fetchImpl: f, logger });
    const rs = await Promise.all(Array.from({ length: 12 }, () => svc.temples(P)));
    assert.equal(f.calls.length, 1);
    assert.ok(rs.every((r) => r.temples.length === 1));
    // and a failure is shared too, then forgotten (the next request tries again)
    let fail = true;
    const g = stubFetch(() => (fail ? { status: 500, delayMs: 30 } : ok(node(2, 28.6, 77.2, { name: 'Y' }))));
    const s2 = createPlacesService(cfg({ PLACES_RATE_PER_MIN: '1000', PLACES_BREAKER_MS: '1' }), { fetchImpl: g, logger });
    const bad = await Promise.allSettled(Array.from({ length: 5 }, () => s2.temples({ lat: '28.6', lng: '77.2' })));
    assert.ok(bad.every((b) => b.status === 'rejected' && b.reason.status === 503));
    assert.equal(g.calls.length, 2, 'one attempt per instance, once');
    fail = false;
    await new Promise((ok2) => setTimeout(ok2, 10));
    assert.equal((await s2.temples({ lat: '28.6', lng: '77.2' })).temples.length, 1);
  });

  test('different cells are not coalesced', async () => {
    const f = stubFetch(() => ({ ...ok(), delayMs: 20 }));
    const svc = createPlacesService(cfg(), { fetchImpl: f, logger });
    await Promise.all([svc.temples(P), svc.temples({ lat: '28.6', lng: '77.2' })]);
    assert.equal(f.calls.length, 2);
  });
});

describe('service: instances, breaker, 429, limiter', () => {
  const mk = (fetchImpl, config = cfg()) => {
    const clock = { t: Date.UTC(2026, 9, 1) };
    return { clock, svc: createPlacesService(config, { fetchImpl, now: () => clock.t, sleep: async () => {}, logger }) };
  };
  const at = (n) => ({ lat: String(10 + n * 0.5), lng: '77' }); // distinct cells

  test('failover: the first instance fails, the second answers; the breaker skips the first for 60 s, then retries it', async () => {
    const f = stubFetch((url) => (url === URLS[0] ? { status: 502 } : ok(node(1, 10, 77, { name: 'T' }))));
    const { svc, clock } = mk(f);
    assert.equal((await svc.temples(at(0))).stale, false);
    assert.deepEqual(f.calls.map((c) => c.url), [URLS[0], URLS[1]]);
    await svc.temples(at(1));
    assert.deepEqual(f.calls.slice(2).map((c) => c.url), [URLS[1]], 'instance 1 is skipped while its breaker is open');
    clock.t += 59_000;
    await svc.temples(at(2));
    assert.deepEqual(f.calls.slice(3).map((c) => c.url), [URLS[1]]);
    clock.t += 2000;
    await svc.temples(at(3));
    assert.deepEqual(f.calls.slice(4).map((c) => c.url), [URLS[0], URLS[1]], 'after 60 s it is tried again');
  });

  test('429 opens the breaker (Retry-After honoured when longer); network errors and timeouts fail over; both down = 503', async () => {
    const f = stubFetch((url) => (url === URLS[0] ? { status: 429, headers: { 'retry-after': '120' } } : ok(node(1, 10, 77, { name: 'T' }))));
    const { svc, clock } = mk(f);
    await svc.temples(at(0));
    clock.t += 61_000;
    await svc.temples(at(1));
    assert.equal(f.calls.filter((c) => c.url === URLS[0]).length, 1, 'Retry-After 120 s beats the 60 s default');
    clock.t += 60_000;
    await svc.temples(at(2));
    assert.equal(f.calls.filter((c) => c.url === URLS[0]).length, 2);

    await PlaceCache.deleteMany({});
    const g = stubFetch((url) => (url === URLS[0] ? { throws: 'ECONNRESET' } : { hang: true }));
    const m = mk(g, cfg({ PLACES_TIMEOUT_MS: '30', PLACES_TOTAL_MS: '2000' }));
    await assert.rejects(() => m.svc.temples(at(0)), (e) => e.status === 503 && e.code === 'places_unavailable');
    assert.equal(g.calls.length, 2);
    // both breakers are open now: no upstream call at all
    await assert.rejects(() => m.svc.temples(at(1)), (e) => e.code === 'places_unavailable');
    assert.equal(g.calls.length, 2);
  });

  test('non-JSON 200 (an HTML busy page) fails over', async () => {
    const f = stubFetch((url) => (url === URLS[0] ? { body: '<html>busy</html>' } : ok(node(1, 10, 77, { name: 'T' }))));
    const { svc } = mk(f);
    assert.equal((await svc.temples(at(0))).temples.length, 1);
  });

  test('the global limiter spaces upstream calls at 2/second', async () => {
    const sleeps = [];
    const clock = { t: 1_000_000 };
    const f = stubFetch(() => ok());
    const svc = createPlacesService(cfg({ PLACES_UPSTREAM_PER_SEC: '2', PLACES_RATE_PER_MIN: '1000' }), {
      fetchImpl: f, now: () => clock.t, sleep: async (ms) => { sleeps.push(ms); clock.t += ms; }, logger,
    });
    await Promise.all([0, 1, 2].map((n) => svc.temples(at(n))));
    assert.equal(f.calls.length, 3);
    assert.deepEqual(sleeps, [500, 500], 'the first goes at once, then one every 500 ms (the fake clock advances as it sleeps)');
    assert.equal(clock.t - 1_000_000, 1000);
  });
});

describe('service: managed temples and the per-client limit', () => {
  test('an OSM place within 150 m of a dashboard temple is dropped; 151+ m is kept; temples without a pin are ignored', async () => {
    await Temple.create([
      { slug: 'near', name: 'Managed', lat: 19.0176, lng: 72.8561 },
      { slug: 'nopin', name: 'No pin' },
      { slug: 'off', name: 'Disabled', lat: 19.0500, lng: 72.9000, enabled: false },
    ]);
    const meters = (m) => m / 111_320; // degrees of latitude
    const f = stubFetch(() => ok(
      node(1, 19.0176 + meters(120), 72.8561, { name: 'Duplicate of managed' }),
      node(2, 19.0176 + meters(190), 72.8561, { name: 'Neighbour' }),
      node(3, 19.05, 72.9, { name: 'Next to a disabled one' }),
    ));
    const svc = createPlacesService(cfg(), { fetchImpl: f, logger });
    const r = await svc.temples({ ...P, radius: '10000' });
    assert.deepEqual(r.temples.map((t) => t.name).sort(), ['Neighbour', 'Next to a disabled one']);
    // the cached row is the raw list: changing the dashboard changes the answer with no upstream call
    await Temple.deleteMany({});
    assert.equal((await svc.temples({ ...P, radius: '10000' })).temples.length, 3);
    assert.equal(f.calls.length, 1);
  });

  test('at most 80 results, nearest first, ties by id', async () => {
    const els = Array.from({ length: 120 }, (_, i) => node(i + 1, 19.0176 + i * 0.0005, 72.8561, { name: `T${i}` }));
    const svc = createPlacesService(cfg(), { fetchImpl: stubFetch(() => ok(...els)), logger });
    const r = await svc.temples({ ...P, radius: '25000' });
    assert.equal(r.temples.length, 80);
    assert.deepEqual(r.temples.slice(0, 3).map((t) => t.name), ['T0', 'T1', 'T2']);
    assert.ok(r.temples.every((t, i, a) => i === 0 || a[i - 1].distanceM <= t.distanceM));
  });

  test('30 requests a minute per client, then 429 too_fast with retryAfterSec; another client is unaffected; the window resets', async () => {
    const clock = { t: Date.UTC(2026, 9, 1) };
    const svc = createPlacesService(cfg(), { fetchImpl: stubFetch(() => ok()), now: () => clock.t, sleep: async () => {}, logger });
    for (let i = 0; i < 30; i++) await svc.temples(P, { clientId: '1.2.3.4' });
    await assert.rejects(() => svc.temples(P, { clientId: '1.2.3.4' }), (e) => e.status === 429 && e.code === 'too_fast' && e.extra.retryAfterSec >= 1);
    await svc.temples(P, { clientId: '5.6.7.8' });
    clock.t += 61_000;
    await svc.temples(P, { clientId: '1.2.3.4' });
  });

  test('a rejected (400) request does not use up the client\'s allowance', async () => {
    const svc = createPlacesService(cfg({ PLACES_RATE_PER_MIN: '2' }), { fetchImpl: stubFetch(() => ok()), logger });
    for (let i = 0; i < 5; i++) await assert.rejects(() => svc.temples({}, { clientId: 'c' }), (e) => e.status === 400);
    await svc.temples(P, { clientId: 'c' });
  });
});

describe('route (the real catalog app)', () => {
  const rh = { call: (...a) => h.call(...a) };

  test('only the mobile BFF may call it: admin-bff, monolith, no token -> refused', async () => {
    const q = `/places/temples?lat=19.0176&lng=72.8561`;
    assert.equal((await rh.call('GET', q, { iss: 'admin-bff' })).status, 403);
    assert.equal((await rh.call('GET', q, { iss: 'monolith' })).status, 403);
    assert.equal((await rh.call('GET', q, { tok: null })).status, 401);
    assert.equal(net.calls.length, 0);
  });

  test('200 with the contract shape; 400 bad_params; the client id comes from the token\'s ctx.ip', async () => {
    const { signServiceToken } = await import('@bhakti/common');
    const { SECRET } = await import('../../test-kit.mjs');
    const tok = (ip) => signServiceToken({ iss: 'mobile-bff', sub: null, ctx: ip ? { ip } : {} }, { secret: SECRET });
    assert.equal(clientIdOf({ auth: { iss: 'mobile-bff', ctx: { ip: '9.9.9.9' } } }), '9.9.9.9');
    assert.equal(clientIdOf({ auth: { iss: 'mobile-bff' } }), 'mobile-bff');

    const r = await rh.call('GET', '/places/temples?lat=19.0176&lng=72.8561&radius=3000', { tok: tok('9.9.9.9') });
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body), ['temples', 'center', 'attribution', 'source', 'cachedAt', 'stale']);
    assert.deepEqual(r.body.temples[0], { id: 'osm:node/1', name: 'Shri Ram Mandir', nameHi: 'श्री राम मंदिर', lat: 19.0176, lng: 72.8561, address: null, deity: null, distanceM: 0 });
    assert.equal(r.body.attribution, '© OpenStreetMap contributors');
    assert.equal((await rh.call('GET', '/places/temples?lat=x&lng=1', { tok: tok('9.9.9.9') })).body.code, 'bad_params');

    // 5 per minute in this app: one counted so far for 9.9.9.9 (the 400 is not), four more fit, the next is 429
    for (let i = 0; i < 4; i++) assert.equal((await rh.call('GET', '/places/temples?lat=19.0176&lng=72.8561', { tok: tok('9.9.9.9') })).status, 200);
    const limited = await rh.call('GET', '/places/temples?lat=19.0176&lng=72.8561', { tok: tok('9.9.9.9') });
    assert.deepEqual([limited.status, limited.body.code], [429, 'too_fast']);
    assert.equal((await rh.call('GET', '/places/temples?lat=19.0176&lng=72.8561', { tok: tok('8.8.8.8') })).status, 200, 'another phone is fine');
    assert.equal(net.calls.length, 2, 'two cells (radius 3000 -> bucket 5000, default 8000 -> bucket 10000), one upstream call each');
  });
});
