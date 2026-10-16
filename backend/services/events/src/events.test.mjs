// Run: TEST_MONGODB_URI=mongodb://127.0.0.1:27193/x node --test --test-concurrency=1 src/events.test.mjs
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, test } from 'node:test';

import { permissionsFor, signServiceToken } from '@bhakti/common';
import mongoose from 'mongoose';

import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { connectDb } from './db.js';
import { Badge, Event, EventType, Registration } from './models/index.js';
import { DEFAULT_EVENT_TYPES, seedEvents } from './seed.js';
import { CatalogUnavailable, createCatalogClient } from './lib/catalog-client.js';

const SECRET = 'test-secret-test-secret-1234';
const base = new URL(process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27193/x');
const config = loadConfig({ INTERNAL_JWT_SECRET: SECRET, MONGODB_URI: `${base.protocol}//${base.host}`, DB_NAME: 'events_test' });

const tok = (o = {}) => signServiceToken({ iss: 'admin-bff', sub: 'op1', role: 'admin', perms: permissionsFor('admin'), ctx: { username: 'tester' }, ...o }, { secret: SECRET });
const as = (role) => ({ authorization: `Bearer ${tok({ role, perms: permissionsFor(role) })}` });
const mobile = (sub) => ({ authorization: `Bearer ${signServiceToken({ iss: 'mobile-bff', ...(sub ? { sub } : {}) }, { secret: SECRET })}` });

let clock = new Date('2026-03-05T06:00:00Z');
const catalogKnows = new Set(['stream:kashi', 'listing:diya', 'pooja:rudra', 'temple:somnath', 'aarti:om-jai']);
let catalogDown = false;
const catalog = { exists: async (t, s) => { if (catalogDown) throw new CatalogUnavailable('down'); return catalogKnows.has(`${t}:${s}`); } };

let server;
let url;
before(async () => {
  await connectDb(config);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  const app = createApp(config, { isReady: () => true, logger: { info() {}, warn() {}, error() {} }, catalog, now: () => clock });
  server = http.createServer(app);
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((ok) => server.close(ok));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function call(method, path, { headers = as('admin'), body } = {}) {
  const res = await fetch(`${url}/internal/events${path}`, {
    method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const garba = (o = {}) => ({
  title: 'Navratri Garba Night', titleHi: 'नवरात्रि गरबा', typeSlug: 'garba-night', tags: ['Navratri', 'garba'], summary: 'An evening of garba.',
  blocks: ['schedule', 'venue', 'registration', 'milestones', 'rewards'],
  schedule: { mode: 'single', startsAt: '2026-03-10T13:00:00Z', endsAt: '2026-03-10T17:00:00Z' },
  venue: { name: 'Town Hall', city: 'Pune', templeSlug: 'somnath' },
  registration: { mode: 'free', capacity: 100, pass: true, fields: [{ key: 'party', label: 'Party size', type: 'number', required: true }] },
  milestones: {
    order: 'any', missed: 'catch_up_next', completion: { rule: 'all' },
    items: [
      { key: 'arrive', title: 'Arrive', coins: 5, tasks: [{ kind: 'qr_checkin', title: 'Check in' }] },
      { title: 'Chant', coins: 10, opensAt: '2026-03-10T14:00:00Z', tasks: [{ kind: 'counter', title: 'Chant', config: { label: 'Om', target: 108 } }, { kind: 'live_darshan', config: { streamSlug: 'kashi', minutes: 5 } }] },
    ],
  },
  rewards: [{ kind: 'coins', coins: 50, trigger: { on: 'event' } }],
  ...o,
});

describe('seed', () => {
  test('seeds exactly the four presets into an empty collection, and no events', async () => {
    assert.deepEqual(await seedEvents(), { seeded: 4 });
    assert.deepEqual((await EventType.find().sort({ order: 1 }).lean()).map((t) => t.slug), ['garba-night', 'yatra', 'vrat', 'japa']);
    assert.equal(await Event.countDocuments(), 0);
    assert.equal(DEFAULT_EVENT_TYPES.length, 4);
  });
  test('never re-seeds, even after an operator deleted one', async () => {
    await EventType.deleteOne({ slug: 'japa' });
    assert.deepEqual(await seedEvents(), { seeded: 0 });
    assert.equal(await EventType.countDocuments(), 3);
    await EventType.create(DEFAULT_EVENT_TYPES.find((t) => t.slug === 'japa'));
  });
});

describe('gate', () => {
  test('401 without a token, 403 for the wrong kind of caller, viewer reads but cannot write', async () => {
    assert.equal((await fetch(`${url}/internal/events/public/events`)).status, 401);
    assert.equal((await call('GET', '/admin/events', { headers: mobile() })).status, 403);
    assert.equal((await call('GET', '/public/events', { headers: { authorization: `Bearer ${signServiceToken({ iss: 'wallet' }, { secret: SECRET })}` } })).status, 403);
    assert.equal((await call('GET', '/admin/events', { headers: as('viewer') })).status, 200);
    const w = await call('POST', '/admin/events', { headers: as('viewer'), body: garba() });
    assert.equal(w.status, 403);
    assert.equal(w.body.needs, 'events:edit');
    assert.equal((await call('POST', '/admin/event-types', { headers: as('viewer'), body: { name: 'X' } })).status, 403);
  });
  test('an editor may write events', async () => {
    const r = await call('POST', '/admin/events', { headers: as('editor'), body: garba({ title: 'Editor made it' }) });
    assert.equal(r.status, 201);
    await Event.deleteOne({ slug: r.body.slug });
  });
  test('the operator without a sub or perms is refused', async () => {
    const t = signServiceToken({ iss: 'admin-bff' }, { secret: SECRET });
    assert.equal((await call('GET', '/admin/events', { headers: { authorization: `Bearer ${t}` } })).status, 401);
  });
});

describe('event validation', () => {
  const bad = async (body, field, extra = {}) => {
    const r = await call('POST', '/admin/events', { body, ...extra });
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.equal(r.body.code, 'bad_event');
    assert.ok(field in r.body.fields, `${field} in ${JSON.stringify(r.body.fields)}`);
  };

  test('required fields, unknown type, unknown block, listed block with no body', async () => {
    await bad({}, 'title');
    await bad(garba({ typeSlug: 'nope' }), 'typeSlug');
    await bad(garba({ blocks: ['schedule', 'sparkles'] }), 'blocks');
    await bad(garba({ blocks: ['schedule', 'content'] }), 'content');
  });
  test('schedule end before start, multiday needs an end, publishing needs a schedule', async () => {
    await bad(garba({ schedule: { mode: 'single', startsAt: '2026-03-10T13:00:00Z', endsAt: '2026-03-09T13:00:00Z' } }), 'schedule.endsAt');
    await bad(garba({ schedule: { mode: 'multiday', startsAt: '2026-03-10T13:00:00Z' } }), 'schedule.endsAt');
    await bad(garba({ schedule: { mode: 'single', startsAt: 'yesterday' } }), 'schedule.startsAt');
    await bad(garba({ published: true, blocks: ['venue'], schedule: undefined }), 'schedule');
    await bad(garba({ published: true, schedule: { mode: 'single' } }), 'schedule.startsAt');
  });
  test('registration: coins need >= 1, capacity >= 1 or null, choice needs options', async () => {
    await bad(garba({ registration: { mode: 'coins', coins: 0 } }), 'registration.coins');
    await bad(garba({ registration: { mode: 'free', capacity: 0 } }), 'registration.capacity');
    await bad(garba({ registration: { mode: 'free', fields: [{ key: 'diet', label: 'Diet', type: 'choice', options: ['one'] }] } }), 'registration.fields.0.options');
    const ok = await call('POST', '/admin/events', { body: garba({ title: 'Cap null', registration: { mode: 'free', capacity: null } }) });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.registration.capacity, null);
  });
  test('milestones: unique keys, bounds, daily needs opensAt, atLeast needs n', async () => {
    const m = (items, extra = {}) => garba({ milestones: { order: 'any', items, ...extra } });
    const t = [{ kind: 'self_mark', title: 'ok' }];
    await bad(m([{ key: 'a', title: 'A', tasks: t }, { key: 'a', title: 'B', tasks: t }]), 'milestones.items.1.key');
    await bad(m([]), 'milestones.items');
    await bad(m(Array.from({ length: 61 }, (_, i) => ({ key: `k${i}`, title: 'x', tasks: t }))), 'milestones.items');
    await bad(m([{ key: 'a', title: 'A', tasks: Array.from({ length: 9 }, (_, i) => ({ key: `t${i}`, kind: 'self_mark' })) }]), 'milestones.items.0.tasks');
    await bad(m([{ key: 'a', title: 'A', tasks: [{ key: 'x', kind: 'self_mark' }, { key: 'x', kind: 'self_mark' }] }]), 'milestones.items.0.tasks.1.key');
    await bad(m([{ key: 'a', title: 'A', tasks: t }], { order: 'daily' }), 'milestones.items.0.opensAt');
    await bad(m([{ key: 'a', title: 'A', tasks: t }], { completion: { rule: 'atLeast' } }), 'milestones.completion.n');
    await bad(m([{ key: 'a', title: 'A', tasks: t }], { completion: { rule: 'atLeast', n: 3 } }), 'milestones.completion.n');
    await bad(m([{ key: 'a', title: 'A', tasks: [] }]), 'milestones.items.0.tasks');
  });
  test('every task is validated by its kind (and unknown kinds are refused)', async () => {
    const one = (task) => garba({ milestones: { items: [{ key: 'a', title: 'A', tasks: [task] }] } });
    await bad(one({ kind: 'counter', config: { target: 0 } }), 'milestones.items.0.tasks.0.config.target');
    await bad(one({ kind: 'teleport' }), 'milestones.items.0.tasks.0.kind');
    await bad(one({ kind: 'location', config: { lat: 500, lng: 1, radiusM: 100 } }), 'milestones.items.0.tasks.0.config.lat');
  });
  test('rewards: a milestone trigger must name a real milestone key; unknown badge refused', async () => {
    await bad(garba({ rewards: [{ kind: 'coins', coins: 5, trigger: { on: 'milestone', milestoneKey: 'ghost' } }] }), 'rewards.0.trigger.milestoneKey');
    await bad(garba({ rewards: [{ kind: 'badge', badgeSlug: 'ghost', trigger: { on: 'event' } }] }), 'rewards.0.badgeSlug');
    await bad(garba({ rewards: [{ kind: 'coins', coins: 0, trigger: { on: 'event' } }] }), 'rewards.0.coins');
  });
  test('referenced stream / temple / listing / pooja / aarti must exist in the catalog', async () => {
    const one = (task) => garba({ milestones: { items: [{ key: 'a', title: 'A', tasks: [task] }] } });
    await bad(one({ kind: 'live_darshan', config: { streamSlug: 'ghost', minutes: 3 } }), 'milestones.items.0.tasks.0.config.streamSlug');
    await bad(one({ kind: 'chadhava_offered', config: { listingSlug: 'ghost' } }), 'milestones.items.0.tasks.0.config.listingSlug');
    await bad(one({ kind: 'pooja_booked', config: { poojaSlug: 'ghost' } }), 'milestones.items.0.tasks.0.config.poojaSlug');
    await bad(one({ kind: 'bhajan_listened', config: { aartiSlug: 'ghost', minutes: 3 } }), 'milestones.items.0.tasks.0.config.aartiSlug');
    await bad(garba({ venue: { name: 'X', templeSlug: 'ghost' } }), 'venue.templeSlug');
    const good = await call('POST', '/admin/events', { body: one({ kind: 'pooja_booked', config: { poojaSlug: 'rudra' } }) });
    assert.equal(good.status, 201);
  });
  test('catalog unreachable: a draft saves, publishing is refused 503 catalog_unavailable', async () => {
    catalogDown = true;
    const draft = await call('POST', '/admin/events', { body: garba({ title: 'Unchecked draft' }) });
    assert.equal(draft.status, 201);
    const pub = await call('PUT', `/admin/events/${draft.body.id}`, { body: { published: true } });
    assert.equal(pub.status, 503);
    assert.equal(pub.body.code, 'catalog_unavailable');
    catalogDown = false;
    assert.equal((await call('PUT', `/admin/events/${draft.body.id}`, { body: { published: true } })).status, 200);
  });
  test('the real catalog client fails closed with no CATALOG_URL and maps 404 to "no"', async () => {
    await assert.rejects(createCatalogClient({}).exists('stream', 'x'), CatalogUnavailable);
    const seen = [];
    const fetchImpl = async (u) => {
      seen.push(new URL(u).pathname);
      if (u.includes('/live/gone')) return { status: 404, text: async () => '{"error":"x","code":"not_found"}' };
      if (u.includes('/public/content')) return { status: 200, text: async () => '{"temples":[{"slug":"somnath"}],"aartis":[]}' };
      if (u.includes('/poojas/')) return { status: 503, text: async () => '{"error":"x"}' };
      return { status: 200, text: async () => '{}' };
    };
    const c = createCatalogClient({ catalogUrl: 'http://catalog.test', secret: SECRET, serviceTimeoutMs: 500 }, { fetchImpl });
    assert.equal(await c.exists('stream', 'kashi'), true);
    assert.equal(await c.exists('stream', 'gone'), false);
    assert.equal(await c.exists('temple', 'somnath'), true);
    assert.equal(await c.exists('aarti', 'zzz'), false);
    await assert.rejects(c.exists('pooja', 'p'), CatalogUnavailable);
    assert.deepEqual(seen.slice(0, 2), ['/internal/catalog/live/kashi', '/internal/catalog/live/gone']);
  });
});

describe('event CRUD', () => {
  before(async () => { await Event.deleteMany({}); });
  let id;
  let slug;
  test('create: slug from the title, unique, tags slugified, keys generated, defaults applied', async () => {
    const r = await call('POST', '/admin/events', { body: garba() });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    id = r.body.id;
    slug = r.body.slug;
    assert.equal(slug, 'navratri-garba-night');
    assert.deepEqual(r.body.tags, ['navratri', 'garba']);
    assert.equal(r.body.status, 'draft');
    assert.equal(r.body.published, false);
    assert.equal(r.body.schemaVersion, 1);
    assert.deepEqual(r.body.blocks, ['schedule', 'venue', 'registration', 'milestones', 'rewards']);
    assert.deepEqual(r.body.milestones.items.map((m) => m.key), ['arrive', 'm1']);
    assert.deepEqual(r.body.milestones.items[1].tasks.map((t) => t.key), ['t1', 't2']);
    assert.equal(r.body.typeName, 'Garba Night');
    assert.equal(r.body.schedule.startsAt, '2026-03-10T13:00:00.000Z');
    const again = await call('POST', '/admin/events', { body: garba() });
    assert.equal(again.body.slug, 'navratri-garba-night-2');
  });
  test('reserved slugs are refused (explicit) or skipped (from the title)', async () => {
    const r = await call('POST', '/admin/events', { body: garba({ slug: 'badges' }) });
    assert.equal(r.status, 400);
    assert.ok(r.body.fields.slug);
    const t = await call('POST', '/admin/events', { body: garba({ title: 'Badges' }) });
    assert.equal(t.status, 201);
    assert.notEqual(t.body.slug, 'badges');
    const dup = await call('POST', '/admin/events', { body: garba({ slug: slug }) });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.code, 'slug_taken');
  });
  test('list, get, 404 for a bad or unknown id', async () => {
    assert.ok((await call('GET', '/admin/events')).body.length >= 2);
    assert.equal((await call('GET', `/admin/events/${id}`)).body.slug, slug);
    assert.equal((await call('GET', '/admin/events/000000000000000000000009')).status, 404);
    assert.equal((await call('GET', '/admin/events/not-an-id')).status, 404);
  });
  test('partial PUT merges; the slug never changes; removing a block drops it', async () => {
    const r = await call('PUT', `/admin/events/${id}`, { body: { summary: 'New summary', slug: 'hacked' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.summary, 'New summary');
    assert.equal(r.body.slug, slug);
    assert.equal(r.body.venue.name, 'Town Hall');
    const r2 = await call('PUT', `/admin/events/${id}`, { body: { blocks: ['schedule', 'milestones'] } });
    assert.deepEqual(r2.body.blocks, ['schedule', 'milestones']);
    assert.equal(r2.body.venue, undefined);
    assert.equal(r2.body.registration, undefined);
    const r3 = await call('PUT', `/admin/events/${id}`, { body: { content: { body: 'Hello' } } });
    assert.deepEqual(r3.body.blocks, ['schedule', 'milestones', 'content']);
    assert.equal(r3.body.content.body, 'Hello');
  });
  test('a removed milestone key is retired and cannot be reused', async () => {
    const e = (await call('GET', `/admin/events/${id}`)).body;
    const [first, second] = e.milestones.items;
    const r = await call('PUT', `/admin/events/${id}`, { body: { milestones: { ...e.milestones, items: [second] } } });
    assert.equal(r.status, 200);
    const reuse = await call('PUT', `/admin/events/${id}`, { body: { milestones: { ...e.milestones, items: [second, { ...first }] } } });
    assert.equal(reuse.status, 400);
    assert.ok(reuse.body.fields['milestones.items.1.key']);
  });
  test('an invalid update leaves the stored event untouched', async () => {
    const r = await call('PUT', `/admin/events/${id}`, { body: { title: '' } });
    assert.equal(r.status, 400);
    assert.equal((await call('GET', `/admin/events/${id}`)).body.title, 'Navratri Garba Night');
  });
  test('delete works, but not once devotees have joined', async () => {
    const mk = await call('POST', '/admin/events', { body: garba({ title: 'Has guests' }) });
    await Registration.create({ uid: 'u1', eventSlug: mk.body.slug, status: 'joined' });
    const r = await call('DELETE', `/admin/events/${mk.body.id}`);
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'in_use');
    await Registration.deleteMany({});
    assert.equal((await call('DELETE', `/admin/events/${mk.body.id}`)).status, 200);
    assert.equal((await call('GET', `/admin/events/${mk.body.id}`)).status, 404);
  });
  test('task-kinds is not swallowed by :id; stats are honest nulls while nothing is measurable (no registration block, no progress)', async () => {
    const k = await call('GET', '/admin/events/task-kinds');
    assert.equal(k.status, 200);
    assert.equal(k.body.length, 9);
    assert.deepEqual(Object.keys(k.body[0]).sort(), ['configSchema', 'interactive', 'kind', 'minAppVersion', 'signals', 'title']);
    const s = await call('GET', `/admin/events/${id}/stats`);
    assert.equal(s.body.joined, null);
    assert.equal(s.body.finished, null);
    assert.deepEqual(s.body.perMilestone, [{ key: 'm1', completedCount: 0, completedPct: null }]);
    assert.equal(s.body.checkedIn, null);
  });
});

describe('event types and badges', () => {
  test('type CRUD: slug from name, hex colour, duplicates 409, delete blocked while events use it', async () => {
    assert.equal((await call('GET', '/admin/event-types')).body.length, 4);
    const bad = await call('POST', '/admin/event-types', { body: { name: 'Kirtan', color: 'red' } });
    assert.equal(bad.status, 400);
    assert.ok(bad.body.fields.color);
    const r = await call('POST', '/admin/event-types', { body: { name: 'Kirtan Evening', color: '#112233', defaults: { blocks: ['schedule'], junk: 1 } } });
    assert.equal(r.status, 201);
    assert.equal(r.body.slug, 'kirtan-evening');
    assert.deepEqual(r.body.defaults, { blocks: ['schedule'] });
    assert.equal((await call('POST', '/admin/event-types', { body: { name: 'Kirtan Evening' } })).status, 409);
    const up = await call('PUT', `/admin/event-types/${r.body.id}`, { body: { enabled: false, nameHi: 'कीर्तन' } });
    assert.equal(up.body.enabled, false);
    assert.equal(up.body.slug, 'kirtan-evening');
    const used = (await call('GET', '/admin/event-types')).body.find((t) => t.slug === 'garba-night');
    const del = await call('DELETE', `/admin/event-types/${used.id}`);
    assert.equal(del.status, 409);
    assert.equal(del.body.code, 'in_use');
    assert.equal((await call('PUT', `/admin/event-types/${used.id}`, { body: { slug: 'renamed' } })).status, 409);
    assert.equal((await call('DELETE', `/admin/event-types/${r.body.id}`)).body.ok, true);
  });
  test('badge CRUD; a badge a reward uses cannot be deleted; events can then reference it', async () => {
    const b = await call('POST', '/admin/event-badges', { body: { name: 'Yatri', nameHi: 'यात्री', art: '/uploads/yatri.png' } });
    assert.equal(b.status, 201);
    assert.equal(b.body.slug, 'yatri');
    assert.equal((await call('POST', '/admin/event-badges', { body: { name: 'Yatri' } })).status, 409);
    assert.equal((await call('POST', '/admin/event-badges', { body: { name: 'x', art: 'javascript:1' } })).status, 400);
    const ev = await call('POST', '/admin/events', { body: garba({ title: 'With badge', rewards: [{ kind: 'badge', badgeSlug: 'yatri', trigger: { on: 'event' } }] }) });
    assert.equal(ev.status, 201, JSON.stringify(ev.body));
    const del = await call('DELETE', `/admin/event-badges/${b.body.id}`);
    assert.equal(del.status, 409);
    await call('DELETE', `/admin/events/${ev.body.id}`);
    assert.equal((await call('DELETE', `/admin/event-badges/${b.body.id}`)).status, 200);
    assert.equal(await Badge.countDocuments(), 0);
  });
});

describe('public reads', () => {
  let pubSlug;
  before(async () => {
    await Event.deleteMany({});
    const mk = async (o) => (await call('POST', '/admin/events', { body: garba(o) })).body;
    const a = await mk({ title: 'Garba soon', published: true, tags: ['navratri'] });
    pubSlug = a.slug;
    await mk({ title: 'Hidden draft' });
    await mk({
      title: 'Far away', published: true, tags: ['yatra'], typeSlug: 'yatra', blocks: ['schedule', 'milestones'],
      schedule: { mode: 'multiday', startsAt: '2026-06-01T00:00:00Z', endsAt: '2026-06-05T00:00:00Z' },
      milestones: { order: 'daily', items: [{ title: 'Day 1', opensAt: '2026-06-01T00:00:00Z', tasks: [{ kind: 'self_mark', title: 'Done' }] }, { title: 'Day 2', opensAt: '2026-06-02T00:00:00Z', tasks: [{ kind: 'self_mark', title: 'Done' }] }] },
    });
    await mk({
      title: 'Old news', published: true, blocks: ['schedule'], schedule: { mode: 'single', startsAt: '2026-01-01T10:00:00Z', endsAt: '2026-01-01T12:00:00Z' },
    });
    await mk({ title: 'Open vrat', published: true, typeSlug: 'vrat', blocks: ['schedule', 'milestones', 'content'], schedule: { mode: 'always' }, content: { body: 'hi' }, milestones: { items: [{ title: 'Fast', tasks: [{ kind: 'self_mark' }] }] } });
  });

  test('list: published and not ended only, split into sections, with honest nulls', async () => {
    const r = await call('GET', '/public/events', { headers: mobile() });
    assert.equal(r.status, 200);
    const { sections, types, tags } = r.body;
    assert.deepEqual(Object.keys(sections).sort(), ['thisWeek', 'upcoming']); // a guest gets no continue/mine/completed
    assert.deepEqual(sections.thisWeek.map((c) => c.title), ['Open vrat', 'Garba soon']);
    assert.deepEqual(sections.upcoming.map((c) => c.title), ['Far away']);
    assert.deepEqual(types.map((t) => t.slug), ['garba-night', 'yatra', 'vrat', 'japa']);
    assert.deepEqual(Object.keys(types[0]).sort(), ['color', 'name', 'nameHi', 'slug']);
    assert.deepEqual(tags, ['garba', 'navratri', 'yatra']); // sorted, distinct, published + not ended only
    assert.equal(r.body.badgesCount, 0);
    const card = sections.thisWeek.find((c) => c.slug === pubSlug);
    assert.equal(card.status, 'registration_open'); // free registration, no window, capacity not known to be reached
    assert.equal(card.registered, 0); // a registration block: the real count
    assert.equal(card.spotsLeft, 100);
    assert.equal(card.full, false);
    assert.equal(card.typeName, 'Garba Night');
    assert.equal(card.venueLabel, 'Town Hall, Pune');
    assert.deepEqual(card.tags, ['navratri']);
    assert.equal(card.theme.color, '#B8321E'); // resolved from the type
    assert.deepEqual(card.theme.gradient, ['#B8321E', '#E8913A']);
    assert.equal(card.milestoneCount, 2);
    assert.equal(card.rewardLabel, '65 coins');
    assert.equal(card.startsAt, '2026-03-10T13:00:00.000Z');
    assert.equal('progress' in card, false);
    assert.equal(sections.upcoming[0].venueLabel, null);
  });
  test('a signed-in devotee gets the (empty) personal sections', async () => {
    const r = await call('GET', '/public/events', { headers: mobile('uid-1') });
    assert.deepEqual(r.body.sections.continue, []);
    assert.deepEqual(r.body.sections.mine, []);
    assert.deepEqual(r.body.sections.completed, { count: 0, titles: [] });
  });
  test('an event theme beats the type colour; status follows the clock', async () => {
    const e = await Event.findOne({ slug: pubSlug });
    await Event.updateOne({ _id: e._id }, { $set: { theme: { color: '#112233' } } });
    clock = new Date('2026-03-10T14:30:00Z');
    const r = await call('GET', '/public/events', { headers: mobile() });
    const card = r.body.sections.thisWeek.find((c) => c.slug === pubSlug);
    assert.equal(card.status, 'live');
    assert.equal(card.theme.color, '#112233');
    clock = new Date('2026-03-05T06:00:00Z');
  });
  test('detail: card + only the present blocks, locked milestones summarised, me null', async () => {
    const r = await call('GET', `/public/events/${pubSlug}`, { headers: mobile() });
    assert.equal(r.status, 200);
    const e = r.body.event;
    assert.equal(e.me, null);
    assert.deepEqual(e.blocks, ['schedule', 'venue', 'registration', 'milestones', 'rewards']);
    assert.equal('content' in e, false);
    assert.equal(e.registration.registered, 0);
    assert.equal(e.registration.spotsLeft, 100);
    assert.equal(e.registration.capacity, 100);
    assert.equal(e.venue.name, 'Town Hall');
    const [m1, m2] = e.milestones.items;
    assert.equal(m1.locked, false);
    assert.equal(m1.done, false);
    assert.equal(m1.completedAt, null);
    assert.equal(m1.tasks[0].kind, 'qr_checkin');
    assert.equal(m1.tasks[0].done, false);
    assert.equal(m1.tasks[0].completedAt, null);
    assert.deepEqual(m1.tasks[0].state, {});
    assert.equal(m2.locked, true); // opens later today
    assert.equal(m2.done, false);
    assert.equal('tasks' in m2, false);
    assert.equal(m2.opensAt, '2026-03-10T14:00:00.000Z');
    assert.equal(e.schemaVersion, 1);
    const vrat = (await call('GET', '/public/events/open-vrat', { headers: mobile() })).body.event;
    assert.equal(vrat.status, 'live');
    assert.deepEqual(vrat.blocks, ['schedule', 'milestones', 'content']);
  });
  test('counter tasks carry their config for the app', async () => {
    const e = await Event.findOne({ slug: pubSlug });
    clock = new Date('2026-03-10T15:00:00Z');
    const r = await call('GET', `/public/events/${e.slug}`, { headers: mobile() });
    const task = r.body.event.milestones.items[1].tasks[0];
    assert.equal(task.config.target, 108);
    assert.equal(task.interactive, true);
    assert.match(task.summary, /108/);
    clock = new Date('2026-03-05T06:00:00Z');
  });
  test('unpublished and unknown slugs are 404 not_found', async () => {
    const draft = await Event.findOne({ title: 'Hidden draft' });
    for (const s of [draft.slug, 'nope']) {
      const r = await call('GET', `/public/events/${s}`, { headers: mobile() });
      assert.equal(r.status, 404);
      assert.equal(r.body.code, 'not_found');
    }
  });
  test('the public payload carries no devotee data and no internal fields', async () => {
    const text = JSON.stringify((await call('GET', `/public/events/${pubSlug}`, { headers: mobile() })).body);
    for (const leak of ['retiredKeys', '"_id"', 'passCode', 'uid']) assert.equal(text.includes(leak), false, leak);
  });
});
