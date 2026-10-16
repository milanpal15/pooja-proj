// Users 360 and blocking (docs/USERS.md sections 1-3, 6): list / filters / paging, the 360 aggregate, block / unblock / sign-out / tags / notes,
// timed blocks and the sweeper, blocked devices, the CSV export pages, delete confirmation, the boot migration, masking.
// Run: TEST_MONGODB_URI=mongodb://127.0.0.1:27161/x node --test --test-concurrency=1 src/users360.test.mjs
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, test } from 'node:test';

import { EXPORT_CAP, ROLE_PERMISSIONS, decodeAuditDetail, signServiceToken } from '@bhakti/common';
import mongoose from 'mongoose';

import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { connectDb } from './db.js';
import { applyTags, cleanTag, isBlocked, parseBlockBody } from './lib/blocks.js';
import { createRedactor } from './lib/redact.js';
import { sweepExpiredBlocks } from './lib/sweeper.js';
import { parseListQuery, phonePrefixes } from './lib/user-query.js';
import { AuditLog, BlockedDevice, PushDevice, User } from './models/index.js';
import { migrateUserBlocks } from './seed.js';

const SECRET = 'test-secret-test-secret-1234';
const base = new URL(process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27161/x');
const config = loadConfig({ INTERNAL_JWT_SECRET: SECRET, MONGODB_URI: `${base.protocol}//${base.host}`, DB_NAME: 'identity_users360_test', USER360_SECTION_TIMEOUT_MS: '80', ADMIN_SESSION_SECRET: 'pseudonym-secret-pseudonym' });

const ADMIN = ROLE_PERMISSIONS.admin;
let server;
let url;
let clock = new Date('2026-10-16T10:00:00Z');
const now = () => new Date(clock);
const advance = (ms) => { clock = new Date(clock.getTime() + ms); };
const fb = { revoked: [], deleted: [], configured: true, ready() { return this.configured; }, async revokeUser(u) { this.revoked.push(u); }, async deleteFirebaseUser(u) { this.deleted.push(u); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const walletData = { balance: 120, recent: Array.from({ length: 15 }, (_, i) => ({ id: `t${i}`, type: 'credit', amount: i + 1, at: `2026-10-${String(15 - (i % 10)).padStart(2, '0')}` })) };
/** Fake by-uid reads of the other services; each section can be made slow, broken or absent. */
const sources = {
  devices: [], deviceCalls: [], versionUids: [], versionTruncated: false, failDevices: false, failVersion: false,
  walletMode: 'ok', ordersMode: 'ok', eventsMode: 'ok', callsMode: 'ok',
  async devicesByUids(uids) {
    this.deviceCalls.push(uids);
    if (this.failDevices) throw Object.assign(new Error('registry down'), { code: 'upstream_error' });
    return this.devices.filter((d) => uids.includes(d.uid));
  },
  async uidsOnVersion() {
    if (this.failVersion) throw new Error('registry down');
    return { uids: this.versionUids, truncated: this.versionTruncated };
  },
  async wallet_(mode, value) {
    if (mode === 'slow') await sleep(400);
    if (mode === 'down') throw new Error('wallet down');
    if (mode === 'none') throw Object.assign(new Error('x'), { code: 'not_configured' });
    return value;
  },
  wallet() { return this.wallet_(this.walletMode, walletData); },
  orders() { return this.wallet_(this.ordersMode, { total: 3, recent: [{ id: 'b1', bookingRef: 'BK1', status: 'booked' }] }); },
  events() { return this.wallet_(this.eventsMode, { registrations: [{ eventSlug: 'diwali', status: 'joined' }], badges: [{ badgeSlug: 'diya', eventSlug: 'diwali' }] }); },
  calls() { return this.wallet_(this.callsMode, { total: 0, recent: [] }); },
};

before(async () => {
  await connectDb(config);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  const app = createApp(config, { isReady: () => true, logger: { info() {}, warn() {}, error: (m) => console.error("ERR", m) }, firebase: fb, astrologers: { claim: async () => null, active: async () => null }, sources, now });
  server = http.createServer(app);
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((ok) => server.close(ok));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const tok = (o = {}) => signServiceToken({ iss: 'mobile-bff', sub: 'uid-1', ...o }, { secret: SECRET });
const admin = (perms = ADMIN, username = 'root', sub = 'op-root') => ({ authorization: `Bearer ${tok({ iss: 'admin-bff', sub, role: 'admin', perms, ctx: { username } })}` });
const devoteeAuth = (uid, phone = '+919800000001') => ({ authorization: `Bearer ${tok({ sub: uid, role: 'devotee', ctx: { tok: { phone_number: phone, provider: 'phone' } } })}` });
const bff = () => ({ authorization: `Bearer ${tok({ sub: null })}` });

async function call(method, path, { headers = admin(), body } = {}) {
  const res = await fetch(`${url}/internal/identity${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { status: res.status, body: json, audit: decodeAuditDetail(res.headers.get('x-audit-detail')) };
}
const qs = (o) => `?${new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined)).toString()}`;
const list = (o = {}, h) => call('GET', `/admin/users/list${qs(o)}`, h ? { headers: h } : undefined);
const idOf = async (uid) => String((await User.findOne({ uid }).select('_id').lean())._id);
const VIEW_ONLY = ['devotees:view'];

const PEOPLE = [
  // uid, name, phone/contact, email, createdAt, lastActive, tags, role
  ['u01', 'Asha Rao', '+919800000001', null, '2026-01-05T10:00:00Z', '2026-10-15T10:00:00Z', ['vip'], 'devotee'],
  ['u02', 'asha Verma', '+919800000002', 'asha.v@example.com', '2026-02-05T10:00:00Z', '2026-10-14T10:00:00Z', [], 'devotee'],
  ['u03', 'Bharat Singh', '+919811111113', null, '2026-03-05T10:00:00Z', '2026-10-13T10:00:00Z', ['vip', 'beta'], 'devotee'],
  ['u04', 'Chitra Nair', '+919822222224', 'chitra@example.com', '2026-04-05T10:00:00Z', '2026-10-12T10:00:00Z', [], 'astrologer'],
  ['u05', 'Deepak', '+919833333335', null, '2026-05-05T10:00:00Z', '2026-10-11T10:00:00Z', ['beta'], 'devotee'],
  ['u06', 'Esha Gupta', '+919844444446', 'esha@example.com', '2026-06-05T10:00:00Z', '2026-10-10T10:00:00Z', [], 'devotee'],
  ['u07', 'Farhan', '+919855555557', null, '2026-07-05T10:00:00Z', '2026-10-09T10:00:00Z', [], 'devotee'],
  ['u08', 'Gita Devi', '+919866666668', 'gita@example.com', '2026-08-05T10:00:00Z', '2026-10-08T10:00:00Z', [], 'devotee'],
  ['u09', 'हरि ओम', '+919877777779', null, '2026-09-05T10:00:00Z', '2026-10-07T10:00:00Z', [], 'devotee'],
  ['u10', 'Indu', '+919888888880', null, '2026-09-10T10:00:00Z', '2026-10-06T10:00:00Z', [], 'devotee'],
  ['u11', 'Jai Prakash', '+919899999991', 'jai@example.com', '2026-09-15T10:00:00Z', '2026-10-05T10:00:00Z', [], 'devotee'],
  ['u12', 'Kamla', '+919800000012', null, '2026-09-20T10:00:00Z', '2026-10-04T10:00:00Z', [], 'devotee'],
];

describe('setup', () => {
  test('seed people (created through the model, so the search copies are filled by the hooks)', async () => {
    for (const [uid, name, contact, email, createdAt, lastActive, tags, role] of PEOPLE) {
      await User.create({ uid, name, contact, phone: contact, email: email || undefined, method: 'phone', createdAt: new Date(createdAt), lastActive: new Date(lastActive), tags, role });
    }
    const a = await User.findOne({ uid: 'u02' }).lean();
    assert.deepEqual([a.nameLower, a.emailLower], ['asha verma', 'asha.v@example.com']);
    // a name written through findOneAndUpdate (the auth sync path) keeps the copy in step
    await User.findOneAndUpdate({ uid: 'u02' }, { $set: { name: 'Asha  Verma-Iyer' } });
    assert.equal((await User.findOne({ uid: 'u02' }).lean()).nameLower, 'asha  verma-iyer');
    await User.findOneAndUpdate({ uid: 'u02' }, { $set: { name: 'asha Verma' } });
  });
});

describe('who may call', () => {
  test('operator routes are admin-bff only; view for reads, edit for writes; the device status is mobile-bff only', async () => {
    for (const [m, p] of [['GET', '/admin/users/list'], ['GET', '/admin/users/export'], ['GET', `/admin/users/${await idOf('u01')}`], ['GET', '/admin/blocked-devices']]) {
      assert.equal((await call(m, p, { headers: bff() })).status, 403, `${m} ${p} from mobile-bff`);
      assert.equal((await call(m, p, { headers: admin(['overview:view']) })).status, 403, `${m} ${p} without devotees`);
    }
    const id = await idOf('u01');
    for (const [m, p] of [['POST', `/admin/users/${id}/block`], ['POST', `/admin/users/${id}/unblock`], ['POST', `/admin/users/${id}/sign-out`], ['POST', `/admin/users/${id}/tags`], ['POST', `/admin/users/${id}/notes`], ['POST', '/admin/blocked-devices'], ['DELETE', '/admin/blocked-devices/x']]) {
      assert.equal((await call(m, p, { headers: admin(VIEW_ONLY), body: {} })).status, 403, `${m} ${p} with view only`);
    }
    assert.equal((await call('GET', '/devices/dev-x/status', { headers: admin() })).status, 403);
    assert.equal((await call('GET', '/devices/dev-x/status', { headers: devoteeAuth('u01') })).status, 200);
  });
});

describe('the list: search, filters, paging', () => {
  test('default: newest activity first, the UserRow shape, total on page one', async () => {
    const r = await list();
    assert.equal(r.status, 200);
    assert.equal(r.body.users.length, 12);
    assert.deepEqual(r.body.users.map((u) => u.uid).slice(0, 3), ['u01', 'u02', 'u03']);
    assert.equal(r.body.total, 12);
    assert.equal(r.body.next, null);
    const u = r.body.users[0];
    assert.deepEqual(Object.keys(u).sort(), ['blockUntil', 'blocked', 'contact', 'createdAt', 'hasPush', 'id', 'lastActive', 'method', 'name', 'role', 'tags', 'uid'].sort());
    assert.deepEqual([u.blocked, u.blockUntil, u.hasPush, u.role, u.tags], [false, null, false, 'devotee', ['vip']]);
  });

  test('cursor paging walks every row exactly once for each sort and direction; total only on page one', async () => {
    for (const [sort, dir] of [['lastActive', undefined], ['lastActive', 'asc'], ['createdAt', undefined], ['name', undefined], ['name', 'desc']]) {
      const seen = [];
      let cursor;
      let pages = 0;
      let total;
      do {
        const r = await list({ sort, dir, limit: 5, cursor });
        assert.equal(r.status, 200, JSON.stringify(r.body));
        if (!cursor) total = r.body.total; else assert.equal(r.body.total, null, 'no count after page one');
        seen.push(...r.body.users.map((x) => x.uid));
        cursor = r.body.next ?? undefined;
        pages += 1;
      } while (cursor && pages < 10);
      assert.equal(total, 12);
      assert.equal(pages, 3, `${sort} ${dir}`);
      assert.equal(new Set(seen).size, 12, `${sort} ${dir}: no duplicates, none missing`);
    }
    const asc = await list({ sort: 'name' });
    assert.equal(asc.body.users[0].name, 'Asha Rao'.length ? asc.body.users[0].name : '');
    const names = asc.body.users.map((x) => x.name.toLowerCase());
    assert.deepEqual(names, [...names].sort(), 'name ascending is case-insensitive');
  });

  test('limit defaults to 50, is clamped to 200, and a bad value / filter / cursor is a clear 400', async () => {
    assert.equal(parseListQuery({}).query.limit, 50);
    assert.equal(parseListQuery({ limit: '9999' }).query.limit, 200);
    const bad = await list({ limit: '0', status: 'zombie', sort: 'bogus', createdFrom: 'yesterday-ish', versionCode: 'x' });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.code, 'bad_filter');
    assert.deepEqual(Object.keys(bad.body.fields).sort(), ['createdFrom', 'limit', 'sort', 'status', 'versionCode']);
    const cur = await list({ cursor: 'not-a-cursor' });
    assert.deepEqual([cur.status, cur.body.code], [400, 'bad_cursor']);
  });

  test('q is a case-insensitive PREFIX on name, e-mail, uid and phone (with or without +91); never a substring; regex characters are literals', async () => {
    const names = async (q) => (await list({ q })).body.users.map((u) => u.uid).sort();
    assert.deepEqual(await names('asha'), ['u01', 'u02'], 'case-insensitive name prefix');
    assert.deepEqual(await names('ASHA V'), ['u02']);
    assert.deepEqual(await names('sha'), [], 'a substring is not a prefix match');
    assert.deepEqual(await names('chitra@'), ['u04'], 'e-mail prefix');
    assert.deepEqual(await names('u1'), ['u10', 'u11', 'u12'], 'uid prefix');
    assert.deepEqual(await names('+9198000000'), ['u01', 'u02', 'u12'], 'E.164 prefix');
    assert.deepEqual(await names('98000000'), ['u01', 'u02', 'u12'], 'typed without the country code');
    assert.deepEqual(await names('98 000 000 01'), ['u01'], 'spaces are ignored in a number');
    assert.deepEqual(await names('हरि'), ['u09'], 'Devanagari');
    assert.deepEqual(await names('.*'), [], 'regex metacharacters are literal');
    assert.deepEqual(await names('(a'), []);
    assert.deepEqual(phonePrefixes('98765'), ['+98765', '+9198765']);
    assert.deepEqual(phonePrefixes('abc'), []);
  });

  test('status / tag / role / dates (a bare date is an IST day) and their combinations', async () => {
    const uids = async (o) => (await list(o)).body.users.map((u) => u.uid).sort();
    assert.deepEqual(await uids({ tag: 'vip' }), ['u01', 'u03']);
    assert.deepEqual(await uids({ tag: 'VIP', role: 'devotee' }), ['u01', 'u03'], 'tags are lower-cased');
    assert.deepEqual(await uids({ role: 'astrologer' }), ['u04']);
    assert.equal((await uids({ role: 'devotee' })).length, 11);
    assert.deepEqual(await uids({ lastActiveAfter: '2026-10-13', lastActiveBefore: '2026-10-15' }), ['u02', 'u03'], 'after inclusive, before exclusive (IST midnight)');
    assert.deepEqual(await uids({ createdFrom: '2026-09-10', createdTo: '2026-09-15' }), ['u10', 'u11'], 'createdTo is inclusive of the whole day');
    assert.deepEqual(await uids({ q: 'asha', tag: 'vip' }), ['u01']);
    assert.deepEqual(await uids({ status: 'blocked' }), []);
  });

  test('blocked / active reflect the block AT NOW: a timed block that has run out is active at once', async () => {
    const id = await idOf('u06');
    await call('POST', `/admin/users/${id}/block`, { body: { reason: 'spam', message: 'Blocked for spam.', until: new Date(clock.getTime() + 3600_000).toISOString() } });
    const id2 = await idOf('u07');
    await call('POST', `/admin/users/${id2}/block`, { body: { reason: 'abuse', message: 'Blocked.' } });
    const blocked = async () => (await list({ status: 'blocked' })).body.users.map((u) => u.uid).sort();
    assert.deepEqual(await blocked(), ['u06', 'u07']);
    const row = (await list({ status: 'blocked' })).body.users.find((u) => u.uid === 'u06');
    assert.equal(row.blocked, true);
    assert.equal(row.blockUntil, new Date(clock.getTime() + 3600_000).toISOString());
    assert.equal((await list({ status: 'active' })).body.users.length, 10);
    advance(2 * 3600_000); // u06's block has run out; the sweeper has NOT run
    assert.equal((await User.findOne({ uid: 'u06' }).lean()).blocked, true, 'the stored flag is stale until swept');
    assert.deepEqual(await blocked(), ['u07']);
    assert.equal((await list({ status: 'active' })).body.users.length, 11);
    assert.equal((await list()).body.users.find((u) => u.uid === 'u06').blocked, false);
    // tidy for the next tests
    await call('POST', `/admin/users/${id2}/unblock`, { body: {} });
    await sweepExpiredBlocks(now());
  });

  test('app version: one batched registry call per page; hasPush from this service; version filter via the registry', async () => {
    sources.devices = [
      { uid: 'u01', deviceId: 'd1-old', versionName: '1.0.0', versionCode: 10, lastSeen: '2026-10-01T00:00:00Z' },
      { uid: 'u01', deviceId: 'd1-new', versionName: '1.2.0', versionCode: 12, lastSeen: '2026-10-15T00:00:00Z' },
      { uid: 'u03', deviceId: 'd3', versionName: '1.0.0', versionCode: 10, lastSeen: '2026-10-10T00:00:00Z' },
    ];
    await PushDevice.create({ uid: 'u03', token: 'fcm-1' });
    sources.deviceCalls = [];
    const r = await list({ limit: 12 });
    assert.equal(sources.deviceCalls.length, 1, 'one batched call for the whole page');
    assert.equal(sources.deviceCalls[0].length, 12);
    const by = Object.fromEntries(r.body.users.map((u) => [u.uid, u]));
    assert.deepEqual([by.u01.versionName, by.u01.versionCode, by.u01.hasPush], ['1.2.0', 12, false], 'the newest device decides');
    assert.deepEqual([by.u03.versionCode, by.u03.hasPush], [10, true]);
    assert.equal('versionCode' in by.u02, false);

    sources.versionUids = ['u01', 'u03'];
    assert.deepEqual((await list({ versionCode: '10' })).body.users.map((u) => u.uid).sort(), ['u01', 'u03']);
    sources.versionUids = [];
    assert.deepEqual((await list({ versionCode: '999' })).body.users, [], 'no accounts on that build = an empty list, not everyone');
    sources.versionUids = ['u01']; sources.versionTruncated = true;
    assert.equal((await list({ versionCode: '12' })).body.versionFilterTruncated, true);
    sources.versionTruncated = false;

    sources.failVersion = true;
    const down = await list({ versionCode: '12' });
    assert.deepEqual([down.status, down.body.code], [503, 'devices_unavailable'], 'a filter that cannot be answered is refused, never ignored');
    sources.failVersion = false;
    sources.failDevices = true;
    const partial = await list();
    assert.equal(partial.status, 200);
    assert.equal(partial.body.versionsUnavailable, true);
    assert.equal(partial.body.users.length, 12);
    sources.failDevices = false;
  });

  test('indexes exist for the list: sort keys and the prefix-search fields', async () => {
    const idx = (await User.collection.indexes()).map((i) => Object.keys(i.key).join(','));
    for (const want of ['lastActive,_id', 'createdAt,_id', 'nameLower,_id', 'emailLower', 'phone', 'tags', 'block.active,block.until', 'uid', 'contact']) assert.ok(idx.includes(want), `missing index ${want}: ${idx.join(' | ')}`);
    const plan = await User.find({ nameLower: /^asha/ }).explain('queryPlanner');
    assert.match(JSON.stringify(plan.queryPlanner.winningPlan), /IXSCAN/, 'a name prefix is an index scan');
  });
});

describe('the 360 aggregate', () => {
  test('every section present; recent lists are trimmed to 10; devices carry the block flag; the profile shape', async () => {
    sources.devices = [{ uid: 'u01', deviceId: 'd1-new', versionName: '1.2.0', versionCode: 12, osApi: 34, model: 'Pixel', platform: 'android', firstSeen: '2026-01-05T00:00:00Z', lastSeen: '2026-10-15T00:00:00Z' }];
    await BlockedDevice.create({ deviceId: 'd1-new', reason: 'x', message: 'm' });
    await User.updateOne({ uid: 'u01' }, { $set: { dob: '1990-01-02', gender: 'female', email: 'asha@example.com', emailVerified: true, savedTemples: ['a', 'b'], acceptedPolicies: { terms: 2 } } });
    const r = await call('GET', `/admin/users/${await idOf('u01')}`);
    assert.equal(r.status, 200);
    const b = r.body;
    assert.deepEqual(Object.keys(b).sort(), ['audit', 'bookings', 'calls', 'devices', 'events', 'user', 'wallet']);
    assert.deepEqual([b.user.dob, b.user.gender, b.user.email, b.user.emailVerified, b.user.savedTemples, b.user.acceptedPolicies], ['1990-01-02', 'female', 'asha@example.com', true, 2, { terms: 2 }]);
    assert.equal(b.wallet.balance, 120);
    assert.equal(b.wallet.recent.length, 10);
    assert.equal(b.bookings.total, 3);
    assert.equal(b.events.badges.length, 1);
    assert.deepEqual(b.calls, { total: 0, recent: [] });
    assert.deepEqual(b.devices, [{ deviceId: 'd1-new', versionName: '1.2.0', versionCode: 12, osApi: 34, model: 'Pixel', platform: 'android', firstSeen: '2026-01-05T00:00:00Z', lastSeen: '2026-10-15T00:00:00Z', hasPush: false, blocked: true }]);
    assert.ok(Array.isArray(b.audit));
    assert.equal('uid' in b.user && 'token' in b.user, false);
    await BlockedDevice.deleteMany({});
  });

  test('a slow, a failing and an unconfigured section are {unavailable, reason}; the rest still arrive; the page is bounded by the timeout', async () => {
    sources.walletMode = 'slow'; sources.ordersMode = 'down'; sources.callsMode = 'none';
    const t0 = Date.now();
    const r = await call('GET', `/admin/users/${await idOf('u01')}`);
    assert.ok(Date.now() - t0 < 350, 'does not wait for the slow section');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.wallet, { unavailable: true, reason: 'timeout' });
    assert.deepEqual(r.body.bookings, { unavailable: true, reason: 'upstream_error' });
    assert.deepEqual(r.body.calls, { unavailable: true, reason: 'not_configured' });
    assert.equal(r.body.events.registrations.length, 1, 'a healthy section is unaffected');
    assert.equal(r.body.user.uid, 'u01');
    sources.failDevices = true;
    assert.equal((await call('GET', `/admin/users/${await idOf('u01')}`)).body.devices.unavailable, true);
    sources.failDevices = false;
    sources.walletMode = sources.ordersMode = sources.callsMode = 'ok';
  });

  test('a section the operator may not see is "forbidden" and is never asked for; unknown / malformed ids are 404', async () => {
    const calls = [];
    const was = sources.wallet;
    sources.wallet = function spy() { calls.push('wallet'); return was.call(this); };
    const id = await idOf('u01');
    const r = await call('GET', `/admin/users/${id}`, { headers: admin(['devotees:view', 'calls:view']) });
    assert.deepEqual(r.body.wallet, { unavailable: true, reason: 'forbidden' });
    assert.deepEqual(r.body.audit, { unavailable: true, reason: 'forbidden' });
    assert.deepEqual(r.body.bookings, { unavailable: true, reason: 'forbidden' });
    assert.equal(r.body.calls.total, 0);
    assert.deepEqual(calls, [], 'the wallet service was not called');
    sources.wallet = was;
    assert.equal((await call('GET', '/admin/users/000000000000000000000009')).status, 404);
    assert.equal((await call('GET', '/admin/users/not-an-id')).status, 404);
  });

  test('masking: the pseudonym matches the wallet service\'s, and a masked profile carries no personal field', async () => {
    const { createRedactor: walletRedactor } = await import('../../wallet/src/lib/redact.js');
    const mine = createRedactor('some-secret-some-secret');
    const theirs = walletRedactor('some-secret-some-secret');
    for (const uid of ['u01', 'abc', '']) assert.equal(mine.pseudonym(uid), theirs.pseudonym(uid));
    assert.match(mine.pseudonym('u01'), /^Devotee ••\d{4}$/);
    const masked = mine.maskUser({ uid: 'u01', name: 'Asha', contact: '+919800000001', phone: '+919800000001', email: 'a@b.c', photoUrl: 'http://p', bio: 'hi', dob: '1990-01-01', gender: 'female', role: 'devotee', blocked: true, tags: ['vip'] });
    assert.equal(masked.name, mine.pseudonym('u01'));
    assert.equal(masked.contact, mine.pseudonym('u01'));
    assert.deepEqual([masked.phone, masked.email, masked.photoUrl, masked.bio, masked.dob, masked.gender], [null, null, null, '', null, null]);
    assert.deepEqual([masked.role, masked.blocked, masked.tags], ['devotee', true, ['vip']], 'operational fields stay');
  });

  test('a role without devotees:view reaches neither the list nor the 360 (the route gate), so no personal data leaves', async () => {
    for (const perms of [[], ['wallets:view', 'orders:view', 'audit:view'], ['devotees:edit'].filter(() => false)]) {
      assert.equal((await list({}, admin(perms))).status, 403);
      assert.equal((await call('GET', `/admin/users/${await idOf('u01')}`, { headers: admin(perms) })).status, 403);
    }
  });
});

describe('block, unblock, sign-out', () => {
  test('validation: reason and message are required; until must be in the future and sane; nothing is written on a 400', async () => {
    const id = await idOf('u08');
    const bad = await call('POST', `/admin/users/${id}/block`, { body: { reason: '  ', until: 'nope', alsoBlockDevices: 'yes' } });
    assert.deepEqual([bad.status, bad.body.code], [400, 'bad_block']);
    assert.deepEqual(Object.keys(bad.body.fields).sort(), ['alsoBlockDevices', 'message', 'reason', 'until']);
    const past = await call('POST', `/admin/users/${id}/block`, { body: { reason: 'r', message: 'm', until: new Date(clock.getTime() - 1000).toISOString() } });
    assert.equal(past.body.fields.until, 'The end date must be in the future.');
    assert.ok((await call('POST', `/admin/users/${id}/block`, { body: { reason: 'r', message: 'm', until: '2099-01-01T00:00:00Z' } })).body.fields.until, 'absurdly far');
    assert.ok((await call('POST', `/admin/users/${id}/block`, { body: { reason: 'x'.repeat(301), message: 'm' } })).body.fields.reason);
    assert.ok((await call('POST', `/admin/users/${id}/block`, { body: { reason: 'r', message: 'm', messageHi: 'x'.repeat(301) } })).body.fields.messageHi);
    assert.equal((await User.findOne({ uid: 'u08' }).lean()).blocked, false);
    assert.equal(parseBlockBody({ reason: 'r', message: 'm', until: '' }, now()).value.until, null, 'an empty end date = until I unblock');
    assert.equal((await call('POST', '/admin/users/000000000000000000000009/block', { body: { reason: 'r', message: 'm' } })).status, 404);
  });

  test('block: stored with the history, Firebase refresh tokens revoked, the status route says why - without the internal reason; audit before/after', async () => {
    const id = await idOf('u08');
    fb.revoked = [];
    const until = new Date(clock.getTime() + 7 * 86_400_000).toISOString();
    const r = await call('POST', `/admin/users/${id}/block`, { body: { reason: 'harassing astrologers', message: 'Your account is blocked for 7 days.', messageHi: 'आपका खाता 7 दिन के लिए ब्लॉक है।', until } });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.blocked, true);
    assert.equal(r.body.user.blockUntil, until);
    assert.deepEqual(r.body.user.block, { active: true, scope: 'account', reason: 'harassing astrologers', message: 'Your account is blocked for 7 days.', messageHi: 'आपका खाता 7 दिन के लिए ब्लॉक है।', until, at: clock.toISOString(), by: 'root' });
    assert.deepEqual(r.body.user.blockHistory.map((h) => [h.action, h.by]), [['block', 'root']]);
    assert.deepEqual(fb.revoked, ['u08']);
    assert.deepEqual(r.audit.before, { blocked: false, until: null, reason: '', message: '', messageHi: '' });
    assert.equal(r.audit.after.blocked, true);
    assert.equal(r.audit.after.reason, 'harassing astrologers');
    assert.equal((await User.findOne({ uid: 'u08' }).lean()).blocked, true, 'the old boolean is kept');

    const st = await call('GET', '/users/u08/status', { headers: devoteeAuth('u08') });
    assert.deepEqual(st.body, { exists: true, blocked: true, name: 'Gita Devi', role: 'devotee', block: { message: 'Your account is blocked for 7 days.', messageHi: 'आपका खाता 7 दिन के लिए ब्लॉक है।', until } });
    assert.equal(JSON.stringify(st.body).includes('harassing'), false, 'the internal reason never reaches the phone');
  });

  test('blocking again is idempotent: it updates the message and end date, adds a history row, keeps one block', async () => {
    const id = await idOf('u08');
    const r = await call('POST', `/admin/users/${id}/block`, { body: { reason: 'second look', message: 'Blocked until further notice.' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.block.until, null);
    assert.equal(r.body.user.block.message, 'Blocked until further notice.');
    assert.deepEqual(r.body.user.blockHistory.map((h) => h.action), ['block', 'block'], 'newest first');
    assert.equal(r.audit.before.reason, 'harassing astrologers');
    assert.equal(r.audit.after.reason, 'second look');
    assert.equal(await User.countDocuments({ uid: 'u08' }), 1);
  });

  test('history keeps the last 20 rows', async () => {
    const id = await idOf('u09');
    for (let i = 0; i < 23; i += 1) await call('POST', `/admin/users/${id}/block`, { body: { reason: `r${i}`, message: 'm' } });
    const u = await User.findOne({ uid: 'u09' }).lean();
    assert.equal(u.blockHistory.length, 20);
    assert.equal(u.blockHistory[19].reason, 'r22');
    assert.equal(u.blockHistory[0].reason, 'r3');
    await call('POST', `/admin/users/${id}/unblock`, { body: {} });
  });

  test('blocking an astrologer also needs astrologers:edit', async () => {
    const id = await idOf('u04');
    const r = await call('POST', `/admin/users/${id}/block`, { headers: admin(['devotees:view', 'devotees:edit']), body: { reason: 'r', message: 'm' } });
    assert.deepEqual([r.status, r.body.needs], [403, 'astrologers:edit']);
    assert.equal((await User.findOne({ uid: 'u04' }).lean()).blocked, false);
    assert.equal((await call('POST', `/admin/users/${id}/block`, { headers: admin([...VIEW_ONLY, 'devotees:edit', 'astrologers:edit']), body: { reason: 'r', message: 'm' } })).status, 200);
    await call('POST', `/admin/users/${id}/unblock`, { body: {} });
  });

  test('unblock: lifts the block, writes the history, does not revoke; unblocking a free account changes nothing', async () => {
    const id = await idOf('u08');
    fb.revoked = [];
    const r = await call('POST', `/admin/users/${id}/unblock`, { body: { note: 'appealed, fine now' } });
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.user.blocked, r.body.user.block.active, r.body.user.blockUntil], [false, false, null]);
    assert.deepEqual(r.body.user.blockHistory.map((h) => [h.action, h.reason]).slice(0, 1), [['unblock', 'appealed, fine now']]);
    assert.deepEqual(fb.revoked, []);
    assert.deepEqual(r.audit.before.blocked, true);
    assert.deepEqual(r.audit.after.blocked, false);
    assert.equal((await call('GET', '/users/u08/status', { headers: devoteeAuth('u08') })).body.blocked, false);
    const again = await call('POST', `/admin/users/${id}/unblock`, { body: {} });
    assert.equal(again.body.unchanged, true);
    assert.equal(again.body.user.blockHistory.filter((h) => h.action === 'unblock').length, 1, 'no second history row');
    assert.equal((await call('POST', `/admin/users/${id}/unblock`, { body: { note: 'x'.repeat(301) } })).status, 400);
  });

  test('a timed block stops applying the instant it runs out (status route, sync, list), BEFORE the sweeper; the sweeper then writes auto_unblock once', async () => {
    const id = await idOf('u10');
    await call('POST', `/admin/users/${id}/block`, { body: { reason: 'cool-off', message: 'Back in an hour.', until: new Date(clock.getTime() + 3600_000).toISOString() } });
    assert.equal((await call('GET', '/users/u10/status', { headers: devoteeAuth('u10') })).body.blocked, true);
    const sync = () => call('POST', '/auth/sync', { headers: devoteeAuth('u10', '+919888888880'), body: {} });
    const s1 = await sync();
    assert.equal(s1.status, 403);
    assert.deepEqual([s1.body.code, s1.body.error, s1.body.message, s1.body.support], ['account_blocked', 'account blocked', 'Back in an hour.', {}]);
    assert.equal(typeof s1.body.until, 'string');
    assert.equal(JSON.stringify(s1.body).includes('cool-off'), false);
    advance(3600_001);
    assert.equal((await call('GET', '/users/u10/status', { headers: devoteeAuth('u10') })).body.blocked, false, 'expired = not blocked, no action needed');
    assert.equal((await sync()).status, 200, 'a blocked account whose time is up signs in again');
    advance(0);
    // (sync above must not have un-set the stored flag: only the sweeper does)
    const swept = await sweepExpiredBlocks(now());
    assert.equal(swept.accounts >= 1, true);
    const u = await User.findOne({ uid: 'u10' }).lean();
    assert.deepEqual([u.blocked, u.block.active], [false, false]);
    assert.deepEqual(u.blockHistory.map((h) => [h.action, h.by]).slice(-1), [['auto_unblock', 'system']]);
    assert.deepEqual(await sweepExpiredBlocks(now()), { accounts: 0, devices: 0 }, 'idempotent');
    assert.equal(u.blockHistory.filter((h) => h.action === 'auto_unblock').length, 1);
    assert.equal(isBlocked({ blocked: true }), true, 'a bare legacy flag is blocked');
    assert.equal(isBlocked({ blocked: true, block: { active: true, until: new Date(0) } }), false);
    assert.equal(isBlocked({ blocked: false, block: { active: true, until: null } }), true);
  });

  test('sign-out revokes the refresh tokens; no uid is 409; an unconfigured Firebase is reported, not pretended', async () => {
    const id = await idOf('u03');
    fb.revoked = [];
    const r = await call('POST', `/admin/users/${id}/sign-out`);
    assert.deepEqual([r.status, r.body], [200, { revoked: true }]);
    assert.deepEqual(fb.revoked, ['u03']);
    fb.configured = false;
    assert.deepEqual((await call('POST', `/admin/users/${id}/sign-out`)).body, { revoked: false, reason: 'firebase_not_configured' });
    fb.configured = true;
    const noUid = await User.create({ contact: 'legacy@example.com', name: 'Legacy' });
    assert.equal((await call('POST', `/admin/users/${noUid._id}/sign-out`)).status, 409);
    await User.deleteOne({ _id: noUid._id });
  });

  test('the legacy PUT { blocked } still works and now leaves a real block record with a stock message', async () => {
    const id = await idOf('u11');
    const r = await call('PUT', `/admin/users/${id}`, { body: { blocked: true } });
    assert.equal(r.body.blocked, true);
    const u = await User.findOne({ uid: 'u11' }).lean();
    assert.equal(u.block.active, true);
    assert.match(u.block.message, /blocked/i);
    assert.equal(u.blockHistory.length, 1);
    await call('PUT', `/admin/users/${id}`, { body: { blocked: false } });
    assert.equal((await User.findOne({ uid: 'u11' }).lean()).blocked, false);
  });
});

describe('blocked devices', () => {
  test('add (201) / change (200) / list / remove; validation; the audit detail', async () => {
    const bad = await call('POST', '/admin/blocked-devices', { body: { deviceId: 'has space', reason: '', message: '' } });
    assert.deepEqual([bad.status, bad.body.code], [400, 'bad_block']);
    assert.deepEqual(Object.keys(bad.body.fields).sort(), ['deviceId', 'message', 'reason']);
    const add = await call('POST', '/admin/blocked-devices', { body: { deviceId: 'dev-abc', reason: 'ban evasion', message: 'This device is blocked.', messageHi: 'यह डिवाइस ब्लॉक है।' } });
    assert.equal(add.status, 201);
    assert.deepEqual([add.body.device.deviceId, add.body.device.active, add.body.device.by, add.body.device.until], ['dev-abc', true, 'root', null]);
    assert.equal(add.audit.before, null);
    assert.equal(add.audit.after.deviceId, 'dev-abc');
    const change = await call('POST', '/admin/blocked-devices', { body: { deviceId: 'dev-abc', reason: 'again', message: 'Still blocked.' } });
    assert.equal(change.status, 200);
    assert.equal(change.audit.before.reason, 'ban evasion');
    assert.equal(await BlockedDevice.countDocuments({ deviceId: 'dev-abc' }), 1);
    assert.equal((await call('GET', '/admin/blocked-devices')).body.devices.length, 1);
    const rm = await call('DELETE', '/admin/blocked-devices/dev-abc');
    assert.equal(rm.status, 200);
    assert.equal(rm.audit.before.deviceId, 'dev-abc');
    assert.equal((await call('DELETE', '/admin/blocked-devices/dev-abc')).status, 200, 'idempotent');
    assert.deepEqual((await call('GET', '/admin/blocked-devices')).body.devices, []);
  });

  test('the mobile status: only the words for the person; an expired device block is not a block, and the sweeper deletes it', async () => {
    await call('POST', '/admin/blocked-devices', { body: { deviceId: 'dev-timed', reason: 'internal only', message: 'Blocked.', until: new Date(clock.getTime() + 1000).toISOString() } });
    const st = await call('GET', '/devices/dev-timed/status', { headers: bff() });
    assert.equal(st.body.blocked, true);
    assert.equal(st.body.message, 'Blocked.');
    assert.equal(JSON.stringify(st.body).includes('internal only'), false);
    assert.deepEqual((await call('GET', '/devices/never-seen/status', { headers: bff() })).body, { blocked: false });
    advance(2000);
    assert.deepEqual((await call('GET', '/devices/dev-timed/status', { headers: bff() })).body, { blocked: false });
    assert.equal((await sweepExpiredBlocks(now())).devices, 1);
    assert.equal(await BlockedDevice.countDocuments(), 0);
  });

  test('alsoBlockDevices blocks the registered and sign-in device ids; unblockDevices lifts exactly those; default is off', async () => {
    sources.devices = [{ uid: 'u05', deviceId: 'reg-1', lastSeen: '2026-10-10T00:00:00Z' }, { uid: 'u05', deviceId: 'reg-2', lastSeen: '2026-10-11T00:00:00Z' }];
    await User.updateOne({ uid: 'u05' }, { $set: { deviceId: 'signin-1' } });
    const id = await idOf('u05');
    await call('POST', `/admin/users/${id}/block`, { body: { reason: 'r', message: 'm' } });
    assert.equal(await BlockedDevice.countDocuments(), 0, 'off by default');
    const r = await call('POST', `/admin/users/${id}/block`, { body: { reason: 'r', message: 'm', alsoBlockDevices: true } });
    assert.equal(r.body.devicesBlocked, 3);
    assert.deepEqual((await BlockedDevice.find().lean()).map((b) => b.deviceId).sort(), ['reg-1', 'reg-2', 'signin-1']);
    assert.equal((await BlockedDevice.findOne({ deviceId: 'reg-1' }).lean()).uid, 'u05');
    assert.equal(r.audit.after.devicesBlocked, 3);
    await call('POST', `/admin/users/${id}/block`, { body: { reason: 'r', message: 'm', alsoBlockDevices: true } });
    assert.equal(await BlockedDevice.countDocuments(), 3, 'idempotent');
    const lift = await call('POST', `/admin/users/${id}/unblock`, { body: { unblockDevices: true } });
    assert.equal(lift.body.devicesUnblocked, 3);
    assert.equal(await BlockedDevice.countDocuments(), 0);
    sources.devices = [];
  });
});

describe('tags and notes', () => {
  test('tags: add / remove, normalised, deduplicated, at most 10, each at most 24; invalid input is a 400 and changes nothing', async () => {
    const id = await idOf('u12');
    const r = await call('POST', `/admin/users/${id}/tags`, { body: { add: ['  Early Adopter ', 'vip', 'VIP'] } });
    assert.deepEqual(r.body.user.tags, ['early-adopter', 'vip']);
    assert.deepEqual(r.audit, { before: { tags: [] }, after: { tags: ['early-adopter', 'vip'] } });
    assert.deepEqual((await call('POST', `/admin/users/${id}/tags`, { body: { remove: ['vip', 'ghost'] } })).body.user.tags, ['early-adopter']);
    assert.equal((await call('POST', `/admin/users/${id}/tags`, { body: { add: ['bad tag!'] } })).body.code, 'bad_tags');
    assert.equal((await call('POST', `/admin/users/${id}/tags`, { body: { add: ['x'.repeat(25)] } })).status, 400);
    assert.equal((await call('POST', `/admin/users/${id}/tags`, { body: {} })).status, 400, 'nothing to do');
    assert.equal((await call('POST', `/admin/users/${id}/tags`, { body: { add: 'vip' } })).status, 400);
    const many = Array.from({ length: 10 }, (_, i) => `t${i}`);
    assert.equal((await call('POST', `/admin/users/${id}/tags`, { body: { add: many } })).body.fields.add, 'At most 10 tags per person.');
    assert.deepEqual((await User.findOne({ uid: 'u12' }).lean()).tags, ['early-adopter'], 'a refused change writes nothing');
    assert.equal((await call('POST', `/admin/users/${id}/tags`, { body: { add: many.slice(0, 9) } })).status, 200);
    assert.deepEqual([cleanTag('A b'), cleanTag('-x'), cleanTag(5)], ['a-b', null, null]);
    assert.deepEqual(applyTags(['a'], { add: ['b'], remove: ['a'] }).tags, ['b']);
  });

  test('notes: newest first, 500 chars, at most 50 kept; author or devotees:edit may delete', async () => {
    const id = await idOf('u12');
    assert.equal((await call('POST', `/admin/users/${id}/notes`, { body: { text: '  ' } })).status, 400);
    assert.equal((await call('POST', `/admin/users/${id}/notes`, { body: { text: 'x'.repeat(501) } })).body.code, 'bad_note');
    const a = await call('POST', `/admin/users/${id}/notes`, { body: { text: 'first note' } });
    assert.equal(a.status, 201);
    const b = await call('POST', `/admin/users/${id}/notes`, { headers: admin(['devotees:view', 'devotees:edit'], 'sita', 'op-sita'), body: { text: 'second note' } });
    assert.deepEqual(b.body.user.notes.map((n) => [n.text, n.by]), [['second note', 'sita'], ['first note', 'root']]);
    // someone with view only cannot delete another's note; the author (even view-only) can delete their own
    const other = await call('DELETE', `/admin/users/${id}/notes/${a.body.note.id}`, { headers: admin(VIEW_ONLY, 'zed', 'op-zed') });
    assert.deepEqual([other.status, other.body.needs], [403, 'devotees:edit']);
    const own = await call('DELETE', `/admin/users/${id}/notes/${b.body.note.id}`, { headers: admin(VIEW_ONLY, 'sita', 'op-sita') });
    assert.equal(own.status, 200);
    assert.deepEqual(own.body.user.notes.map((n) => n.text), ['first note']);
    assert.equal((await call('DELETE', `/admin/users/${id}/notes/${a.body.note.id}`)).status, 200, 'an editor removes any');
    assert.equal((await call('DELETE', `/admin/users/${id}/notes/nope`)).status, 404);
    for (let i = 0; i < 53; i += 1) await User.updateOne({ uid: 'u12' }, { $push: { notes: { $each: [{ id: `n${i}`, text: 't', by: 'x', at: new Date() }], $position: 0, $slice: 50 } } });
    const full = await call('POST', `/admin/users/${id}/notes`, { body: { text: 'newest' } });
    assert.equal(full.body.user.notes.length, 50);
    assert.equal(full.body.user.notes[0].text, 'newest');
  });
});

describe('CSV export pages', () => {
  const exp = (o = {}, h) => call('GET', `/admin/users/export${qs(o)}`, h ? { headers: h } : undefined);

  test('needs devotees:edit; rows are real (never masked); pages walk every row once by _id; the audit row is written once, up front, with the filter and the count', async () => {
    assert.equal((await exp({}, admin(VIEW_ONLY))).status, 403);
    await AuditLog.deleteMany({});
    const seen = [];
    let cursor;
    let pages = 0;
    do {
      const r = await exp({ limit: '5', cursor, already: String(seen.length) });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      seen.push(...r.body.rows);
      cursor = r.body.next ?? undefined;
      pages += 1;
      if (pages === 1) assert.equal(r.body.expected, 12);
    } while (cursor && pages < 10);
    assert.equal(seen.length, 12);
    assert.equal(new Set(seen.map((x) => x.id)).size, 12);
    const first = seen.find((x) => x.uid === 'u01');
    assert.deepEqual([first.name, first.contact, first.method, first.role, first.blocked, first.tags], ['Asha Rao', '+919800000001', 'phone', 'devotee', false, ['vip']]);
    assert.equal(Object.keys(first).sort().join(), 'blocked,contact,createdAt,id,lastActive,method,name,role,tags,uid,version');
    const rows = await AuditLog.find({ path: '/api/admin/users/export' }).lean();
    assert.equal(rows.length, 1, 'one audit row per export, not per page');
    assert.deepEqual([rows[0].operator, rows[0].area, rows[0].method, rows[0].after.rows, rows[0].after.capped], ['root', 'devotees', 'GET', 12, false]);
  });

  test('filters narrow the export and are recorded in the audit row; version comes from the registry', async () => {
    sources.devices = [{ uid: 'u01', deviceId: 'd1', versionName: '1.2.0', versionCode: 12, lastSeen: '2026-10-15T00:00:00Z' }];
    await AuditLog.deleteMany({});
    const r = await exp({ tag: 'vip', q: 'asha' });
    assert.deepEqual(r.body.rows.map((x) => [x.uid, x.version]), [['u01', '1.2.0 (12)']]);
    const row = await AuditLog.findOne({ path: '/api/admin/users/export' }).lean();
    assert.deepEqual([row.after.filter.tag, row.after.filter.q, row.after.rows], ['vip', 'asha', 1]);
    assert.equal((await exp({ status: 'bogus' })).status, 400);
    assert.equal((await exp({ cursor: 'zzz' })).body.code, 'bad_cursor');
    sources.failDevices = true;
    assert.equal((await exp({ tag: 'vip' })).body.versionsUnavailable, true);
    sources.failDevices = false;
    sources.devices = [];
  });

  test('the cap: the page that crosses EXPORT_CAP is cut and marked capped, and nothing follows', async () => {
    assert.equal(EXPORT_CAP, 50_000);
    const r = await exp({ already: String(EXPORT_CAP - 3), limit: '1000' });
    assert.equal(r.body.rows.length, 3);
    assert.equal(r.body.capped, true);
    assert.equal(r.body.next, null);
    const after = await exp({ already: String(EXPORT_CAP), limit: '1000', cursor: '000000000000000000000001' });
    assert.deepEqual([after.body.rows.length, after.body.next], [0, null]);
  });
});

describe('delete', () => {
  test('needs the typed confirmation (the contact in any case, or the last 6 of the uid), removes the Firebase account, and is audited', async () => {
    const u = await User.create({ uid: 'firebase-uid-ABC123', contact: 'Del.Me@Example.com', name: 'Del Me', method: 'google' });
    fb.deleted = [];
    for (const body of [undefined, {}, { confirm: '' }, { confirm: 'nope' }, { confirm: 'ABC12' }]) {
      const r = await call('DELETE', `/admin/users/${u._id}`, body === undefined ? undefined : { body });
      assert.deepEqual([r.status, r.body.code], [400, 'confirm_mismatch'], JSON.stringify(body));
    }
    assert.equal(await User.countDocuments({ _id: u._id }), 1);
    const ok = await call('DELETE', `/admin/users/${u._id}`, { body: { confirm: 'del.me@example.COM' } });
    assert.equal(ok.status, 200);
    assert.deepEqual(fb.deleted, ['firebase-uid-ABC123']);
    assert.deepEqual(ok.audit.before, { role: 'devotee', blocked: false, tags: [] });
    const u2 = await User.create({ uid: 'firebase-uid-XYZ789', contact: '+919000000000', name: 'Two' });
    assert.equal((await call('DELETE', `/admin/users/${u2._id}`, { body: { confirm: 'XYZ789' } })).status, 200);
    assert.equal((await call('DELETE', `/admin/users/${u2._id}`, { headers: admin(VIEW_ONLY), body: { confirm: 'XYZ789' } })).status, 403);
  });
});

describe('boot migration', () => {
  test('a bare legacy `blocked: true` becomes a real block with a stock message and a history row; idempotent; search copies are backfilled', async () => {
    await User.collection.insertOne({ uid: 'legacy-1', contact: '+919000011111', name: ' Mixed Case ', email: 'Legacy@Example.com', blocked: true, updatedAt: new Date('2026-05-05T00:00:00Z'), createdAt: new Date('2026-01-01T00:00:00Z'), lastActive: new Date('2026-05-05T00:00:00Z') });
    await User.collection.insertOne({ uid: 'legacy-2', contact: '+919000022222', blocked: false });
    await migrateUserBlocks();
    const a = await User.findOne({ uid: 'legacy-1' }).lean();
    assert.deepEqual([a.block.active, a.block.by, a.block.until, a.nameLower, a.emailLower], [true, 'migration', null, 'mixed case', 'legacy@example.com']);
    assert.match(a.block.message, /blocked/i);
    assert.equal(a.blockHistory.length, 1);
    assert.equal(a.block.at.toISOString(), '2026-05-05T00:00:00.000Z', 'dated from the row, not from the migration');
    await migrateUserBlocks();
    assert.equal((await User.findOne({ uid: 'legacy-1' }).lean()).blockHistory.length, 1, 'second run changes nothing');
    const b = await User.findOne({ uid: 'legacy-2' }).lean();
    assert.deepEqual([b.block ?? null, b.nameLower, b.emailLower], [null, '', undefined]);
    assert.equal((await call('GET', '/users/legacy-1/status', { headers: devoteeAuth('legacy-1') })).body.block.message.length > 0, true);
    assert.equal((await list({ q: 'mixed', status: 'blocked' })).body.users[0]?.uid, 'legacy-1');
    await User.deleteMany({ uid: /^legacy-/ });
  });
});

describe('dashboard additions (selection export, audit summary)', () => {
  test('export honours ids=<comma list>: only those rows, and a bad list is a 400', async () => {
    const a = await idOf('u01'); const b = await idOf('u02');
    const r = await call('GET', `/admin/users/export${qs({ ids: `${a},${b}` })}`);
    assert.deepEqual(r.body.rows.map((x) => x.uid).sort(), ['u01', 'u02']);
    assert.equal(r.body.expected, 2);
    assert.equal((await call('GET', `/admin/users/export${qs({ ids: 'x,y' })}`)).status, 400);
  });
  test('360 audit rows carry at, operator, path and a summary', async () => {
    const r = await call('GET', `/admin/users/${await idOf('u08')}`);
    assert.ok(r.body.audit.length === 0 || (r.body.audit[0].summary && r.body.audit[0].at && r.body.audit[0].operator));
    await AuditLog.create({ operator: 'root', area: 'devotees', method: 'POST', path: `/api/admin/users/${await idOf('u08')}/block`, targetId: await idOf('u08'), status: 200 });
    const a = (await call('GET', `/admin/users/${await idOf('u08')}`)).body.audit[0];
    assert.deepEqual([a.operator, a.summary], ['root', 'POST block']);
  });
});
