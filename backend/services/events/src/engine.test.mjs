// Phase 2: registration, the completion engine (self_mark + counter), rewards, badges, the sweeper, `me` / sections, admin stats + participants.
// Needs a MongoDB. Run: TEST_MONGODB_URI=mongodb://127.0.0.1:27193/x node --test --test-concurrency=1 src/engine.test.mjs
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, test } from 'node:test';

import { permissionsFor, signServiceToken } from '@bhakti/common';
import mongoose from 'mongoose';

import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { connectDb } from './db.js';
import { sweep } from './engine/rewards.js';
import { Badge, Event, EventResult, MilestoneResult, Registration, Seats, TaskProgress, UserBadge } from './models/index.js';
import { seedEvents } from './seed.js';
import { startWalletStub } from './wallet-stub.mjs';

const SECRET = 'test-secret-test-secret-1234';
const SESSION = 'session-secret-session-secret-12';
const base = new URL(process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27193/x');

let clock = new Date('2026-03-10T06:00:00Z');
const at = (iso) => { clock = new Date(iso); };
const tick = (ms = 500) => { clock = new Date(clock.getTime() + ms); };

let server; let url; let wallet; let app;
const names = new Map([['dir-1', { name: 'Asha Rao', contact: '+919800000001' }]]);
const directory = { lookup: async (uids) => new Map(uids.filter((u) => names.has(u)).map((u) => [u, names.get(u)])) };

before(async () => {
  wallet = await startWalletStub({ secret: SECRET });
  const config = loadConfig({
    INTERNAL_JWT_SECRET: SECRET, MONGODB_URI: `${base.protocol}//${base.host}`, DB_NAME: 'events_engine_test', WALLET_URL: wallet.url,
    ADMIN_SESSION_SECRET: SESSION, SERVICE_TIMEOUT_MS: '400', SWEEP_EVERY_MS: '0',
  });
  await connectDb(config);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  await seedEvents();
  await Badge.create([{ slug: 'pilgrim', name: 'Pilgrim', nameHi: 'यात्री', art: '/uploads/p.png', description: 'Finished the yatra' }, { slug: 'garba-star', name: 'Garba Star' }]);
  app = createApp(config, { isReady: () => true, logger: { info() {}, warn() {}, error() {} }, catalog: { exists: async () => true }, now: () => clock, directory });
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
const operator = (role) => ({ authorization: `Bearer ${signServiceToken({ iss: 'admin-bff', sub: 'op1', role, perms: permissionsFor(role), ctx: { username: 'tester' } }, { secret: SECRET })}` });

async function call(method, path, { headers = operator('admin'), body } = {}) {
  const res = await fetch(`${url}/internal/events${path}`, {
    method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
const get = (uid, path) => call('GET', `/public${path}`, { headers: devotee(uid) });
const join = (uid, slug, body = {}) => call('POST', `/public/events/${slug}/join`, { headers: devotee(uid), body });
const leave = (uid, slug) => call('POST', `/public/events/${slug}/leave`, { headers: devotee(uid), body: {} });
const report = (uid, slug, m, t, body = {}) => call('POST', `/public/events/${slug}/milestones/${m}/tasks/${t}/progress`, { headers: devotee(uid), body });
const code = (r) => [r.status, r.body?.code];

const D = (iso) => new Date(iso);
const self = (key = 't1') => ({ key, kind: 'self_mark', title: 'Mark it', titleHi: '', config: {} });
const counter = (key, target, label = 'Om') => ({ key, kind: 'counter', title: `Chant ${target}`, titleHi: '', config: { label, target } });
const ms = (key, tasks, o = {}) => ({ key, title: `Milestone ${key}`, titleHi: `चरण ${key}`, opensAt: null, coins: 0, link: null, completion: { rule: 'all', n: null }, tasks, ...o });
const mkEvent = (slug, o = {}) => Event.create({
  slug, title: `Event ${slug}`, titleHi: '', typeSlug: 'yatra', tags: [], published: true, theme: null,
  blocks: ['schedule', 'milestones'], schedule: { mode: 'always', startsAt: null, endsAt: null },
  milestones: { order: 'any', missed: 'catch_up_next', completion: { rule: 'all', n: null }, items: [ms('m1', [self()])] },
  ...o,
});
const FREE = (o = {}) => ({ mode: 'free', coins: 0, capacity: null, opensAt: null, closesAt: null, pass: true, fields: [], ...o });

/* ──────────────────────────────────────────────────────────────── guards on the devotee routes ── */
describe('who may call the devotee routes', () => {
  before(async () => { await mkEvent('guard', { blocks: ['schedule', 'registration', 'milestones'], registration: FREE() }); });
  test('join / leave / progress / me need a devotee: no sub = 401, and an operator token is NOT a devotee', async () => {
    for (const [m, p] of [['POST', '/public/events/guard/join'], ['POST', '/public/events/guard/leave'], ['POST', '/public/events/guard/milestones/m1/tasks/t1/progress'], ['GET', '/public/me/events'], ['GET', '/public/me/badges']]) {
      assert.equal((await call(m, p, { headers: devotee(null), body: m === 'POST' ? {} : undefined })).status, 401, `guest ${p}`);
      assert.equal((await call(m, p, { headers: operator('admin'), body: m === 'POST' ? {} : undefined })).status, 401, `operator ${p}: an operator's sub is not a devotee`);
    }
    assert.equal((await call('GET', '/public/events', { headers: operator('admin') })).status, 200);
    const asOp = await call('GET', '/public/events', { headers: operator('admin') });
    assert.equal('continue' in asOp.body.sections, false, 'an operator is not a devotee: no personal sections');
  });
  test('unknown or unpublished events are 404', async () => {
    await mkEvent('draft-one', { published: false, blocks: ['registration'], registration: FREE() });
    for (const s of ['draft-one', 'nope']) {
      assert.deepEqual(code(await join('u1', s)), [404, 'not_found']);
      assert.deepEqual(code(await leave('u1', s)), [404, 'not_found']);
      assert.deepEqual(code(await report('u1', s, 'm1', 't1')), [404, 'not_found']);
    }
  });
});

/* ───────────────────────────────────────────────────────────────────────────── registration ── */
describe('joining and leaving', () => {
  before(async () => {
    await mkEvent('navratri-garba', {
      blocks: ['schedule', 'registration', 'milestones'], schedule: { mode: 'single', startsAt: D('2026-03-12T13:00:00Z'), endsAt: D('2026-03-12T17:00:00Z') },
      registration: FREE({
        fields: [
          { key: 'party', label: 'Party size', labelHi: '', type: 'number', required: true, options: [] },
          { key: 'diet', label: 'Diet', labelHi: '', type: 'choice', required: false, options: ['veg', 'jain'] },
          { key: 'note', label: 'Note', labelHi: '', type: 'text', required: false, options: [] },
        ],
      }),
    });
  });

  test('join: a pass `<PREFIX>-<4 chars>`, answers stored (typed, unknown keys dropped), `me` returned; a second call is the same registration', async () => {
    const a = await join('j1', 'navratri-garba', { requestId: 'r1', answers: { party: '4', diet: 'jain', note: ' hi ', evil: 'x' } });
    assert.equal(a.status, 200, JSON.stringify(a.body));
    assert.equal(a.body.registration.status, 'joined');
    assert.match(a.body.registration.passCode, /^NAV-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
    assert.deepEqual(a.body.registration.answers, { party: 4, diet: 'jain', note: 'hi' });
    assert.equal(a.body.registration.joinedAt, clock.toISOString());
    assert.deepEqual(a.body.me, { registered: true, passCode: a.body.registration.passCode, answers: { party: 4, diet: 'jain', note: 'hi' }, progress: { done: 0, total: 1 }, currentMilestoneKey: null, completed: false });
    tick(60_000);
    const b = await join('j1', 'navratri-garba', { requestId: 'r2', answers: { party: 9 } });
    assert.equal(b.status, 200, 'already_joined is not an error');
    assert.deepEqual(b.body.registration, a.body.registration, 'same pass, same answers, same time');
    assert.equal(await Registration.countDocuments({ uid: 'j1', eventSlug: 'navratri-garba' }), 1);
  });

  test('custom fields: required -> 400 missing_field (+field); wrong type / not an option -> 400 bad_answer', async () => {
    assert.deepEqual(code(await join('j2', 'navratri-garba', { answers: {} })), [400, 'missing_field']);
    assert.equal((await join('j2', 'navratri-garba', { answers: {} })).body.field, 'party');
    assert.equal((await join('j2', 'navratri-garba', { answers: { party: '  ' } })).body.code, 'missing_field');
    assert.deepEqual(code(await join('j2', 'navratri-garba')), [400, 'missing_field'], 'no answers at all');
    const bad1 = await join('j2', 'navratri-garba', { answers: { party: 'lots' } });
    assert.deepEqual([bad1.status, bad1.body.code, bad1.body.field], [400, 'bad_answer', 'party']);
    const bad2 = await join('j2', 'navratri-garba', { answers: { party: 2, diet: 'meat' } });
    assert.deepEqual([bad2.status, bad2.body.code, bad2.body.field], [400, 'bad_answer', 'diet']);
    assert.deepEqual(code(await join('j2', 'navratri-garba', { answers: 'nope' })), [400, 'bad_answer']);
    assert.equal(await Registration.countDocuments({ uid: 'j2' }), 0, 'nothing was written');
    assert.equal((await Seats.findOne({ eventSlug: 'navratri-garba' })).taken, 1, 'and no seat was kept');
  });

  test('the registration window and the end of the event close joining (409 closed); an open window works even after the start', async () => {
    await mkEvent('window', { blocks: ['schedule', 'registration'], schedule: { mode: 'single', startsAt: D('2026-03-10T18:00:00Z'), endsAt: D('2026-03-10T22:00:00Z') }, registration: FREE({ opensAt: D('2026-03-10T08:00:00Z'), closesAt: D('2026-03-10T20:00:00Z') }) });
    at('2026-03-10T07:59:00Z');
    assert.deepEqual(code(await join('w1', 'window')), [409, 'closed']);
    at('2026-03-10T08:00:00Z');
    assert.equal((await join('w1', 'window')).status, 200);
    at('2026-03-10T19:00:00Z'); // started, window still open: joining stays possible
    assert.equal((await join('w2', 'window')).status, 200);
    at('2026-03-10T20:00:00Z');
    assert.deepEqual(code(await join('w3', 'window')), [409, 'closed']);
    assert.equal((await join('w1', 'window')).status, 200, 'but a repeat by someone already in is still the same registration');
    await mkEvent('over', { blocks: ['schedule', 'registration'], schedule: { mode: 'single', startsAt: D('2026-03-10T01:00:00Z'), endsAt: D('2026-03-10T02:00:00Z') }, registration: FREE() });
    assert.deepEqual(code(await join('w1', 'over')), [409, 'closed'], 'the event has ended');
    at('2026-03-10T06:00:00Z');
  });

  test('paid events answer 409 paid_not_available; an event with no registration takes none; no pass when pass is off', async () => {
    await mkEvent('paid', { blocks: ['registration'], registration: FREE({ mode: 'coins', coins: 50 }) });
    assert.deepEqual(code(await join('p1', 'paid')), [409, 'paid_not_available']);
    await mkEvent('nojoin', { blocks: ['registration'], registration: FREE({ mode: 'none' }) });
    assert.deepEqual(code(await join('p1', 'nojoin')), [409, 'closed']);
    await mkEvent('noblock', {});
    assert.deepEqual(code(await join('p1', 'noblock')), [409, 'closed']);
    await mkEvent('nopass', { blocks: ['registration'], registration: FREE({ pass: false }) });
    const r = await join('p1', 'nopass');
    assert.equal(r.body.registration.passCode, null);
    assert.equal(r.body.me.passCode, null);
    assert.equal((await Registration.findOne({ uid: 'p1', eventSlug: 'nopass' })).passCode, '');
  });

  test('pass codes are unique within an event', async () => {
    await mkEvent('many', { blocks: ['registration'], registration: FREE() });
    const rs = await Promise.all(Array.from({ length: 40 }, (_, i) => join(`many-${i}`, 'many')));
    assert.ok(rs.every((r) => r.status === 200));
    assert.equal(new Set(rs.map((r) => r.body.registration.passCode)).size, 40);
  });

  test('capacity is atomic: 15 parallel joins for 3 seats = exactly 3 in, 12 `full`; spots/full show it; a leave frees a seat', async () => {
    await mkEvent('cap3', { blocks: ['schedule', 'registration'], schedule: { mode: 'single', startsAt: D('2026-03-20T10:00:00Z'), endsAt: D('2026-03-20T12:00:00Z') }, registration: FREE({ capacity: 3 }) });
    const rs = await Promise.all(Array.from({ length: 15 }, (_, i) => join(`c-${i}`, 'cap3')));
    const ok = rs.filter((r) => r.status === 200);
    const full = rs.filter((r) => r.status === 409);
    assert.equal(ok.length, 3);
    assert.equal(full.length, 12);
    assert.ok(full.every((r) => r.body.code === 'full'));
    assert.equal(await Registration.countDocuments({ eventSlug: 'cap3', status: 'joined' }), 3);
    assert.equal((await Seats.findOne({ eventSlug: 'cap3' })).taken, 3);
    const card = (await get(null, '/events')).body.sections.upcoming.find((c) => c.slug === 'cap3');
    assert.deepEqual([card.registered, card.spotsLeft, card.full, card.status], [3, 0, true, 'scheduled']);
    const winner = ok[0].body.me && (await Registration.findOne({ eventSlug: 'cap3', status: 'joined' })).uid;
    assert.equal((await leave(winner, 'cap3')).status, 204);
    const after = (await get(null, '/events')).body.sections.upcoming.find((c) => c.slug === 'cap3');
    assert.deepEqual([after.registered, after.spotsLeft, after.full], [2, 1, false]);
    const late = await Promise.all(['late-1', 'late-2', 'late-3'].map((u) => join(u, 'cap3')));
    assert.deepEqual(late.map((r) => r.status).sort(), [200, 409, 409], 'one freed seat, three hopefuls');
    assert.equal((await Seats.findOne({ eventSlug: 'cap3' })).taken, 3);
  });

  test('ten parallel joins by the SAME devotee: one registration, one seat, one pass', async () => {
    await mkEvent('same', { blocks: ['registration'], registration: FREE({ capacity: 5 }) });
    const rs = await Promise.all(Array.from({ length: 10 }, () => join('twin', 'same')));
    assert.ok(rs.every((r) => r.status === 200));
    assert.equal(new Set(rs.map((r) => r.body.registration.passCode)).size, 1);
    assert.equal(await Registration.countDocuments({ eventSlug: 'same' }), 1);
    assert.equal((await Seats.findOne({ eventSlug: 'same' })).taken, 1);
  });

  test('leave: before the start frees the spot and voids the pass (204); a rejoin gets a fresh pass; after the start it is 409 started; not joined = 204', async () => {
    const first = await Registration.findOne({ uid: 'j1', eventSlug: 'navratri-garba' });
    const oldPass = first.passCode;
    assert.equal((await leave('j1', 'navratri-garba')).status, 204);
    const gone = await Registration.findOne({ uid: 'j1', eventSlug: 'navratri-garba' });
    assert.deepEqual([gone.status, gone.passCode], ['cancelled', '']);
    assert.equal((await get('j1', '/events/navratri-garba')).body.event.me.registered, false);
    assert.equal((await leave('j1', 'navratri-garba')).status, 204, 'leaving twice is fine');
    assert.equal((await leave('never-joined', 'navratri-garba')).status, 204);
    const again = await join('j1', 'navratri-garba', { answers: { party: 1 } });
    assert.equal(again.status, 200);
    assert.match(again.body.registration.passCode, /^NAV-/);
    assert.equal(await Registration.countDocuments({ uid: 'j1', eventSlug: 'navratri-garba' }), 1, 'the same row is revived');
    assert.equal((await Seats.findOne({ eventSlug: 'navratri-garba' })).taken, 1);
    void oldPass;
    at('2026-03-12T13:00:00Z');
    const late = await leave('j1', 'navratri-garba');
    assert.deepEqual(code(late), [409, 'started']);
    assert.equal((await Registration.findOne({ uid: 'j1', eventSlug: 'navratri-garba' })).status, 'joined');
    at('2026-03-10T06:00:00Z');
  });

  test('leaving keeps the progress rows (an `always` event can be left at any time)', async () => {
    await mkEvent('always-reg', { blocks: ['schedule', 'registration', 'milestones'], registration: FREE() });
    await join('lv', 'always-reg');
    assert.equal((await report('lv', 'always-reg', 'm1', 't1')).status, 200);
    assert.equal((await leave('lv', 'always-reg')).status, 204);
    assert.equal(await TaskProgress.countDocuments({ uid: 'lv', eventSlug: 'always-reg' }), 1);
    assert.equal(await MilestoneResult.countDocuments({ uid: 'lv', eventSlug: 'always-reg' }), 1);
    assert.deepEqual(code(await report('lv', 'always-reg', 'm1', 't1')), [403, 'not_registered'], 'but no new progress without a registration');
  });
});

/* ───────────────────────────────────────────────────────────────────────── progress preconditions ── */
describe('progress: what is refused', () => {
  const daily = (slug, missed) => mkEvent(slug, {
    schedule: { mode: 'multiday', startsAt: D('2026-03-10T00:00:00+05:30'), endsAt: D('2026-03-14T00:00:00+05:30') },
    milestones: { order: 'daily', missed, completion: { rule: 'all', n: null }, items: ['d1', 'd2', 'd3'].map((k, i) => ms(k, [self()], { opensAt: D(`2026-03-${10 + i}T00:00:00+05:30`) })) },
  });

  test('registered when the event asks (403 not_registered); unknown milestone / task 404; not started = 409 locked; ended = 409 closed', async () => {
    await mkEvent('reg-first', { blocks: ['schedule', 'registration', 'milestones'], schedule: { mode: 'single', startsAt: D('2026-03-10T07:00:00Z'), endsAt: D('2026-03-10T09:00:00Z') }, registration: FREE() });
    assert.deepEqual(code(await report('r1', 'reg-first', 'm1', 't1')), [403, 'not_registered']);
    await join('r1', 'reg-first');
    const early = await report('r1', 'reg-first', 'm1', 't1');
    assert.deepEqual(code(early), [409, 'locked']);
    assert.deepEqual([early.body.notStarted, early.body.opensAt], [true, '2026-03-10T07:00:00.000Z']);
    assert.equal(await TaskProgress.countDocuments({ eventSlug: 'reg-first' }), 0);
    assert.deepEqual(code(await report('r1', 'reg-first', 'nope', 't1')), [404, 'not_found']);
    assert.deepEqual(code(await report('r1', 'reg-first', 'm1', 'nope')), [404, 'not_found']);
    at('2026-03-10T07:30:00Z');
    assert.equal((await report('r1', 'reg-first', 'm1', 't1')).status, 200);
    await mkEvent('reg-over', { blocks: ['schedule', 'milestones'], schedule: { mode: 'multiday', startsAt: D('2026-03-01T00:00:00Z'), endsAt: D('2026-03-02T00:00:00Z') } });
    assert.deepEqual(code(await report('r1', 'reg-over', 'm1', 't1')), [409, 'closed']);
    at('2026-03-10T06:00:00Z');
  });

  test('an event with no registration needs none: progress works without a Registration row, and counts as taking part', async () => {
    await mkEvent('open-vrat', { blocks: ['schedule', 'milestones'] });
    const r = await report('v1', 'open-vrat', 'm1', 't1');
    assert.equal(r.status, 200);
    assert.equal(await Registration.countDocuments({ eventSlug: 'open-vrat' }), 0);
    assert.deepEqual(r.body.me, { registered: false, passCode: null, answers: {}, progress: { done: 1, total: 1 }, currentMilestoneKey: null, completed: true });
    const list = (await get('v1', '/events')).body.sections;
    assert.deepEqual(list.mine.map((c) => c.slug), ['open-vrat']);
  });

  test('a milestone that opens later is 409 locked + opensAt, and opens exactly then (the phone clock is irrelevant)', async () => {
    await daily('dl', 'catch_up_any');
    at('2026-03-10T10:00:00+05:30');
    const early = await report('d-u', 'dl', 'd2', 't1');
    assert.deepEqual(code(early), [409, 'locked']);
    assert.equal(early.body.opensAt, '2026-03-10T18:30:00.000Z');
    at('2026-03-11T00:00:00+05:30');
    assert.equal((await report('d-u', 'dl', 'd2', 't1')).status, 200);
    at('2026-03-10T06:00:00Z');
  });

  test('sequential: the next milestone stays locked until the one before is complete', async () => {
    await mkEvent('seq', { milestones: { order: 'sequential', missed: 'catch_up_next', completion: { rule: 'all', n: null }, items: [ms('s1', [self()]), ms('s2', [self()]), ms('s3', [self()])] } });
    assert.deepEqual(code(await report('sq', 'seq', 's2', 't1')), [409, 'locked']);
    const detail = (await get('sq', '/events/seq')).body.event.milestones.items;
    assert.deepEqual(detail.map((m) => [m.key, m.locked]), [['s1', false], ['s2', true], ['s3', true]]);
    assert.equal('tasks' in detail[1], false);
    assert.equal((await report('sq', 'seq', 's1', 't1')).status, 200);
    assert.deepEqual(code(await report('sq', 'seq', 's3', 't1')), [409, 'locked']);
    assert.equal((await report('sq', 'seq', 's2', 't1')).status, 200);
    assert.equal((await report('sq', 'seq', 's3', 't1')).status, 200);
  });

  test('daily + lock_at_end: a missed day cannot be made up (409 locked, missed:true)', async () => {
    await daily('lock-end', 'lock_at_end');
    at('2026-03-11T10:00:00+05:30'); // day 2: day 1 is gone
    const missed = await report('m1', 'lock-end', 'd1', 't1');
    assert.deepEqual(code(missed), [409, 'locked']);
    assert.equal(missed.body.missed, true);
    const view = (await get('m1', '/events/lock-end')).body.event.milestones.items;
    assert.deepEqual(view.map((m) => [m.key, m.locked, !!m.missed]), [['d1', true, true], ['d2', false, false], ['d3', true, false]]);
    assert.equal((await report('m1', 'lock-end', 'd2', 't1')).status, 200);
    at('2026-03-10T06:00:00Z');
  });

  test('daily + catch_up_next: yesterday can be made up today, the day before cannot', async () => {
    await daily('next-day', 'catch_up_next');
    at('2026-03-11T22:00:00+05:30'); // day 2, late
    assert.equal((await report('m2', 'next-day', 'd1', 't1')).status, 200, 'day 1 is open through the end of day 2');
    at('2026-03-12T09:00:00+05:30'); // day 3
    assert.equal((await report('m3', 'next-day', 'd1', 't1')).body.missed, true, 'day 1 is gone on day 3');
    assert.equal((await report('m3', 'next-day', 'd2', 't1')).status, 200);
    at('2026-03-10T06:00:00Z');
  });

  test('daily + catch_up_any: any earlier day stays open until the event ends', async () => {
    await daily('any-day', 'catch_up_any');
    at('2026-03-13T12:00:00+05:30');
    for (const k of ['d1', 'd2', 'd3']) assert.equal((await report('m4', 'any-day', k, 't1')).status, 200, k);
    at('2026-03-10T06:00:00Z');
  });

  test('task kinds without an engine yet answer 422 task_not_supported and write nothing', async () => {
    await mkEvent('later-kinds', { milestones: { order: 'any', missed: 'catch_up_next', completion: { rule: 'all', n: null }, items: [ms('k1', [
      { key: 'live', kind: 'live_darshan', title: 'Watch', titleHi: '', config: { streamSlug: 'kashi', minutes: 5 } },
      { key: 'bhajan', kind: 'bhajan_listened', title: 'Listen', titleHi: '', config: { aartiSlug: 'om-jai', minutes: 5 } },
      { key: 'chad', kind: 'chadhava_offered', title: 'Offer', titleHi: '', config: { listingSlug: 'diya' } },
      { key: 'pooja', kind: 'pooja_booked', title: 'Book', titleHi: '', config: { poojaSlug: 'rudra' } },
      { key: 'loc', kind: 'location', title: 'Be there', titleHi: '', config: { lat: 1, lng: 1, radiusM: 100 } },
      { key: 'qr', kind: 'qr_checkin', title: 'Check in', titleHi: '', config: {} },
      { key: 'photo', kind: 'photo', title: 'Photo', titleHi: '', config: { needsApproval: true } },
      { key: 'ghost', kind: 'no_such_kind', title: 'Ghost', titleHi: '', config: {} },
    ])] } });
    for (const t of ['live', 'bhajan', 'chad', 'pooja', 'loc', 'qr', 'photo', 'ghost']) {
      assert.deepEqual(code(await report('k1', 'later-kinds', 'k1', t, { seconds: 20 })), [422, 'task_not_supported'], t);
    }
    assert.equal(await TaskProgress.countDocuments({ eventSlug: 'later-kinds' }), 0);
  });
});

/* ──────────────────────────────────────────────────────────────────────── counter and self_mark ── */
describe('counter and self_mark tasks', () => {
  before(async () => { await mkEvent('chant', { milestones: { order: 'any', missed: 'catch_up_next', completion: { rule: 'all', n: null }, items: [ms('c1', [counter('t1', 108)]), ms('c2', [counter('t1', 3)])] } }); });

  test('add accumulates; a report returns the task state; the count never passes the target; done at the target', async () => {
    const a = await report('ct', 'chant', 'c1', 't1', { add: 50 });
    assert.equal(a.status, 200);
    assert.deepEqual(a.body.task, { key: 't1', done: false, completedAt: null, state: { count: 50 } });
    assert.deepEqual([a.body.milestone.done, a.body.milestone.justCompleted, a.body.event.done, a.body.completion], [false, false, false, null]);
    assert.deepEqual(a.body.awarded, { coins: 0, badges: [] });
    tick();
    const b = await report('ct', 'chant', 'c1', 't1', { add: 200 });
    assert.deepEqual([b.body.task.state, b.body.task.done], [{ count: 108 }, true], 'clamped to the target');
    assert.equal(b.body.task.completedAt, clock.toISOString());
    assert.equal(b.body.milestone.justCompleted, true);
    assert.equal(b.body.completion.how[0].text, 'Counted 108');
    assert.equal(b.body.completion.how[0].textHi, '108 गिनती पूरी');
  });

  test('set resumes (only upwards, never above the target); add must be 1..200', async () => {
    const s1 = await report('cs', 'chant', 'c1', 't1', { set: 40 });
    assert.equal(s1.body.task.state.count, 40);
    const s2 = await report('cs', 'chant', 'c1', 't1', { set: 10 });
    assert.equal(s2.body.task.state.count, 40, 'set cannot lower');
    const s3 = await report('cs', 'chant', 'c1', 't1', { set: 100000 });
    assert.deepEqual([s3.body.task.state.count, s3.body.task.done], [108, true], 'set cannot pass the target');
    for (const bad of [{}, { add: 0 }, { add: 201 }, { add: -1 }, { add: 1.5 }, { add: '5' }, { set: -1 }, { set: 2.5 }, { set: 'x' }, { add: 5, set: 'x' }]) {
      const uid = `bad-${JSON.stringify(bad)}`;
      tick();
      const r = await report(uid, 'chant', 'c1', 't1', bad);
      if (bad.add === 5) assert.equal(r.status, 200, 'add wins over a bad set');
      else assert.deepEqual(code(r), [400, 'bad_report'], JSON.stringify(bad));
    }
  });

  test('rate cap: an add within 400 ms of the last accepted one is 429 too_fast carrying the current state, and changes nothing', async () => {
    tick(10_000);
    assert.equal((await report('fast', 'chant', 'c1', 't1', { add: 1 })).body.task.state.count, 1);
    tick(399);
    const r = await report('fast', 'chant', 'c1', 't1', { add: 1 });
    assert.deepEqual(code(r), [429, 'too_fast']);
    assert.deepEqual(r.body.task, { key: 't1', done: false, completedAt: null, state: { count: 1 } });
    tick(1);
    assert.equal((await report('fast', 'chant', 'c1', 't1', { add: 1 })).body.task.state.count, 2);
    assert.equal((await report('fast', 'chant', 'c1', 't1', { set: 50 })).body.task.state.count, 50, 'a set is not rate-capped');
  });

  test('parallel counter reports: never above the target, never lost updates beyond the cap (exactly one add per 400 ms window wins)', async () => {
    tick(10_000);
    const rs = await Promise.all(Array.from({ length: 12 }, () => report('par', 'chant', 'c1', 't1', { add: 3 })));
    const ok = rs.filter((r) => r.status === 200);
    const fast = rs.filter((r) => r.status === 429);
    assert.equal(ok.length, 1);
    assert.equal(fast.length, 11);
    assert.equal(ok[0].body.task.state.count, 3);
    assert.equal((await TaskProgress.findOne({ uid: 'par', eventSlug: 'chant' })).state.count, 3);
  });

  test('replay: a completed task answers 200 with its state and changes nothing (no second award, no new row)', async () => {
    const before = await TaskProgress.findOne({ uid: 'ct', eventSlug: 'chant', milestoneKey: 'c1' }).lean();
    const hits = wallet.hits.length;
    tick();
    const again = await report('ct', 'chant', 'c1', 't1', { add: 5 });
    assert.equal(again.status, 200);
    assert.deepEqual([again.body.task.done, again.body.task.state, again.body.milestone.justCompleted, again.body.completion], [true, { count: 108 }, false, null]);
    assert.equal(again.body.awarded.coins, 0);
    const afterRow = await TaskProgress.findOne({ uid: 'ct', eventSlug: 'chant', milestoneKey: 'c1' }).lean();
    assert.deepEqual([afterRow.rev, afterRow.completedAt.toISOString()], [before.rev, before.completedAt.toISOString()]);
    assert.equal(wallet.hits.length, hits);
  });

  test('self_mark: any body is a mark; done at once; the evidence line is in both languages', async () => {
    await mkEvent('marks', { milestones: { order: 'any', missed: 'catch_up_next', completion: { rule: 'all', n: null }, items: [ms('x', [self('t1')])] } });
    const r = await report('sm', 'marks', 'x', 't1', { junk: [1, 2, 3] });
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.task.done, r.body.task.state, r.body.milestone.justCompleted, r.body.event.justCompleted], [true, {}, true, true]);
    assert.deepEqual(r.body.completion.how, [{ text: 'Marked done', textHi: 'पूर्ण चिह्नित किया' }]);
  });
});

/* ──────────────────────────────────────────────────────────────────────── completion rules ── */
describe('completion rules over tasks and milestones', () => {
  test('milestone rule all / atLeast / any over its tasks', async () => {
    const mk = (rule, n) => ({ order: 'any', missed: 'catch_up_next', completion: { rule: 'all', n: null }, items: [ms('m', [self('a'), self('b'), self('c')], { completion: { rule, n } })] });
    await mkEvent('rule-all', { milestones: mk('all') });
    await mkEvent('rule-two', { milestones: mk('atLeast', 2) });
    await mkEvent('rule-any', { milestones: mk('any') });
    const done = async (slug, uid) => (await MilestoneResult.countDocuments({ uid, eventSlug: slug })) === 1;
    await report('ru', 'rule-all', 'm', 'a'); await report('ru', 'rule-all', 'm', 'b');
    assert.equal(await done('rule-all', 'ru'), false);
    assert.equal((await report('ru', 'rule-all', 'm', 'c')).body.milestone.justCompleted, true);
    await report('ru', 'rule-two', 'm', 'a');
    assert.equal(await done('rule-two', 'ru'), false);
    assert.equal((await report('ru', 'rule-two', 'm', 'c')).body.milestone.justCompleted, true);
    assert.equal((await report('ru', 'rule-two', 'm', 'b')).body.milestone.justCompleted, false, 'the third task changes nothing about the milestone');
    assert.equal((await report('ru', 'rule-any', 'm', 'b')).body.milestone.justCompleted, true);
    assert.equal(await MilestoneResult.countDocuments({ uid: 'ru', eventSlug: 'rule-any' }), 1);
  });

  test('event rule all / atLeast / any over its milestones', async () => {
    const mk = (rule, n) => ({ order: 'any', missed: 'catch_up_next', completion: { rule, n }, items: [ms('a', [self()]), ms('b', [self()]), ms('c', [self()])] });
    await mkEvent('ev-all', { milestones: mk('all') });
    await mkEvent('ev-two', { milestones: mk('atLeast', 2) });
    await mkEvent('ev-any', { milestones: mk('any') });
    const evDone = (slug) => EventResult.countDocuments({ uid: 'er', eventSlug: slug });
    await report('er', 'ev-all', 'a', 't1'); await report('er', 'ev-all', 'b', 't1');
    assert.equal(await evDone('ev-all'), 0);
    assert.equal((await report('er', 'ev-all', 'c', 't1')).body.event.justCompleted, true);
    await report('er', 'ev-two', 'a', 't1');
    assert.equal(await evDone('ev-two'), 0);
    assert.equal((await report('er', 'ev-two', 'c', 't1')).body.event.justCompleted, true);
    assert.equal((await report('er', 'ev-two', 'b', 't1')).body.event.justCompleted, false);
    assert.equal((await report('er', 'ev-any', 'b', 't1')).body.event.justCompleted, true);
    assert.equal(await evDone('ev-any'), 1);
  });

  test('editing a live event never un-completes anything; a changed rule applies to tasks not yet completed', async () => {
    await mkEvent('edit-live', { milestones: { order: 'any', missed: 'catch_up_next', completion: { rule: 'all', n: null }, items: [ms('m', [self('a'), self('b')]), ms('n', [self('a')])] } });
    await report('ed', 'edit-live', 'm', 'a'); await report('ed', 'edit-live', 'm', 'b');
    assert.equal(await MilestoneResult.countDocuments({ uid: 'ed', eventSlug: 'edit-live' }), 1);
    await Event.updateOne({ slug: 'edit-live' }, { $set: { 'milestones.items.0.tasks': [self('a'), self('b'), self('c')] } }); // a third task is added
    const detail = (await get('ed', '/events/edit-live')).body.event;
    assert.equal(detail.milestones.items[0].done, true, 'still done');
    assert.equal(detail.me.progress.done, 1);
    await Event.updateOne({ slug: 'edit-live' }, { $set: { 'milestones.completion': { rule: 'any', n: null } } }); // the event now needs just one milestone
    const r = await report('ed', 'edit-live', 'n', 'a');
    assert.equal(r.body.event.justCompleted, true);
  });

  test('a crash between the task write and the result write is healed by the devotee\'s next call', async () => {
    await mkEvent('heal', { milestones: { order: 'any', missed: 'catch_up_next', completion: { rule: 'all', n: null }, items: [ms('m', [self()], { coins: 7 })] } });
    await report('hl', 'heal', 'm', 't1');
    await MilestoneResult.deleteMany({ eventSlug: 'heal' });
    await EventResult.deleteMany({ eventSlug: 'heal' });
    const r = await report('hl', 'heal', 'm', 't1'); // the task is already complete; the records are missing
    assert.deepEqual([r.status, r.body.milestone.justCompleted, r.body.event.justCompleted], [200, true, true]);
    assert.equal(await MilestoneResult.countDocuments({ eventSlug: 'heal' }), 1);
    assert.equal(wallet.txns.get('event-ms:heal:m:hl').amount, 7, 'the wallet key is the same, so it was paid once');
    assert.equal(wallet.balance('hl'), 7);
  });
});

/* ───────────────────────────────────────────────────────────────────────────────────── rewards ── */
describe('rewards: coins through the wallet, badges, exactly once', () => {
  before(async () => {
    await mkEvent('yatra-r', {
      blocks: ['schedule', 'registration', 'milestones', 'rewards'], registration: FREE(),
      milestones: {
        order: 'sequential', missed: 'catch_up_next', completion: { rule: 'all', n: null },
        items: [
          ms('day1', [self('t1')], { coins: 10, titleHi: 'पहला दिन' }),
          ms('day2', [counter('chant', 3), self('t2')], { coins: 20 }),
        ],
      },
      rewards: [
        { kind: 'coins', coins: 5, badgeSlug: '', trigger: { on: 'milestone', milestoneKey: 'day1' } },
        { kind: 'badge', coins: 0, badgeSlug: 'pilgrim', trigger: { on: 'event', milestoneKey: '' } },
        { kind: 'coins', coins: 100, badgeSlug: '', trigger: { on: 'event', milestoneKey: '' } },
        { kind: 'certificate', coins: 0, badgeSlug: '', trigger: { on: 'event', milestoneKey: '' } },
      ],
    });
  });

  test('a badge reward in the detail carries the badge display name, never just its slug', async () => {
    const r = (await get('rw', '/events/yatra-r')).body.event.rewards.find((x) => x.kind === 'badge');
    assert.equal(r.badgeSlug, 'pilgrim');
    assert.equal(r.badgeName, 'Pilgrim');
    assert.equal(r.badgeNameHi, 'यात्री');
  });

  test('a milestone credits its coins and its coin rewards with deterministic keys; the event credits its reward and grants the badge', async () => {
    await join('rw', 'yatra-r');
    const d1 = await report('rw', 'yatra-r', 'day1', 't1');
    assert.equal(d1.status, 200);
    assert.deepEqual([d1.body.milestone.justCompleted, d1.body.event.justCompleted, d1.body.awarded], [true, false, { coins: 15, badges: [] }]);
    assert.deepEqual(wallet.keys().filter((k) => k.includes('yatra-r')), ['event-ms:yatra-r:day1:rw', 'event-ms:yatra-r:day1:rw:0']);
    assert.equal(wallet.balance('rw'), 15);
    assert.deepEqual(wallet.hits.at(-1).body, { uid: 'rw', amount: 5, type: 'bonus', key: 'event-ms:yatra-r:day1:rw:0', refType: 'event', refId: 'yatra-r', note: 'Event reward: yatra-r' });
    assert.equal(wallet.hits.at(-1).iss, 'events');
    assert.deepEqual(d1.body.completion.next, { title: 'Milestone day2', titleHi: 'चरण day2', opensAt: null });
    assert.deepEqual(d1.body.completion.progress, { done: 1, total: 2 });
    assert.equal(d1.body.completion.eventCompleted, false);

    await report('rw', 'yatra-r', 'day2', 'chant', { add: 3 });
    tick();
    const last = await report('rw', 'yatra-r', 'day2', 't2');
    assert.deepEqual([last.body.milestone.justCompleted, last.body.event.justCompleted, last.body.event.done], [true, true, true]);
    assert.equal(last.body.awarded.coins, 120, 'milestone 20 + event reward 100');
    assert.deepEqual(last.body.awarded.badges, [{ slug: 'pilgrim', name: 'Pilgrim', nameHi: 'यात्री' }]);
    assert.equal(last.body.completion.eventCompleted, true);
    assert.equal(last.body.completion.title, 'Milestone day2');
    assert.equal(last.body.completion.next, null);
    assert.deepEqual(last.body.completion.how.map((h) => h.text), ['Counted 3', 'Marked done']);
    assert.deepEqual(last.body.me.progress, { done: 2, total: 2 });
    assert.equal(last.body.me.completed, true);
    assert.ok(wallet.txns.has('event-done:yatra-r:rw'), 'a single event coin reward uses the bare key');
    assert.equal(wallet.balance('rw'), 15 + 120);
    assert.equal(await UserBadge.countDocuments({ uid: 'rw', badgeSlug: 'pilgrim', eventSlug: 'yatra-r' }), 1);
    const results = await MilestoneResult.find({ uid: 'rw', eventSlug: 'yatra-r' }).lean();
    assert.ok(results.every((r) => r.pendingCredits.every((c) => c.status === 'credited' && c.creditedAt)));
  });

  test('PARALLEL completion is exactly-once: one MilestoneResult, one EventResult, one winner, one credit per key, one badge', async () => {
    await mkEvent('race', {
      milestones: { order: 'any', missed: 'catch_up_next', completion: { rule: 'all', n: null }, items: [ms('m', [self('a'), self('b')], { coins: 9 })] },
      rewards: [{ kind: 'badge', coins: 0, badgeSlug: 'garba-star', trigger: { on: 'event', milestoneKey: '' } }, { kind: 'coins', coins: 40, badgeSlug: '', trigger: { on: 'event', milestoneKey: '' } }],
      blocks: ['schedule', 'milestones', 'rewards'],
    });
    const hits = wallet.hits.length;
    const rs = await Promise.all([...Array.from({ length: 8 }, () => report('rc', 'race', 'm', 'a')), ...Array.from({ length: 8 }, () => report('rc', 'race', 'm', 'b'))]);
    assert.ok(rs.every((r) => r.status === 200), JSON.stringify(rs.filter((r) => r.status !== 200).map((r) => r.body)));
    assert.equal(rs.filter((r) => r.body.milestone.justCompleted).length, 1);
    assert.equal(rs.filter((r) => r.body.event.justCompleted).length, 1);
    assert.ok(rs.filter((r) => r.body.awarded.coins > 0).length <= 2, 'the milestone and the event may be won by different requests, each by exactly one');
    assert.equal(rs.reduce((n, r) => n + r.body.awarded.coins, 0), 49);
    assert.equal(rs.reduce((n, r) => n + r.body.awarded.badges.length, 0), 1);
    assert.equal(await MilestoneResult.countDocuments({ uid: 'rc', eventSlug: 'race' }), 1);
    assert.equal(await EventResult.countDocuments({ uid: 'rc', eventSlug: 'race' }), 1);
    assert.equal(await UserBadge.countDocuments({ uid: 'rc', eventSlug: 'race' }), 1);
    assert.equal(wallet.balance('rc'), 49);
    assert.deepEqual(wallet.keys().filter((k) => k.includes(':race:')), ['event-done:race:rc', 'event-ms:race:m:rc']);
    assert.equal(wallet.hits.length - hits, 2, 'exactly two wallet calls');
  });

  test('parallel completion by two DIFFERENT devotees pays each once', async () => {
    const hits = wallet.hits.length;
    await Promise.all(['pa', 'pb'].flatMap((u) => [report(u, 'race', 'm', 'a'), report(u, 'race', 'm', 'b')]));
    assert.deepEqual([wallet.balance('pa'), wallet.balance('pb')], [49, 49]);
    assert.equal(wallet.hits.length - hits, 4);
  });

  test('several event coin rewards get `:<rewardIndex>` keys; a badge is unique per (uid, badge, event) even if granted twice', async () => {
    await mkEvent('multi', {
      blocks: ['milestones', 'rewards'], milestones: { order: 'any', missed: 'catch_up_next', completion: { rule: 'all', n: null }, items: [ms('m', [self()])] },
      rewards: [{ kind: 'coins', coins: 1, badgeSlug: '', trigger: { on: 'event', milestoneKey: '' } }, { kind: 'badge', coins: 0, badgeSlug: 'pilgrim', trigger: { on: 'event', milestoneKey: '' } }, { kind: 'coins', coins: 2, badgeSlug: '', trigger: { on: 'event', milestoneKey: '' } }],
    });
    await report('mu', 'multi', 'm', 't1');
    assert.deepEqual(wallet.keys().filter((k) => k.includes(':multi:')), ['event-done:multi:mu:0', 'event-done:multi:mu:2']);
    assert.equal(wallet.balance('mu'), 3);
    const row = await EventResult.findOne({ uid: 'mu', eventSlug: 'multi' }).lean();
    const { grantBadges } = await import('./engine/rewards.js');
    assert.deepEqual(await grantBadges(EventResult, row, { now: () => clock }), [], 'granting again adds nothing');
    assert.equal(await UserBadge.countDocuments({ uid: 'mu', eventSlug: 'multi' }), 1);
    await assert.rejects(UserBadge.create({ uid: 'mu', badgeSlug: 'pilgrim', eventSlug: 'multi' }), /E11000/);
    await UserBadge.create({ uid: 'mu', badgeSlug: 'pilgrim', eventSlug: 'another-event' }); // the same badge from another event is a separate badge
  });

  test('no coins configured: no wallet call at all, no pending credit', async () => {
    await mkEvent('free-of-coins', { milestones: { order: 'any', missed: 'catch_up_next', completion: { rule: 'all', n: null }, items: [ms('m', [self()])] } });
    const hits = wallet.hits.length;
    const r = await report('nc', 'free-of-coins', 'm', 't1');
    assert.deepEqual(r.body.awarded, { coins: 0, badges: [] });
    assert.equal(wallet.hits.length, hits);
    assert.deepEqual((await MilestoneResult.findOne({ uid: 'nc' }).lean()).pendingCredits, []);
  });
});

/* ────────────────────────────────────────────────────────────────── wallet failures and the sweeper ── */
describe('a wallet failure never loses a completion; the sweeper pays with the SAME key', () => {
  const evt = (slug) => mkEvent(slug, {
    blocks: ['milestones', 'rewards'], milestones: { order: 'any', missed: 'catch_up_next', completion: { rule: 'all', n: null }, items: [ms('m', [self()], { coins: 30 })] },
    rewards: [{ kind: 'coins', coins: 70, badgeSlug: '', trigger: { on: 'event', milestoneKey: '' } }],
  });
  const pending = async (uid, slug) => [...(await MilestoneResult.findOne({ uid, eventSlug: slug }).lean()).pendingCredits, ...(await EventResult.findOne({ uid, eventSlug: slug }).lean()).pendingCredits];

  test('wallet down: the devotee still completes (200, awarded shows the coins owed), credits stay pending; recovery + sweep pays each once', async () => {
    await evt('wf-down');
    wallet.mode = 'down';
    const r = await report('wd', 'wf-down', 'm', 't1');
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.milestone.justCompleted, r.body.event.justCompleted, r.body.awarded.coins], [true, true, 100]);
    assert.equal(wallet.balance('wd'), 0);
    const p = await pending('wd', 'wf-down');
    assert.deepEqual(p.map((c) => [c.key, c.amount, c.status, c.attempts]), [['event-ms:wf-down:m:wd', 30, 'pending', 1], ['event-done:wf-down:wd', 70, 'pending', 1]]);
    assert.match(p[0].lastError, /wallet_unavailable/);
    // still down: the sweeper tries (backing off), nothing is paid, nothing is lost
    tick(60_000);
    const s1 = await sweep({ wallet: app.locals.wallet, now: () => clock });
    assert.equal(s1.credited, 0);
    assert.deepEqual((await pending('wd', 'wf-down')).map((c) => c.status), ['pending', 'pending']);
    wallet.mode = 'up';
    const early = await sweep({ wallet: app.locals.wallet, now: () => clock });
    assert.equal(early.credited, 0, 'backing off: a credit tried a moment ago is not hammered');
    tick(10 * 60_000);
    const s2 = await sweep({ wallet: app.locals.wallet, now: () => clock });
    assert.equal(s2.credited, 2);
    assert.equal(wallet.balance('wd'), 100);
    assert.deepEqual((await pending('wd', 'wf-down')).map((c) => c.status), ['credited', 'credited']);
    assert.deepEqual(wallet.keys().filter((k) => k.includes('wf-down')), ['event-done:wf-down:wd', 'event-ms:wf-down:m:wd']);
    const hitsNow = wallet.hits.length;
    assert.equal((await sweep({ wallet: app.locals.wallet, now: () => clock })).checked, 0);
    assert.equal(wallet.hits.length, hitsNow, 'nothing pending = no wallet calls');
  });

  test('a LOST ANSWER (the wallet paid, the reply never arrived): the retry gets `duplicate` and the devotee is paid exactly once', async () => {
    await evt('wf-lost');
    wallet.mode = 'lost';
    const r = await report('wl', 'wf-lost', 'm', 't1');
    assert.equal(r.status, 200);
    assert.equal(wallet.balance('wl'), 100, 'the wallet did move the coins');
    assert.deepEqual((await pending('wl', 'wf-lost')).map((c) => c.status), ['pending', 'pending'], 'but we do not know it yet');
    wallet.mode = 'up';
    tick(10 * 60_000);
    assert.equal((await sweep({ wallet: app.locals.wallet, now: () => clock })).credited, 2);
    assert.equal(wallet.balance('wl'), 100, 'still 100, not 200');
    assert.deepEqual((await pending('wl', 'wf-lost')).map((c) => c.status), ['credited', 'credited']);
  });

  test('a 500 and a timeout are the same: pending, then paid; a business refusal stays pending with the reason', async () => {
    await evt('wf-500');
    wallet.mode = 'broken';
    assert.equal((await report('w5', 'wf-500', 'm', 't1')).status, 200);
    wallet.mode = 'hang';
    await evt('wf-hang');
    const t0 = Date.now();
    assert.equal((await report('wh', 'wf-hang', 'm', 't1')).status, 200);
    assert.ok(Date.now() - t0 < 3000, 'the client timeout (SERVICE_TIMEOUT_MS) bounds the wait');
    wallet.mode = 'refuse';
    await evt('wf-refuse');
    assert.equal((await report('wr', 'wf-refuse', 'm', 't1')).status, 200);
    assert.match((await pending('wr', 'wf-refuse'))[0].lastError, /key_not_allowed/);
    wallet.mode = 'up';
    tick(10 * 60_000);
    await sweep({ wallet: app.locals.wallet, now: () => clock });
    for (const [u, s] of [['w5', 'wf-500'], ['wh', 'wf-hang'], ['wr', 'wf-refuse']]) {
      assert.deepEqual((await pending(u, s)).map((c) => c.status), ['credited', 'credited'], s);
      assert.equal(wallet.balance(u), 100);
    }
  });

  test('WALLET_URL unset: completion works, rewards wait (and the sweeper keeps them)', async () => {
    const { createWalletClient } = await import('./lib/wallet-client.js');
    const none = createWalletClient({ walletUrl: '', secret: SECRET, serviceTimeoutMs: 100 });
    await assert.rejects(none.credit({ uid: 'x', amount: 1, key: 'event-x' }), /WALLET_URL is not set/);
  });

  test('a sweep also finishes a badge grant a crash cut short', async () => {
    await mkEvent('badge-crash', { blocks: ['milestones', 'rewards'], milestones: { order: 'any', missed: 'catch_up_next', completion: { rule: 'all', n: null }, items: [ms('m', [self()])] }, rewards: [{ kind: 'badge', coins: 0, badgeSlug: 'pilgrim', trigger: { on: 'event', milestoneKey: '' } }] });
    await report('bc', 'badge-crash', 'm', 't1');
    await UserBadge.deleteMany({ uid: 'bc' });
    await EventResult.updateOne({ uid: 'bc', eventSlug: 'badge-crash' }, { $set: { badgesDone: false } });
    const s = await sweep({ wallet: app.locals.wallet, now: () => clock });
    assert.equal(s.badges, 1);
    assert.equal(await UserBadge.countDocuments({ uid: 'bc', eventSlug: 'badge-crash' }), 1);
    assert.equal((await EventResult.findOne({ uid: 'bc', eventSlug: 'badge-crash' })).badgesDone, true);
  });

  test('the wallet client sends only what the wallet allows from `events`: type bonus, an `event-` key, integer coins', async () => {
    const credits = wallet.hits.filter((h) => h.path === '/credit');
    assert.ok(credits.length > 5);
    for (const h of credits) {
      assert.equal(h.body.type, 'bonus');
      assert.match(h.body.key, /^event-(ms|done):/);
      assert.ok(Number.isInteger(h.body.amount) && h.body.amount > 0);
      assert.equal(h.iss, 'events');
    }
  });
});

/* ────────────────────────────────────────────────────────────────── me, sections, badges, detail ── */
describe('what the devotee sees: detail `me`, sections, my events, my badges', () => {
  before(async () => {
    await mkEvent('story', {
      title: 'Story Yatra', blocks: ['schedule', 'registration', 'milestones', 'rewards'], registration: FREE({ capacity: 10 }),
      schedule: { mode: 'multiday', startsAt: D('2026-03-09T00:00:00Z'), endsAt: D('2026-03-30T00:00:00Z') },
      milestones: { order: 'daily', missed: 'catch_up_any', completion: { rule: 'all', n: null }, items: [
        ms('d1', [counter('chant', 4, 'Om')], { opensAt: D('2026-03-09T00:00:00Z'), coins: 3 }),
        ms('d2', [self()], { opensAt: D('2026-03-12T00:00:00Z') }),
        ms('d3', [self()], { opensAt: D('2026-03-13T00:00:00Z') }),
      ] },
      rewards: [{ kind: 'badge', coins: 0, badgeSlug: 'pilgrim', trigger: { on: 'event', milestoneKey: '' } }],
    });
    await mkEvent('story-2', { title: 'Another Event', blocks: ['schedule', 'registration', 'milestones'], registration: FREE(), schedule: { mode: 'multiday', startsAt: D('2026-03-11T00:00:00Z'), endsAt: D('2026-03-30T00:00:00Z') } });
    await mkEvent('story-3', { title: 'Not Joined', blocks: ['schedule', 'registration', 'milestones'], registration: FREE(), schedule: { mode: 'always' } });
  });

  test('guest vs signed-in detail: me is null for a guest; `registered` / `spotsLeft` are the real counts for everyone', async () => {
    const g = (await get(null, '/events/story')).body.event;
    assert.equal(g.me, null);
    assert.deepEqual([g.registered, g.spotsLeft, g.registration.registered, g.registration.spotsLeft], [0, 10, 0, 10]);
    const u = (await get('me-1', '/events/story')).body.event;
    assert.deepEqual(u.me, { registered: false, passCode: null, answers: {}, progress: { done: 0, total: 3 }, currentMilestoneKey: 'd1', completed: false });
    assert.equal('progress' in u, false, 'not taking part: no progress on the card');
  });

  test('progress shows up in the detail: counter state, done / completedAt, locked summaries, currentMilestoneKey', async () => {
    await join('me-1', 'story');
    assert.equal((await report('me-1', 'story', 'd1', 'chant', { add: 3 })).body.task.state.count, 3);
    const mid = (await get('me-1', '/events/story')).body.event;
    const d1 = mid.milestones.items[0];
    assert.deepEqual([d1.done, d1.completedAt, d1.tasks[0].done, d1.tasks[0].state, d1.tasks[0].config.target], [false, null, false, { count: 3 }, 4]);
    assert.deepEqual(mid.milestones.items.slice(1).map((m) => [m.key, m.locked]), [['d2', true], ['d3', true]]);
    assert.equal(mid.me.currentMilestoneKey, 'd1');
    assert.deepEqual(mid.progress, { done: 0, total: 3 }, 'the card carries progress once taking part');
    tick();
    const fin = await report('me-1', 'story', 'd1', 'chant', { add: 3 });
    assert.equal(fin.body.milestone.justCompleted, true);
    assert.equal(fin.body.awarded.coins, 3);
    const after = (await get('me-1', '/events/story')).body.event;
    assert.deepEqual([after.milestones.items[0].done, after.milestones.items[0].completedAt, after.milestones.items[0].tasks[0].done], [true, clock.toISOString(), true]);
    assert.equal(after.milestones.items[0].tasks[0].completedAt, clock.toISOString());
    assert.deepEqual(after.me.progress, { done: 1, total: 3 });
    assert.equal(after.me.currentMilestoneKey, null, 'nothing open right now (d2 opens on the 12th)');
    at('2026-03-12T05:00:00Z');
    const later = (await get('me-1', '/events/story')).body.event;
    assert.equal(later.me.currentMilestoneKey, 'd2');
    assert.equal(later.milestones.items[1].locked, false);
    assert.deepEqual(fin.body.completion.next, { title: 'Milestone d2', titleHi: 'चरण d2', opensAt: '2026-03-12T00:00:00.000Z' });
  });

  test('sections: continue (live, joined, not finished, soonest first), mine (newest join first), completed {count,titles}, progress on cards, badgesCount', async () => {
    at('2026-03-12T05:00:00Z');
    await join('me-1', 'story-2');
    tick(1000);
    await join('me-1', 'story-3');
    tick(1000);
    const sections = (await get('me-1', '/events')).body;
    assert.deepEqual(sections.sections.mine.map((c) => c.slug), ['story-3', 'story-2', 'story'], 'newest registration first');
    assert.deepEqual(sections.sections.mine.find((c) => c.slug === 'story').progress, { done: 1, total: 3 });
    assert.deepEqual(sections.sections.mine.find((c) => c.slug === 'story-3').progress, { done: 0, total: 1 });
    assert.deepEqual(sections.sections.continue.map((c) => c.slug).sort(), ['story', 'story-2', 'story-3']);
    assert.deepEqual(sections.sections.completed, { count: 0, titles: [] });
    assert.equal(sections.badgesCount, 0);
    const card = sections.sections.thisWeek.concat(sections.sections.upcoming).find((c) => c.slug === 'story');
    assert.deepEqual([card.registered, card.spotsLeft, card.progress], [1, 9, { done: 1, total: 3 }]);
    const other = (await get('someone-else', '/events')).body;
    assert.deepEqual(other.sections.mine, []);
    assert.equal('progress' in other.sections.thisWeek.concat(other.sections.upcoming).find((c) => c.slug === 'story'), false);

    // finish the event
    assert.equal((await report('me-1', 'story', 'd2', 't1')).status, 200);
    at('2026-03-13T05:00:00Z');
    const fin = await report('me-1', 'story', 'd3', 't1');
    assert.deepEqual([fin.body.event.justCompleted, fin.body.awarded.badges.map((b) => b.slug)], [true, ['pilgrim']]);
    const done = (await get('me-1', '/events')).body;
    assert.deepEqual(done.sections.completed, { count: 1, titles: ['Story Yatra'] });
    assert.ok(!done.sections.continue.some((c) => c.slug === 'story'), 'finished events leave `continue`');
    assert.ok(done.sections.mine.some((c) => c.slug === 'story'), 'but stay in `mine`');
    assert.equal(done.badgesCount, 1);
    assert.equal((await get('me-1', '/events/story')).body.event.me.completed, true);
  });

  test('GET /me/events: only my events, newest first, with progress and a me-lite; GET /me/badges: the badge with its event and time', async () => {
    const mine = await get('me-1', '/me/events');
    assert.equal(mine.status, 200);
    assert.deepEqual(mine.body.events.map((c) => c.slug), ['story-3', 'story-2', 'story']);
    const story = mine.body.events.find((c) => c.slug === 'story');
    assert.deepEqual(story.progress, { done: 3, total: 3 });
    assert.deepEqual(Object.keys(story.me).sort(), ['completed', 'currentMilestoneKey', 'passCode', 'registered']);
    assert.equal(story.me.completed, true);
    assert.deepEqual((await get('nobody', '/me/events')).body, { events: [] });
    const badges = await get('me-1', '/me/badges');
    assert.deepEqual(badges.body, { badges: [{ slug: 'pilgrim', name: 'Pilgrim', nameHi: 'यात्री', art: '/uploads/p.png', description: 'Finished the yatra', eventSlug: 'story', eventTitle: 'Story Yatra', earnedAt: clock.toISOString() }] });
    assert.deepEqual((await get('nobody', '/me/badges')).body, { badges: [] });
  });

  test('one devotee never sees another\'s state or pass', async () => {
    const t = JSON.stringify((await get('me-2', '/events/story')).body);
    assert.equal(t.includes('me-1'), false);
    const other = (await get('me-2', '/events/story')).body.event.me;
    assert.deepEqual([other.registered, other.passCode, other.progress.done], [false, null, 0]);
  });
});

/* ──────────────────────────────────────────────────────────────────────────────────────── admin ── */
describe('admin: real stats and masked participants', () => {
  let ev;
  before(async () => {
    at('2026-03-10T06:00:00Z');
    ev = await mkEvent('adm', {
      blocks: ['registration', 'milestones'], registration: FREE({ fields: [{ key: 'party', label: 'Party', labelHi: '', type: 'number', required: false, options: [] }] }),
      milestones: { order: 'any', missed: 'catch_up_next', completion: { rule: 'all', n: null }, items: [ms('a', [self()]), ms('b', [self()])] },
    });
    for (const u of ['dir-1', 'dir-2', 'dir-3', 'dir-4']) await join(u, 'adm', { answers: { party: 2 } });
    await report('dir-1', 'adm', 'a', 't1'); tick(1000); await report('dir-1', 'adm', 'b', 't1');
    await report('dir-2', 'adm', 'a', 't1');
    await join('left-1', 'adm'); await leave('left-1', 'adm');
  });
  const id = () => String(ev._id);

  test('stats: joined / finished / per-milestone counts are counted from real rows; completedPct is a percentage of joined; cancelled registrations do not count', async () => {
    const s = (await call('GET', `/admin/events/${id()}/stats`, { headers: operator('viewer') })).body;
    assert.deepEqual(s, { joined: 4, finished: 1, perMilestone: [{ key: 'a', completedCount: 2, completedPct: 50 }, { key: 'b', completedCount: 1, completedPct: 25 }], checkedIn: null });
  });
  test('stats are null only when nothing was measured (no registration block and no progress)', async () => {
    const e = await mkEvent('adm-empty', {});
    const s = (await call('GET', `/admin/events/${e._id}/stats`)).body;
    assert.deepEqual([s.joined, s.finished, s.perMilestone], [null, null, [{ key: 'm1', completedCount: 0, completedPct: null }]]);
    await report('x1', 'adm-empty', 'm1', 't1'); await report('x2', 'adm-empty', 'm1', 't1');
    const s2 = (await call('GET', `/admin/events/${e._id}/stats`)).body;
    assert.deepEqual([s2.joined, s2.finished, s2.perMilestone[0].completedPct], [2, 2, 100]);
    const reg = await mkEvent('adm-zero', { blocks: ['registration', 'milestones'], registration: FREE() });
    const s3 = (await call('GET', `/admin/events/${reg._id}/stats`)).body;
    assert.deepEqual([s3.joined, s3.finished, s3.perMilestone[0].completedPct], [0, 0, null], 'a registration block with nobody in is a measured zero');
    assert.equal((await call('GET', `/admin/events/000000000000000000000009/stats`)).status, 404);
  });

  test('participants: admin (devotees:view) gets real names, contacts and answers; the identity directory is asked once', async () => {
    const r = await call('GET', `/admin/events/${id()}/participants`, { headers: operator('admin') });
    assert.equal(r.status, 200);
    assert.equal(r.body.next, null);
    assert.equal(r.body.items.length, 4);
    const asha = r.body.items.find((i) => i.name === 'Asha Rao');
    assert.equal(asha.contact, '+919800000001');
    assert.deepEqual(asha.progress, { done: 2, total: 2 });
    assert.equal(asha.completed, true);
    assert.deepEqual(asha.answers, { party: 2 });
    assert.match(asha.passCode, /^ADM-/);
    assert.ok(asha.joinedAt && asha.lastActivityAt);
    assert.deepEqual(Object.keys(asha).sort(), ['answers', 'completed', 'contact', 'id', 'joinedAt', 'lastActivityAt', 'name', 'passCode', 'progress']);
    const d2 = r.body.items.find((i) => i.progress.done === 1);
    assert.match(d2.name, /^Devotee ••\d{4}$/, 'a devotee identity has no row for: the pseudonym, never the uid');
    const quiet = r.body.items.find((i) => i.lastActivityAt === null);
    assert.deepEqual(quiet.progress, { done: 0, total: 2 });
    assert.equal(r.body.items.some((i) => i.name === 'left-1'), false, 'cancelled registrations are not participants');
  });
  test('participants: editor and viewer get pseudonyms only (name AND contact), no answers, and identity is never asked', async () => {
    let asked = 0;
    const orig = directory.lookup;
    directory.lookup = async (...a) => { asked += 1; return orig(...a); };
    for (const role of ['editor', 'viewer']) {
      const r = await call('GET', `/admin/events/${id()}/participants`, { headers: operator(role) });
      assert.equal(r.status, 200, role);
      assert.equal(r.body.items.length, 4);
      for (const i of r.body.items) {
        assert.match(i.name, /^Devotee ••\d{4}$/, role);
        assert.match(i.contact, /^Devotee ••\d{4}$/, role);
        assert.equal('answers' in i, false, role);
      }
      const text = JSON.stringify(r.body);
      for (const leak of ['Asha', '9800000001', 'dir-1', 'dir-2', 'uid']) assert.equal(text.includes(leak), false, `${role}: ${leak}`);
      assert.equal(new Set(r.body.items.map((i) => i.name)).size, 4, 'distinct devotees get distinct pseudonyms');
    }
    directory.lookup = orig;
    assert.equal(asked, 0);
    // the pseudonym is stable and equals the other services' (same algorithm and secret)
    const a = (await call('GET', `/admin/events/${id()}/participants`, { headers: operator('editor') })).body.items.map((i) => i.name);
    const b = (await call('GET', `/admin/events/${id()}/participants`, { headers: operator('viewer') })).body.items.map((i) => i.name);
    assert.deepEqual(a, b);
    const { createRedactor } = await import('./lib/redact.js');
    assert.ok(a.includes(createRedactor(SESSION).pseudonym('dir-1')));
  });
  test('participants: cursor paging walks every row once; limit is bounded; a bad cursor is 400; guests/devotee tokens are refused', async () => {
    const seen = [];
    let cursor = null;
    for (let page = 0; page < 10; page += 1) {
      const r = await call('GET', `/admin/events/${id()}/participants?limit=3${cursor ? `&cursor=${cursor}` : ''}`, { headers: operator('viewer') });
      seen.push(...r.body.items.map((i) => i.id));
      if (!r.body.next) break;
      cursor = r.body.next;
    }
    assert.equal(seen.length, 4);
    assert.equal(new Set(seen).size, 4);
    assert.equal((await call('GET', `/admin/events/${id()}/participants?limit=999`, { headers: operator('viewer') })).body.items.length, 4);
    assert.equal((await call('GET', `/admin/events/${id()}/participants?cursor=zzz`, { headers: operator('viewer') })).status, 400);
    assert.equal((await call('GET', `/admin/events/${id()}/participants`, { headers: devotee('dir-1') })).status, 403);
    assert.equal((await call('GET', `/admin/events/${id()}/participants`, { headers: { authorization: 'Bearer nope' } })).status, 401);
    assert.equal((await call('GET', `/admin/events/000000000000000000000009/participants`, { headers: operator('admin') })).status, 404);
  });
  test('participants of an event with nothing to join are whoever reported progress (pseudonyms for a viewer)', async () => {
    const e = await Event.findOne({ slug: 'adm-empty' });
    const r = await call('GET', `/admin/events/${e._id}/participants`, { headers: operator('viewer') });
    assert.equal(r.body.items.length, 2);
    assert.ok(r.body.items.every((i) => i.passCode === null && i.joinedAt === null && i.completed === true && /^Devotee/.test(i.name)));
    const p1 = await call('GET', `/admin/events/${e._id}/participants?limit=1`, { headers: operator('viewer') });
    const p2 = await call('GET', `/admin/events/${e._id}/participants?limit=1&cursor=${p1.body.next}`, { headers: operator('viewer') });
    assert.equal(p1.body.items.length + p2.body.items.length, 2);
    assert.equal(p2.body.next, null);
    assert.notEqual(p1.body.items[0].id, p2.body.items[0].id);
  });
});
