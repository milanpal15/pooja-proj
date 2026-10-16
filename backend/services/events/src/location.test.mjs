// The `location` task kind and the Yatra route (docs/EVENTS.md section 11). Needs a MongoDB.
// Run: TEST_MONGODB_URI=mongodb://127.0.0.1:27991/x node --test --test-concurrency=1 src/location.test.mjs
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, test } from 'node:test';

import { permissionsFor, signServiceToken } from '@bhakti/common';
import mongoose from 'mongoose';

import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { connectDb } from './db.js';
import { Badge, Event, EventResult, LocationPoint, MilestoneResult, TaskProgress } from './models/index.js';
import { seedEvents } from './seed.js';
import { getKind, listKinds } from './tasks/index.js';
import location from './tasks/location.js';
import { startWalletStub } from './wallet-stub.mjs';

const SECRET = 'test-secret-test-secret-1234';
const base = new URL(process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27991/x');
let clock = new Date('2026-03-10T06:00:00Z');
const at = (iso) => { clock = new Date(iso); };
const tick = (ms = 6000) => { clock = new Date(clock.getTime() + ms); };

let server; let url; let wallet;
before(async () => {
  wallet = await startWalletStub({ secret: SECRET });
  const config = loadConfig({ INTERNAL_JWT_SECRET: SECRET, MONGODB_URI: `${base.protocol}//${base.host}`, DB_NAME: 'events_location_test', WALLET_URL: wallet.url, SERVICE_TIMEOUT_MS: '400', SWEEP_EVERY_MS: '0' });
  await connectDb(config);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  await seedEvents();
  await Badge.create([{ slug: 'pilgrim', name: 'Pilgrim' }]);
  const app = createApp(config, { isReady: () => true, logger: { info() {}, warn() {}, error() {} }, catalog: { exists: async () => true }, now: () => clock });
  server = http.createServer(app);
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((ok) => { server.closeAllConnections?.(); server.close(ok); });
  await wallet.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const devotee = (uid) => ({ authorization: `Bearer ${signServiceToken({ iss: 'mobile-bff', ...(uid ? { sub: uid } : {}) }, { secret: SECRET })}` });
const operator = (role = 'admin') => ({ authorization: `Bearer ${signServiceToken({ iss: 'admin-bff', sub: 'op1', role, perms: permissionsFor(role), ctx: { username: 'tester' } }, { secret: SECRET })}` });
async function call(method, path, { headers = operator(), body } = {}) {
  const res = await fetch(`${url}/internal/events${path}`, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
const detail = (uid, slug) => call('GET', `/public/events/${slug}`, { headers: devotee(uid) });
const report = (uid, slug, m, t, body = {}) => call('POST', `/public/events/${slug}/milestones/${m}/tasks/${t}/progress`, { headers: devotee(uid), body });
const code = (r) => [r.status, r.body?.code];

/* A path along latitude 19 from 72.0E to 73.0E (~105.1 km). 0.001 deg of latitude is ~111 m. */
const PATH = [[19, 72], [19, 72.5], [19, 73]];
const ROUTE = (o = {}) => ({ start: { name: 'Start', nameHi: 'शुरू', lat: 19, lng: 72 }, end: { name: 'End', nameHi: 'अंत', lat: 19, lng: 73 }, path: PATH, mapReveal: 'all', ...o });
const stop = (key, lat, lng, o = {}) => ({
  key, title: `Stop ${key}`, titleHi: `पड़ाव ${key}`, opensAt: null, coins: 0, link: null, completion: { rule: 'all', n: null },
  tasks: [{ key: 't1', kind: 'location', title: '', titleHi: '', config: { lat, lng, radiusM: 150, name: `Place ${key}`, nameHi: `स्थान ${key}`, note: 'Darshan', ...(o.config ?? {}) } }], ...(o.ms ?? {}),
});
const body = (o = {}) => ({
  title: 'Narmada Yatra', typeSlug: 'yatra', blocks: ['schedule', 'milestones', 'route'], schedule: { mode: 'always' },
  milestones: { order: 'any', missed: 'catch_up_next', completion: { rule: 'all', n: null }, items: [stop('a', 19, 72.5), stop('b', 19, 72.9)] }, route: ROUTE(), ...o,
});
const create = (o) => call('POST', '/admin/events', { body: body(o) });
/** A published event straight into the database (bypasses validation: tests the engine alone). */
const mk = (slug, o = {}) => Event.create({
  slug, title: slug, typeSlug: 'yatra', published: true, blocks: ['schedule', 'milestones', 'route'], schedule: { mode: 'always' },
  milestones: { order: 'any', missed: 'catch_up_next', completion: { rule: 'all', n: null }, items: [] }, route: { ...ROUTE(), lengthKm: 105.1 }, ...o,
});
const cfgStop = (key, lat, lng, extra = {}) => {
  const s = stop(key, lat, lng, extra);
  return s;
};
const fix = (lat, lng, o = {}) => ({ lat, lng, accuracyM: 20, ...o });

/* ───────────────────────────────────────────────────────────────────────────────── config ── */
describe('location task config', () => {
  test('validate: normalises, defaults the radius to 150, and names every bad field', () => {
    const ok = location.validate({ lat: '19.5', lng: 72.5, name: ' Ghat ', note: 'x' });
    assert.deepEqual(ok.errors, []);
    assert.deepEqual(ok.config, { lat: 19.5, lng: 72.5, radiusM: 150, name: 'Ghat', nameHi: '', note: 'x' });
    const fields = (c) => location.validate(c).errors.map((e) => e.field).sort();
    assert.deepEqual(fields({}), ['lat', 'lng', 'name']);
    assert.deepEqual(fields({ lat: 91, lng: 181, name: 'a', radiusM: 49 }), ['lat', 'lng', 'radiusM']);
    assert.deepEqual(fields({ lat: 1, lng: 1, name: 'a', radiusM: 2001 }), ['radiusM']);
    assert.deepEqual(fields({ lat: 1, lng: 1, name: 'a'.repeat(81) }), ['name']);
    assert.deepEqual(fields({ lat: 1, lng: 1, name: 'a', nameHi: 'h'.repeat(81), note: 'n'.repeat(161) }), ['nameHi', 'note']);
    assert.equal(location.validate({ lat: 1, lng: 1, name: 'a', radiusM: 50 }).errors.length, 0);
    assert.equal(location.validate({ lat: 1, lng: 1, name: 'a', radiusM: 2000 }).errors.length, 0);
  });
  test('summary is localised', () => {
    assert.equal(location.summary({ name: 'Omkareshwar', nameHi: 'ओंकारेश्वर' }, 'en'), 'Reached Omkareshwar');
    assert.equal(location.summary({ name: 'Omkareshwar', nameHi: 'ओंकारेश्वर' }, 'hi'), 'ओंकारेश्वर पहुँचे');
    assert.equal(location.summary({ name: 'Ghat', nameHi: '' }, 'hi'), 'Ghat पहुँचे');
  });
  test('the registry lists the config schema for the dashboard', () => {
    const row = listKinds().find((k) => k.kind === 'location');
    assert.deepEqual(Object.keys(row.configSchema.properties), ['lat', 'lng', 'radiusM', 'name', 'nameHi', 'note']);
    assert.equal(row.configSchema.properties.radiusM.minimum, 50);
    assert.equal(row.configSchema.properties.radiusM.maximum, 2000);
    assert.deepEqual(row.configSchema.required, ['lat', 'lng', 'name']);
    assert.equal(getKind('location').interactive, true);
  });
  test('GET /admin/events/task-kinds carries it', async () => {
    const r = await call('GET', '/admin/events/task-kinds');
    assert.equal(r.status, 200);
    assert.equal(r.body.find((k) => k.kind === 'location').configSchema.properties.name.maxLength, 80);
  });
});

/* ──────────────────────────────────────────────────────────────── evaluate (pure, injected clock) ── */
describe('location.evaluate', () => {
  const config = { lat: 19, lng: 72.5, radiusM: 150, name: 'Ghat', nameHi: 'घाट' };
  const NOW = new Date('2026-03-10T06:00:00Z');
  const ev = (rep, o = {}) => location.evaluate({}, rep, { config, now: NOW, prev: null, ...o });
  test('the check order: mocked, bad report, weak fix, implausible move, too far, done', () => {
    assert.deepEqual(ev({ ...fix(19, 72.5), mocked: true, accuracyM: 500 }).refuse, { status: 422, code: 'mock_location', extra: {}, message: 'A mocked location cannot be used to check in.' });
    assert.equal(ev({ lat: 'x', lng: 1, mocked: true }).refuse.code, 'mock_location'); // mocked is judged first
    for (const bad of [{}, { lat: NaN, lng: 1 }, { lat: 1 }, { lat: 91, lng: 0 }, { lat: 0, lng: 181 }, { lat: '19', lng: '72' }, { ...fix(1, 1), accuracyM: 'a' }, { ...fix(1, 1), accuracyM: -1 }, { ...fix(1, 1), at: 'nonsense' }]) {
      assert.equal(ev(bad).invalid, true, JSON.stringify(bad));
    }
    assert.deepEqual(ev({ lat: 19, lng: 72.5 }).refuse.extra, { accuracyM: null, maxM: 100 });
    assert.deepEqual([ev({ lat: 19, lng: 72.5, accuracyM: 101 }).refuse.code, ev({ lat: 19, lng: 72.5, accuracyM: 101 }).refuse.extra], ['weak_fix', { accuracyM: 101, maxM: 100 }]);
    assert.equal(ev({ lat: 19, lng: 72.5, accuracyM: 100 }).done, true); // 100 is allowed
    assert.equal(ev({ lat: 19, lng: 72.5, accuracyM: 100 }).refuse, undefined);
  });
  test('weak fix, mock and bad reports store no point; every later outcome stores it', () => {
    assert.equal(ev({ ...fix(19, 72.5), mocked: true }).point, undefined);
    assert.equal(ev({ lat: 19, lng: 72.5, accuracyM: 500 }).point, undefined);
    assert.equal(ev({}).point, undefined);
    assert.deepEqual(ev(fix(19, 72.5)).point, { lat: 19, lng: 72.5 });
    assert.deepEqual(ev(fix(19, 72.6)).point, { lat: 19, lng: 72.6 }); // too_far still stores it
    assert.deepEqual(ev(fix(19, 72.5), { prev: { lat: 0, lng: 0, atMs: NOW.getTime() - 10_000 } }).point, { lat: 19, lng: 72.5 }); // implausible still stores it
  });
  test('distance: done inside the radius, too_far outside with the distance rounded to 10 m and no target coordinates', () => {
    const inside = ev(fix(19.001, 72.5)); // ~111 m
    assert.equal(inside.done, true);
    assert.deepEqual(inside.how, { en: 'Reached Ghat', hi: 'घाट पहुँचे' });
    const far = ev(fix(19.004, 72.5)); // ~445 m
    assert.equal(far.done, false);
    assert.deepEqual([far.refuse.status, far.refuse.code], [422, 'too_far']);
    assert.deepEqual(Object.keys(far.refuse.extra).sort(), ['distanceM', 'radiusM']);
    assert.equal(far.refuse.extra.radiusM, 150);
    assert.equal(far.refuse.extra.distanceM % 10, 0);
    assert.ok(Math.abs(far.refuse.extra.distanceM - 450) <= 10);
  });
  test('plausibility: > 250 km/h over a gap of 5 s or more is refused; slower is fine; a short gap is not judged', () => {
    const prev = (km, secAgo) => ({ prev: { lat: 19, lng: 72.5 - km / 105.1 * 1, atMs: NOW.getTime() - secAgo * 1000 } });
    // 1 km in 10 s = 360 km/h -> refused; 1 km in 20 s = 180 km/h -> fine.
    assert.equal(ev(fix(19, 72.5), prev(1, 10)).refuse.code, 'implausible_move');
    assert.equal(ev(fix(19, 72.5), prev(1, 10)).refuse.status, 409);
    assert.equal(ev(fix(19, 72.5), prev(1, 20)).done, true);
    assert.equal(ev(fix(19, 72.5), prev(1, 4)).done, true); // gap < 5 s: not judged
    assert.equal(ev(fix(19, 72.5), prev(1, 5)).refuse.code, 'implausible_move'); // exactly 5 s counts
  });
  test('stale or future `at`: older than 2 min or more than 1 min ahead is refused; inside the window is fine', () => {
    const t = NOW.getTime();
    const withAt = (ms) => ev(fix(19, 72.5, { at: new Date(t + ms).toISOString() }));
    assert.equal(withAt(-121_000).refuse.code, 'implausible_move');
    assert.equal(withAt(-119_000).done, true);
    assert.equal(withAt(61_000).refuse.code, 'implausible_move');
    assert.equal(withAt(59_000).done, true);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────── route ── */
describe('route block: validation and computed figures', () => {
  test('lengthKm, routeKm and offRouteM are computed on save; hand-sent values are ignored', async () => {
    const r = await create({ milestones: { order: 'any', items: [stop('a', 19, 72.5, { config: { routeKm: 999, offRouteM: 1 } }), stop('b', 19.002, 72.9)] } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.ok(Math.abs(r.body.route.lengthKm - 105.1) < 0.2, String(r.body.route.lengthKm));
    const [a, b] = r.body.milestones.items.map((m) => m.tasks[0].config);
    assert.ok(Math.abs(a.routeKm - 52.55) < 0.1, String(a.routeKm));
    assert.equal(a.offRouteM, 0);
    assert.ok(Math.abs(b.routeKm - 94.6) < 0.2);
    assert.ok(Math.abs(b.offRouteM - 222) < 3, String(b.offRouteM));
    assert.deepEqual(r.body.warnings, []);
    assert.equal(r.body.milestones.items[0].tasks[0].title, 'Reached Place a'); // the title defaults to the kind's summary
  });
  test('a stop more than 1000 m off the path is saved with an off_route warning (create and update)', async () => {
    const r = await create({ milestones: { order: 'any', items: [stop('a', 19, 72.5), stop('b', 19.02, 72.9)] } }); // ~2.2 km north
    assert.equal(r.status, 201);
    assert.equal(r.body.warnings.length, 1);
    assert.deepEqual([r.body.warnings[0].path, r.body.warnings[0].code], ['milestones.items.1.tasks.0.config', 'off_route']);
    assert.ok(Math.abs(r.body.warnings[0].distanceM - 2224) < 10);
    const put = await call('PUT', `/admin/events/${r.body.id}`, { body: { title: 'Renamed' } });
    assert.equal(put.status, 200);
    assert.equal(put.body.warnings.length, 1); // recomputed from what is stored
    const fixed = await call('PUT', `/admin/events/${r.body.id}`, { body: { milestones: { ...r.body.milestones, items: [r.body.milestones.items[0], stop('b', 19.005, 72.9)] } } });
    assert.deepEqual(fixed.body.warnings, []); // ~555 m: no warning
    const got = await call('GET', `/admin/events/${r.body.id}`);
    assert.equal(got.body.warnings, undefined);
  });
  test('a route round-trips; ends are snapped to start/end; mapReveal defaults to all', async () => {
    const r = await create({ route: { start: { name: 'S', lat: 19, lng: 72 }, end: { name: 'E', lat: 19, lng: 73 }, path: [[19.1, 72.1], [19, 72.5], [19.1, 73.1]] } });
    assert.equal(r.status, 201);
    assert.deepEqual(r.body.route.path, [[19, 72], [19, 72.5], [19, 73]]);
    assert.equal(r.body.route.mapReveal, 'all');
    assert.deepEqual(r.body.blocks, ['schedule', 'milestones', 'route']);
    const g = await call('GET', `/admin/events/${r.body.id}`);
    assert.deepEqual(g.body.route, r.body.route);
  });
  test('route validation names every bad field with 400 bad_event', async () => {
    const bad = async (route, field) => {
      const r = await create({ route });
      assert.deepEqual(code(r), [400, 'bad_event'], field);
      assert.ok(field in r.body.fields, `${field} in ${JSON.stringify(r.body.fields)}`);
    };
    await bad({ ...ROUTE(), path: [[19, 72]] }, 'route.path');
    await bad({ ...ROUTE(), path: Array.from({ length: 501 }, (_, i) => [19, 72 + i * 0.0001]) }, 'route.path');
    await bad({ ...ROUTE(), path: [[19, 72], [91, 72.5], [19, 73]] }, 'route.path.1');
    await bad({ ...ROUTE(), path: [[19, 72], [19, 'x'], [19, 73]] }, 'route.path.1');
    await bad({ ...ROUTE(), path: [[19, 72], [19], [19, 73]] }, 'route.path.1');
    await bad({ ...ROUTE(), path: [[19, 72], [19, 181], [19, 73]] }, 'route.path.1');
    await bad({ ...ROUTE(), path: 'nope' }, 'route.path');
    await bad({ ...ROUTE(), start: { name: 'S'.repeat(81), lat: 19, lng: 72 } }, 'route.start.name');
    await bad({ ...ROUTE(), end: { name: 'E', nameHi: 'E'.repeat(81), lat: 19, lng: 73 } }, 'route.end.nameHi');
    await bad({ ...ROUTE(), start: { name: 'S', lat: 200, lng: 72 } }, 'route.start.lat');
    await bad({ ...ROUTE(), end: { name: 'E', lat: 19 } }, 'route.end.lng');
    await bad({ ...ROUTE(), start: null }, 'route.start');
    await bad({ ...ROUTE(), mapReveal: 'some' }, 'route.mapReveal');
    await bad('x', 'route');
    const listed = await call('POST', '/admin/events', { body: { ...body(), route: undefined } });
    assert.deepEqual(code(listed), [400, 'bad_event']); // "route" is listed but has no content
    assert.ok('route' in listed.body.fields);
  });
  test('location config errors are named milestones.items[i].tasks[j].config.<field>', async () => {
    const r = await create({ milestones: { order: 'any', items: [stop('a', 19, 72.5, { config: { radiusM: 49, name: '' } })] } });
    assert.deepEqual(code(r), [400, 'bad_event']);
    assert.ok('milestones.items.0.tasks.0.config.radiusM' in r.body.fields);
    assert.ok('milestones.items.0.tasks.0.config.name' in r.body.fields);
  });
  test('a route without location milestones is valid; an event without a route block stores no routeKm and has route:null', async () => {
    const onlyPath = await create({ milestones: undefined, blocks: ['schedule', 'route'] });
    assert.equal(onlyPath.status, 201, JSON.stringify(onlyPath.body));
    const noRoute = await create({ blocks: ['schedule', 'milestones'], route: undefined });
    assert.equal(noRoute.status, 201);
    assert.equal(noRoute.body.route, undefined);
    assert.equal('routeKm' in noRoute.body.milestones.items[0].tasks[0].config, false);
    assert.deepEqual(noRoute.body.warnings, []);
    // Dropping the route block later removes the stale figures.
    const withRoute = await create({});
    assert.ok('routeKm' in withRoute.body.milestones.items[0].tasks[0].config);
    const dropped = await call('PUT', `/admin/events/${withRoute.body.id}`, { body: { blocks: ['schedule', 'milestones'], route: null } });
    assert.equal(dropped.status, 200, JSON.stringify(dropped.body));
    assert.equal(dropped.body.route, undefined);
    assert.equal('routeKm' in dropped.body.milestones.items[0].tasks[0].config, false);
  });
  test('publishing a route event works and the detail carries the computed route', async () => {
    const r = await create({ published: true });
    assert.equal(r.status, 201);
    const d = await detail(null, r.body.slug);
    assert.equal(d.status, 200);
    assert.deepEqual(d.body.event.blocks, ['schedule', 'milestones', 'route']);
    assert.ok(Array.isArray(d.body.event.route.stops));
  });
});

/* ───────────────────────────────────────────────────────────── the detail's `route` (states) ── */
describe('detail route', () => {
  before(async () => {
    await mk('yatra-seq', { milestones: { order: 'sequential', missed: 'catch_up_next', completion: { rule: 'all', n: null }, items: [
      cfgStop('a', 19, 72.25, { config: { routeKm: 26.3 } }), cfgStop('b', 19, 72.5, { config: { routeKm: 52.6 } }), cfgStop('c', 19, 72.9, { config: { routeKm: 94.6 } }),
    ] } });
    await mk('yatra-detail', { milestones: { order: 'any', missed: 'catch_up_next', completion: { rule: 'all', n: null }, items: [
      cfgStop('c', 19, 72.9, { config: { routeKm: 94.6 } }), cfgStop('a', 19, 72.25, { config: { routeKm: 26.3 } }), cfgStop('b', 19, 72.5, { config: { routeKm: 52.6 } }),
    ] } });
    await mk('yatra-plain', { blocks: ['schedule'], milestones: undefined, route: undefined });
    await mk('yatra-hidden', { route: { ...ROUTE({ mapReveal: 'unlocked' }), lengthKm: 105.1 }, milestones: { order: 'sequential', missed: 'catch_up_next', completion: { rule: 'all', n: null }, items: [
      cfgStop('a', 19, 72.25, { config: { routeKm: 26.3 } }), cfgStop('b', 19, 72.5, { config: { routeKm: 52.6 } }),
    ] } });
  });
  test('null without a route block; the stored block is never leaked raw', async () => {
    const d = await detail(null, 'yatra-plain');
    assert.equal(d.body.event.route, null);
    assert.ok('route' in d.body.event);
  });
  test('sequential: only the first stop is next, the rest are locked', async () => {
    const d = (await detail(null, 'yatra-seq')).body.event.route;
    assert.deepEqual(d.stops.map((s) => [s.milestoneKey, s.order, s.state, s.locked]), [['a', 1, 'next', false], ['b', 2, 'locked', true], ['c', 3, 'locked', true]]);
  });
  test('stops are ordered by routeKm (not milestone order) with 1-based order; the first is next; guest sees no progress', async () => {
    const d = (await detail(null, 'yatra-detail')).body.event.route;
    assert.deepEqual(d.stops.map((s) => [s.milestoneKey, s.order, s.state, s.locked]), [['a', 1, 'next', false], ['b', 2, 'open', false], ['c', 3, 'open', false]]);
    assert.deepEqual(Object.keys(d.stops[0]).sort(), ['completedAt', 'done', 'lat', 'lng', 'locked', 'milestoneKey', 'name', 'nameHi', 'note', 'order', 'radiusM', 'routeKm', 'state', 'taskKey', 'title', 'titleHi']);
    assert.deepEqual(d.progress, { doneKm: 0, totalKm: 105.1, stopsDone: 0, stopsTotal: 3 });
    assert.deepEqual(d.path, PATH);
    assert.deepEqual([d.start.name, d.end.name, d.lengthKm, d.mapReveal], ['Start', 'End', 105.1, 'all']);
    assert.equal(d.stops[0].name, 'Place a');
    assert.equal(d.stops[0].note, 'Darshan');
  });
  test('done / next / open / locked follow the devotee; doneKm is the furthest completed stop', async () => {
    at('2026-03-10T06:00:00Z');
    assert.equal((await report('r1', 'yatra-detail', 'a', 't1', fix(19, 72.25))).status, 200);
    let r = (await detail('r1', 'yatra-detail')).body.event.route;
    assert.deepEqual(r.stops.map((s) => s.state), ['done', 'next', 'open']);
    assert.equal(r.stops[0].done, true);
    assert.equal(r.stops[0].completedAt, clock.toISOString());
    assert.deepEqual(r.progress, { doneKm: 26.3, totalKm: 105.1, stopsDone: 1, stopsTotal: 3 });
    tick(3600_000); // 26 km between the stops: an hour apart
    assert.equal((await report('r1', 'yatra-detail', 'b', 't1', fix(19, 72.5))).status, 200);
    r = (await detail('r1', 'yatra-detail')).body.event.route;
    assert.deepEqual(r.stops.map((s) => s.state), ['done', 'done', 'next']);
    assert.equal(r.progress.doneKm, 52.6);
    // Someone else is unaffected.
    assert.deepEqual((await detail('r2', 'yatra-detail')).body.event.route.stops.map((s) => s.state), ['next', 'open', 'open']);
  });
  test('"open" is a reachable, not-done stop that is not the next one (order: any)', async () => {
    await mk('yatra-open', { milestones: { order: 'any', missed: 'catch_up_next', completion: { rule: 'all', n: null }, items: [
      cfgStop('a', 19, 72.25, { config: { routeKm: 26.3 } }), cfgStop('b', 19, 72.5, { config: { routeKm: 52.6 } }),
    ] } });
    assert.deepEqual((await detail('o1', 'yatra-open')).body.event.route.stops.map((s) => s.state), ['next', 'open']);
  });
  test('a milestone that opens later is locked; a not-started event is all locked', async () => {
    await mk('yatra-later', { schedule: { mode: 'multiday', startsAt: new Date('2026-03-20T00:00:00Z'), endsAt: new Date('2026-03-25T00:00:00Z') }, milestones: { order: 'any', missed: 'catch_up_next', completion: { rule: 'all', n: null }, items: [cfgStop('a', 19, 72.25, { config: { routeKm: 26.3 } })] } });
    assert.deepEqual((await detail('l1', 'yatra-later')).body.event.route.stops.map((s) => s.state), ['locked']);
    await mk('yatra-opens', { milestones: { order: 'any', missed: 'catch_up_next', completion: { rule: 'all', n: null }, items: [
      cfgStop('a', 19, 72.25, { config: { routeKm: 26.3 }, ms: { opensAt: new Date('2026-03-09T00:00:00Z') } }), cfgStop('b', 19, 72.5, { config: { routeKm: 52.6 }, ms: { opensAt: new Date('2026-03-11T00:00:00Z') } }),
    ] } });
    assert.deepEqual((await detail('l1', 'yatra-opens')).body.event.route.stops.map((s) => s.state), ['next', 'locked']);
  });
  test('mapReveal "unlocked" leaves locked stops out (totals stay true); "all" lists them', async () => {
    const r = (await detail('h1', 'yatra-hidden')).body.event.route;
    assert.deepEqual(r.stops.map((s) => [s.milestoneKey, s.state]), [['a', 'next']]);
    assert.equal(r.mapReveal, 'unlocked');
    assert.equal(r.progress.stopsTotal, 2);
    assert.equal(r.stops[0].order, 1);
    assert.equal((await report('h1', 'yatra-hidden', 'a', 't1', fix(19, 72.25))).status, 200);
    assert.deepEqual((await detail('h1', 'yatra-hidden')).body.event.route.stops.map((s) => s.state), ['done', 'next']);
  });
  test('the path is public data: it is returned to guests too', async () => {
    const g = await detail(null, 'yatra-detail');
    assert.equal(g.body.event.me, null);
    assert.equal(g.body.event.route.stops.length, 3);
  });
});

/* ───────────────────────────────────────────────────────────────────── reporting, end to end ── */
describe('reporting a position', () => {
  before(async () => {
    await mk('yatra-live', { rewards: [{ kind: 'badge', coins: 0, badgeSlug: 'pilgrim', trigger: { on: 'event', milestoneKey: '' } }, { kind: 'coins', coins: 40, badgeSlug: '', trigger: { on: 'event', milestoneKey: '' } }],
      milestones: { order: 'any', missed: 'catch_up_next', completion: { rule: 'all', n: null }, items: [
        cfgStop('a', 19, 72.25, { config: { routeKm: 26.3 }, ms: { coins: 5 } }), cfgStop('b', 19, 72.5, { config: { routeKm: 52.6 }, ms: { coins: 7 } }),
      ] } });
  });
  const A = fix(19, 72.25);

  test('every refusal has its status, code and body; a refusal writes no task row', async () => {
    at('2026-03-10T06:00:00Z');
    const ask = async (uid, rep) => { tick(); return report(uid, 'yatra-live', 'a', 't1', rep); };
    assert.deepEqual(code(await ask('e1', { ...A, mocked: true })), [422, 'mock_location']);
    assert.deepEqual(code(await ask('e1', { lat: 19 })), [400, 'bad_report']);
    assert.deepEqual(code(await ask('e1', { lat: 'a', lng: 'b', accuracyM: 5 })), [400, 'bad_report']);
    const weak = await ask('e1', { ...A, accuracyM: 250 });
    assert.deepEqual([weak.status, weak.body.code, weak.body.accuracyM, weak.body.maxM], [422, 'weak_fix', 250, 100]);
    const noAcc = await ask('e1', { lat: 19, lng: 72.25 });
    assert.deepEqual([noAcc.status, noAcc.body.code], [422, 'weak_fix']);
    const far = await ask('e1', fix(19.004, 72.25));
    assert.deepEqual([far.status, far.body.code, far.body.radiusM, far.body.distanceM % 10], [422, 'too_far', 150, 0]);
    assert.ok(Math.abs(far.body.distanceM - 450) <= 10);
    assert.equal(JSON.stringify(far.body).includes('72.25'), false, 'never reveals the target');
    assert.equal(JSON.stringify(far.body).includes('lat'), false);
    assert.equal(await TaskProgress.countDocuments({ eventSlug: 'yatra-live', uid: 'e1' }), 0);
    // The ones that stored a point: not the mock, the bad report or the weak fix.
    const p = await LocationPoint.findOne({ uid: 'e1', eventSlug: 'yatra-live' }).lean();
    assert.deepEqual([p.lat, p.lng], [19.004, 72.25]);
  });

  test('the usual preconditions still apply: unpublished 404, unknown milestone/task 404, locked, not registered', async () => {
    assert.deepEqual(code(await report('e2', 'nope', 'a', 't1', A)), [404, 'not_found']);
    assert.deepEqual(code(await report('e2', 'yatra-live', 'zz', 't1', A)), [404, 'not_found']);
    assert.deepEqual(code(await report('e2', 'yatra-live', 'a', 'zz', A)), [404, 'not_found']);
    assert.equal((await call('POST', '/public/events/yatra-live/milestones/a/tasks/t1/progress', { headers: devotee(null), body: A })).status, 401);
    await mk('yatra-reg', { blocks: ['schedule', 'registration', 'milestones', 'route'], registration: { mode: 'free', coins: 0, capacity: null, opensAt: null, closesAt: null, pass: true, fields: [] },
      milestones: { order: 'any', missed: 'catch_up_next', completion: { rule: 'all', n: null }, items: [cfgStop('a', 19, 72.25, { config: { routeKm: 26.3 } })] } });
    assert.deepEqual(code(await report('e2', 'yatra-reg', 'a', 't1', A)), [403, 'not_registered']);
    await mk('yatra-locked', { milestones: { order: 'any', missed: 'catch_up_next', completion: { rule: 'all', n: null }, items: [cfgStop('a', 19, 72.25, { config: { routeKm: 26.3 }, ms: { opensAt: new Date('2026-03-11T00:00:00Z') } })] } });
    assert.deepEqual(code(await report('e2', 'yatra-locked', 'a', 't1', A)), [409, 'locked']);
    await mk('yatra-old', { published: false });
    assert.deepEqual(code(await report('e2', 'yatra-old', 'a', 't1', A)), [404, 'not_found']);
  });

  test('plausibility: a jump of ~80 km in 6 s is refused (409), the same jump over 2 h is not; the point updates each time', async () => {
    at('2026-03-10T06:00:00Z');
    assert.equal((await report('p1', 'yatra-live', 'b', 't1', fix(19.004, 72.5))).body.code, 'too_far'); // stores the point ~445 m away
    tick(6000);
    const jump = await report('p1', 'yatra-live', 'b', 't1', fix(19, 72.75)); // ~26 km in 6 s
    assert.deepEqual(code(jump), [409, 'implausible_move']);
    tick(2 * 3600_000);
    assert.equal((await report('p1', 'yatra-live', 'b', 't1', fix(19, 72.5))).status, 200); // 26 km in 2 h: walking pace
  });

  test('stale or future `at` is refused with 409 implausible_move', async () => {
    at('2026-03-10T07:00:00Z');
    const iso = (ms) => new Date(clock.getTime() + ms).toISOString();
    assert.deepEqual(code(await report('s1', 'yatra-live', 'a', 't1', { ...A, at: iso(-3 * 60_000) })), [409, 'implausible_move']);
    tick();
    assert.deepEqual(code(await report('s1', 'yatra-live', 'a', 't1', { ...A, at: iso(2 * 60_000) })), [409, 'implausible_move']);
    tick();
    assert.equal((await report('s1', 'yatra-live', 'a', 't1', { ...A, at: new Date(clock.getTime() - 30_000).toISOString() })).status, 200);
  });

  test('rate: a second report within 5 s is 429 too_fast with the current task state; at 5 s it is accepted again', async () => {
    at('2026-03-10T08:00:00Z');
    assert.equal((await report('rt', 'yatra-live', 'a', 't1', fix(19.0015, 72.25))).body.code, 'too_far'); // ~167 m
    tick(1000);
    const fast = await report('rt', 'yatra-live', 'a', 't1', A);
    assert.equal(fast.status, 429);
    assert.deepEqual(fast.body.task, { key: 't1', done: false, completedAt: null, state: {} });
    assert.equal(fast.body.code, 'too_fast');
    tick(3999);
    assert.equal((await report('rt', 'yatra-live', 'a', 't1', A)).status, 429); // 4.999 s since the first
    tick(1);
    assert.equal((await report('rt', 'yatra-live', 'a', 't1', A)).status, 200);
    // The slot is per devotee, not per task: another milestone's report right after is limited too.
    assert.equal((await report('rt', 'yatra-live', 'b', 't1', fix(19, 72.5))).status, 429);
    // ...and other devotees are independent.
    assert.equal((await report('rt2', 'yatra-live', 'a', 't1', A)).status, 200);
  });

  test('success: done, `how` in both languages, the completion sheet, coins; replays are 200 current state with no new award', async () => {
    at('2026-03-10T09:00:00Z');
    wallet.hits.length = 0;
    const r = await report('w1', 'yatra-live', 'a', 't1', A);
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.task.done, r.body.task.state, r.body.milestone, r.body.event.justCompleted], [true, {}, { key: 'a', done: true, justCompleted: true }, false]);
    assert.equal(r.body.awarded.coins, 5);
    assert.deepEqual(r.body.completion.how, [{ text: 'Reached Place a', textHi: 'स्थान a पहुँचे' }]);
    assert.equal(r.body.completion.next.title, 'Stop b');
    assert.equal(wallet.hits.filter((h) => h.path === '/credit').length, 1);
    const row = await TaskProgress.findOne({ uid: 'w1', eventSlug: 'yatra-live', milestoneKey: 'a' }).lean();
    assert.deepEqual(row.how, { en: 'Reached Place a', hi: 'स्थान a पहुँचे' });
    tick(10_000);
    const again = await report('w1', 'yatra-live', 'a', 't1', fix(40, 10)); // anywhere: already done is not re-checked
    assert.equal(again.status, 200);
    assert.deepEqual([again.body.task.done, again.body.milestone.justCompleted, again.body.awarded.coins, again.body.completion], [true, false, 0, null]);
    assert.equal(wallet.hits.filter((h) => h.path === '/credit').length, 1);
    const g = await report('w1', 'yatra-live', 'a', 't1', {}); // a finished task needs no valid report and takes no slot
    assert.equal(g.status, 200);
  });

  test('completing the last stop completes the event: event coins, badge, once', async () => {
    at('2026-03-10T10:00:00Z');
    wallet.hits.length = 0;
    assert.equal((await report('w2', 'yatra-live', 'a', 't1', A)).status, 200);
    tick(3600_000);
    const last = await report('w2', 'yatra-live', 'b', 't1', fix(19, 72.5));
    assert.equal(last.status, 200);
    assert.equal(last.body.event.justCompleted, true);
    assert.equal(last.body.awarded.coins, 7 + 40);
    assert.deepEqual(last.body.awarded.badges.map((b) => b.slug), ['pilgrim']);
    assert.equal(last.body.completion.eventCompleted, true);
    const keys = wallet.hits.filter((h) => h.path === '/credit').map((h) => h.body.key).sort();
    assert.deepEqual(keys, ['event-done:yatra-live:w2', 'event-ms:yatra-live:a:w2', 'event-ms:yatra-live:b:w2']);
    assert.equal(await EventResult.countDocuments({ uid: 'w2', eventSlug: 'yatra-live' }), 1);
    const d = (await detail('w2', 'yatra-live')).body.event;
    assert.deepEqual(d.route.stops.map((s) => s.state), ['done', 'done']);
    assert.deepEqual(d.route.progress, { doneKm: 52.6, totalKm: 105.1, stopsDone: 2, stopsTotal: 2 });
    assert.equal(d.me.completed, true);
  });

  test('exactly once under parallel reports: one winner, one milestone result, one credit', async () => {
    at('2026-03-10T11:00:00Z');
    wallet.hits.length = 0;
    const rs = await Promise.all(Array.from({ length: 8 }, () => report('par', 'yatra-live', 'a', 't1', A)));
    const ok = rs.filter((r) => r.status === 200);
    assert.ok(ok.length >= 1);
    assert.ok(rs.every((r) => [200, 429].includes(r.status)), rs.map((r) => r.status).join());
    assert.equal(ok.filter((r) => r.body.milestone.justCompleted).length, 1);
    assert.equal(await MilestoneResult.countDocuments({ uid: 'par', eventSlug: 'yatra-live', milestoneKey: 'a' }), 1);
    assert.equal(await TaskProgress.countDocuments({ uid: 'par', eventSlug: 'yatra-live', milestoneKey: 'a' }), 1);
    assert.equal(wallet.hits.filter((h) => h.path === '/credit').length, 1);
    assert.equal(await LocationPoint.countDocuments({ uid: 'par', eventSlug: 'yatra-live' }), 1);
  });

  test('one last point per (event, devotee): no trail, never returned, TTL index = event end + 7 days', async () => {
    assert.equal(await LocationPoint.countDocuments({ uid: 'rt', eventSlug: 'yatra-live' }), 1);
    const idx = await LocationPoint.collection.indexes();
    const ttl = idx.find((i) => i.key.expiresAt === 1);
    assert.equal(ttl.expireAfterSeconds, 0);
    assert.ok(idx.find((i) => i.unique && i.key.uid === 1 && i.key.eventSlug === 1));
    // An event with an end: expiresAt = end + 7 days.
    await mk('yatra-ends', { schedule: { mode: 'multiday', startsAt: new Date('2026-03-01T00:00:00Z'), endsAt: new Date('2026-03-20T00:00:00Z') }, milestones: { order: 'any', missed: 'catch_up_next', completion: { rule: 'all', n: null }, items: [cfgStop('a', 19, 72.25, { config: { routeKm: 26.3 } })] } });
    at('2026-03-10T12:00:00Z');
    assert.equal((await report('x1', 'yatra-ends', 'a', 't1', A)).status, 200);
    const p = await LocationPoint.findOne({ uid: 'x1', eventSlug: 'yatra-ends' }).lean();
    assert.equal(p.expiresAt.toISOString(), '2026-03-27T00:00:00.000Z');
    // An open-ended event: 7 days from the report.
    const q = await LocationPoint.findOne({ uid: 'w1', eventSlug: 'yatra-live' }).lean();
    assert.equal(new Date(q.expiresAt).getTime() - new Date(q.pointAt ?? q.reportedAt).getTime() <= 7 * 24 * 3600_000, true);
    // No API ever returns it: not the report answer, not the detail, not stats, not participants.
    const everything = JSON.stringify([
      (await detail('x1', 'yatra-ends')).body, (await call('GET', '/public/me/events', { headers: devotee('x1') })).body,
      (await call('GET', `/admin/events/${(await Event.findOne({ slug: 'yatra-ends' }).lean())._id}/participants`)).body,
    ]);
    assert.equal(everything.includes('pointAt'), false);
    assert.equal(everything.includes('reportedAt'), false);
    assert.equal(everything.includes('expiresAt'), false);
    assert.equal(everything.includes('"x1"'), false);
  });

  test('stats are unchanged: counts per milestone, no locations', async () => {
    const id = (await Event.findOne({ slug: 'yatra-live' }).lean())._id;
    const s = await call('GET', `/admin/events/${id}/stats`);
    assert.equal(s.status, 200);
    assert.deepEqual(Object.keys(s.body).sort(), ['checkedIn', 'finished', 'joined', 'perMilestone']);
    assert.deepEqual(s.body.perMilestone.map((m) => [m.key, m.completedCount > 0]), [['a', true], ['b', true]]);
  });

  test('other kinds still answer 422 task_not_supported; a location task in a milestone with other tasks needs only its own report', async () => {
    await mk('yatra-mixed', { milestones: { order: 'any', missed: 'catch_up_next', completion: { rule: 'all', n: null }, items: [{
      key: 'a', title: 'A', titleHi: '', opensAt: null, coins: 0, link: null, completion: { rule: 'all', n: null },
      tasks: [stop('x', 19, 72.25).tasks[0], { key: 'qr', kind: 'qr_checkin', title: 'QR', titleHi: '', config: {} }],
    }] } });
    at('2026-03-10T13:00:00Z');
    assert.deepEqual(code(await report('m1', 'yatra-mixed', 'a', 'qr', {})), [422, 'task_not_supported']);
    const r = await report('m1', 'yatra-mixed', 'a', 't1', A);
    assert.equal(r.status, 200);
    assert.equal(r.body.milestone.done, false); // the QR task is still outstanding
  });
});
