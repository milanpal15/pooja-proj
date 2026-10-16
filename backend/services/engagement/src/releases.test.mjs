// App releases, the version policy, approvals, the device registry and the impact numbers (docs/RELEASES.md).
// Run: TEST_MONGODB_URI=mongodb://127.0.0.1:27141/x node --test --test-concurrency=1 src/releases.test.mjs
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, beforeEach, describe, test } from 'node:test';

import { ROLE_PERMISSIONS, decodeAuditDetail, signServiceToken } from '@bhakti/common';
import mongoose from 'mongoose';

import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { connectDb } from './db.js';
import { expireApprovals } from './lib/control.js';
import { ApprovalRequest, AppRelease, ControlSetting, VersionBlockCount, VersionPolicy, Visitor } from './models/index.js';
import { seedEngagement } from './seed.js';

const SECRET = 'test-secret-test-secret-1234';
const base = new URL(process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27141/x');
const config = loadConfig({ INTERNAL_JWT_SECRET: SECRET, MONGODB_URI: `${base.protocol}//${base.host}`, DB_NAME: 'engagement_releases_test' });

const ADMIN = ROLE_PERMISSIONS.admin;
const EDITOR = ROLE_PERMISSIONS.editor;
const VIEWER = ROLE_PERMISSIONS.viewer;

let server;
let url;
let clock = new Date('2026-10-16T10:00:00Z');
let approverCount = 2;
const quiet = { info() {}, warn() {}, error() {} };

before(async () => {
  await connectDb(config);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  await seedEngagement();
  const app = createApp(config, { isReady: () => true, logger: quiet, now: () => clock, approvers: { count: async () => approverCount } });
  server = http.createServer(app);
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((ok) => server.close(ok));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
beforeEach(async () => {
  clock = new Date('2026-10-16T10:00:00Z');
  approverCount = 2;
  await Promise.all([AppRelease.deleteMany({}), ApprovalRequest.deleteMany({}), VersionBlockCount.deleteMany({}), Visitor.deleteMany({}), ControlSetting.deleteMany({ key: 'approvalsEnabled' })]);
  await VersionPolicy.deleteMany({});
  await seedEngagement();
});

const tok = (o = {}) => signServiceToken({ iss: 'admin-bff', sub: 'op-alice', role: 'admin', perms: ADMIN, ctx: { username: 'alice' }, ...o }, { secret: SECRET });
const asOp = (perms = ADMIN, sub = 'op-alice', username = 'alice') => ({ authorization: `Bearer ${tok({ perms, sub, ctx: { username } })}` });
const phone = () => ({ authorization: `Bearer ${signServiceToken({ iss: 'mobile-bff', sub: null }, { secret: SECRET })}` });
const ALICE = () => asOp(ADMIN, 'op-alice', 'alice');
const BOB = () => asOp(ADMIN, 'op-bob', 'bob');

async function call(method, path, { headers = ALICE(), body } = {}) {
  const res = await fetch(`${url}/internal/engagement${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, audit: decodeAuditDetail(res.headers.get('x-audit-detail')), rawAudit: res.headers.get('x-audit-detail') };
}
const putPolicy = (body, headers) => call('PUT', '/admin/version-policy', { headers, body });
const policyNow = async () => (await call('GET', '/admin/releases')).body.policy;
const evaluate = (body) => call('POST', '/policy/evaluate', { headers: phone(), body });

describe('seed and in-place upgrade', () => {
  test('seeds one empty policy per platform with maintenance off, approvals on, no releases; seeding twice changes nothing', async () => {
    const r = (await call('GET', '/admin/releases')).body;
    assert.deepEqual(r.releases, []);
    assert.equal(r.approvalsEnabled, true);
    assert.deepEqual(r.pending, []);
    const p = r.policy;
    assert.deepEqual([p.platform, p.minVersionCode, p.recommendedVersionCode, p.blockedVersionCodes, p.minOsApi, p.graceUntil, p.snoozeDays, p.blockUnversioned, p.version], ['android', null, null, [], null, null, 3, false, 1]);
    assert.deepEqual(p.maintenance, { enabled: false, message: '', messageHi: '', until: null, allowUids: [] });
    await putPolicy({ message: 'Edited' });
    await seedEngagement();
    await seedEngagement();
    assert.equal(await VersionPolicy.countDocuments(), 1);
    assert.equal((await policyNow()).message, 'Edited', 'an operator edit survives a re-seed');
  });

  test('a device row written before the registry existed gets lastSeen from lastActive (idempotent), and keeps its old fields', async () => {
    await Visitor.collection.insertOne({ deviceId: 'old-1', model: 'Pixel', os: 'android', appVersion: '1.0.0', sessions: 4, firstSeen: new Date('2026-09-01'), lastActive: new Date('2026-10-10') });
    await seedEngagement();
    await seedEngagement();
    const v = await Visitor.findOne({ deviceId: 'old-1' }).lean();
    assert.equal(v.lastSeen.toISOString(), '2026-10-10T00:00:00.000Z');
    assert.deepEqual([v.model, v.appVersion, v.sessions], ['Pixel', '1.0.0', 4]);
    assert.equal(v.versionCode, undefined);
  });
});

describe('who may call what', () => {
  test('the policy routes are the mobile BFF\'s only; operators\' routes are checked against the signed permissions', async () => {
    for (const [m, p, b] of [['GET', '/policy'], ['POST', '/policy/evaluate', {}], ['POST', '/policy/blocked-counts', { counts: [] }]]) {
      assert.equal((await call(m, p, { headers: ALICE(), body: b })).status, 403, `${m} ${p} as admin-bff`);
      assert.equal((await call(m, p, { headers: {}, body: b })).status, 401, `${m} ${p} with no token`);
    }
    assert.equal((await call('GET', '/policy', { headers: phone() })).status, 200);
    assert.equal((await call('GET', '/admin/releases', { headers: phone() })).status, 403, 'a phone token holds no permissions');
    for (const [label, perms] of [['editor', EDITOR], ['viewer', VIEWER]]) {
      const h = asOp(perms);
      assert.equal((await call('GET', '/admin/releases', { headers: h })).status, 200, `${label} may look`);
      assert.equal((await call('GET', '/admin/approvals', { headers: h })).status, 200);
      assert.equal((await call('GET', '/admin/versions/usage', { headers: h })).status, 200);
      for (const [m, p, b] of [
        ['POST', '/admin/releases', { versionName: '1', versionCode: 1 }], ['PUT', '/admin/releases/000000000000000000000001', {}], ['POST', '/admin/releases/000000000000000000000001/withdraw'],
        ['PUT', '/admin/version-policy', { message: 'x' }], ['PUT', '/admin/approvals/settings', { approvalsEnabled: false }], ['POST', '/admin/approvals/000000000000000000000001/approve', {}],
        ['POST', '/admin/approvals/000000000000000000000001/reject', { note: 'n' }], ['POST', '/admin/approvals/000000000000000000000001/cancel', {}],
      ]) assert.equal((await call(m, p, { headers: h, body: b ?? {} })).status, 403, `${label} ${m} ${p}`);
    }
    const nothing = asOp(['content:edit']);
    for (const p of ['/admin/releases', '/admin/approvals', '/admin/approvals/settings', '/admin/versions/usage']) assert.equal((await call('GET', p, { headers: nothing })).status, 403, p);
    assert.equal((await call('POST', '/admin/version-policy/impact', { headers: nothing, body: {} })).status, 403);
  });
});

describe('device registry and the public decision (POST /policy/evaluate)', () => {
  test('upserts the device row: build, OS, model, uid; firstSeen sticks, lastSeen moves, nothing is counted twice', async () => {
    const r = await evaluate({ platform: 'android', versionCode: '12', osApi: 34, deviceId: 'dev-1', versionName: '1.4.0', model: 'Pixel 8', uid: 'uid-1' });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'ok');
    let v = await Visitor.findOne({ deviceId: 'dev-1' }).lean();
    assert.deepEqual([v.platform, v.versionName, v.versionCode, v.osApi, v.model, v.uid, v.appVersion], ['android', '1.4.0', 12, 34, 'Pixel 8', 'uid-1', '1.4.0']);
    assert.equal(v.lastSeen.toISOString(), clock.toISOString());
    const first = v.firstSeen.toISOString();
    clock = new Date('2026-10-16T12:00:00Z');
    await evaluate({ platform: 'android', versionCode: 13, osApi: 34, deviceId: 'dev-1', versionName: '1.4.1' });
    v = await Visitor.findOne({ deviceId: 'dev-1' }).lean();
    assert.deepEqual([v.versionCode, v.versionName, v.uid, v.model], [13, '1.4.1', 'uid-1', 'Pixel 8'], 'an anonymous later call does not erase the uid');
    assert.equal(v.firstSeen.toISOString(), first);
    assert.equal(v.lastSeen.toISOString(), '2026-10-16T12:00:00.000Z');
    assert.equal(await Visitor.countDocuments({ deviceId: 'dev-1' }), 1);
  });

  test('an existing analytics row is extended in place, keeping its sessions and push token', async () => {
    await Visitor.create({ deviceId: 'dev-2', sessions: 7, pushToken: 'ExponentPushToken[x]', appVersion: '1.0.0' });
    await evaluate({ versionCode: 5, deviceId: 'dev-2', versionName: '1.2.0' });
    const v = await Visitor.findOne({ deviceId: 'dev-2' }).lean();
    assert.deepEqual([v.sessions, v.pushToken, v.versionCode], [7, 'ExponentPushToken[x]', 5]);
  });

  test('junk is bounded or ignored: no row without a device id, non-numeric codes are not stored, NoSQL operators are not strings', async () => {
    assert.equal((await evaluate({ versionCode: 5 })).status, 200);
    assert.equal(await Visitor.countDocuments(), 0);
    assert.equal((await evaluate({ versionCode: 'abc', osApi: -4, deviceId: 'dev-3', versionName: 'x'.repeat(500), model: { $ne: 1 }, uid: { $gt: '' } })).status, 200);
    const v = await Visitor.findOne({ deviceId: 'dev-3' }).lean();
    assert.equal(v.versionCode, undefined);
    assert.equal(v.osApi, undefined);
    assert.equal(v.versionName.length, 40);
    assert.equal(v.model, undefined);
    assert.equal(v.uid, null);
    assert.equal((await evaluate({ deviceId: { $ne: null }, versionCode: 1 })).status, 200);
    assert.equal(await Visitor.countDocuments(), 1);
    assert.equal((await call('POST', '/policy/evaluate', { headers: phone() })).status, 200, 'no body at all');
  });

  test('another platform is not tracked and is simply ok', async () => {
    await putPolicy({ minVersionCode: 99 });
    const r = await evaluate({ platform: 'ios', versionCode: 1, deviceId: 'iphone' });
    assert.equal(r.body.status, 'ok');
    assert.equal(await Visitor.countDocuments({ deviceId: 'iphone' }), 0);
  });

  test('decides by the stored policy with release names, and by the signed-in uid for the maintenance allow-list', async () => {
    await call('POST', '/admin/releases', { body: { versionName: '1.5.0', versionCode: 8, status: 'live' } });
    approverCount = 1;
    await putPolicy({ minVersionCode: 8, recommendedVersionCode: 9, message: 'Please update', messageHi: 'अपडेट करें', storeUrl: 'https://play.google.com/store/apps/details?id=x', snoozeDays: 5, minOsApi: 28 });
    let r = (await evaluate({ versionCode: 5, osApi: 30, deviceId: 'a' })).body;
    assert.deepEqual([r.status, r.minVersionName, r.recommendedVersionName, r.message, r.messageHi, r.snoozeDays], ['update_required', '1.5.0', 'build 9', 'Please update', 'अपडेट करें', 5]);
    assert.equal((await evaluate({ versionCode: 8, osApi: 27, deviceId: 'b' })).body.status, 'unsupported_os');
    assert.equal((await evaluate({ versionCode: 8, osApi: 30, deviceId: 'c' })).body.status, 'update_available');
    assert.equal((await evaluate({ versionCode: 9, osApi: 30, deviceId: 'd' })).body.status, 'ok');
    await putPolicy({ maintenance: { enabled: true, message: 'Back at 6', allowUids: ['uid-tester'] } });
    assert.equal((await evaluate({ versionCode: 9, osApi: 30, deviceId: 'e' })).body.status, 'maintenance');
    assert.equal((await evaluate({ versionCode: 9, osApi: 30, deviceId: 'f', uid: 'uid-tester' })).body.status, 'ok');
  });

  test('GET /policy returns the policy and every release name for the BFF\'s gate', async () => {
    await call('POST', '/admin/releases', { body: { versionName: '1.0.0', versionCode: 1 } });
    await call('POST', '/admin/releases', { body: { versionName: '1.1.0', versionCode: 2, status: 'live' } });
    const g = (await call('GET', '/policy', { headers: phone() })).body;
    assert.equal(g.policy.version, 1);
    assert.deepEqual(g.policy.maintenance.allowUids, []);
    assert.deepEqual(g.releases.map((x) => [x.versionCode, x.versionName]).sort(), [[1, '1.0.0'], [2, '1.1.0']]);
  });
});

describe('blocked-request counters (POST /policy/blocked-counts)', () => {
  test('adds up per build per IST day; bad rows are skipped; the batch is bounded', async () => {
    const ok = await call('POST', '/policy/blocked-counts', { headers: phone(), body: { counts: [{ platform: 'android', versionCode: 5, count: 3 }, { platform: 'android', versionCode: null, count: 2 }, { versionCode: 5, count: 0 }, { versionCode: 5, count: 'x' }, {}] } });
    assert.deepEqual([ok.status, ok.body], [200, { ok: true, accepted: 2 }]);
    await call('POST', '/policy/blocked-counts', { headers: phone(), body: { counts: [{ versionCode: 5, count: 4 }] } });
    const rows = await VersionBlockCount.find().lean();
    assert.equal(rows.find((x) => x.versionCode === 5).count, 7);
    assert.equal(rows.find((x) => x.versionCode === null).count, 2);
    assert.equal(rows[0].day, '2026-10-16');
    clock = new Date('2026-10-16T19:00:00Z'); // 00:30 IST on the 17th
    await call('POST', '/policy/blocked-counts', { headers: phone(), body: { counts: [{ versionCode: 5, count: 1 }] } });
    assert.deepEqual((await VersionBlockCount.find({ versionCode: 5 }).sort({ day: 1 }).lean()).map((x) => [x.day, x.count]), [['2026-10-16', 7], ['2026-10-17', 1]]);
    assert.equal((await call('POST', '/policy/blocked-counts', { headers: phone(), body: { counts: 'no' } })).status, 400);
    assert.equal((await call('POST', '/policy/blocked-counts', { headers: phone(), body: { counts: Array.from({ length: 201 }, () => ({ versionCode: 1, count: 1 })) } })).status, 400);
  });
});

describe('releases', () => {
  test('create (draft by default), list newest build first, validate, no duplicates', async () => {
    const mk = (b, h) => call('POST', '/admin/releases', { headers: h, body: b });
    const a = await mk({ versionName: '1.0.0', versionCode: 1, notes: 'First', notesHi: 'पहला', storeUrl: 'https://play.google.com/x' });
    assert.equal(a.status, 201);
    assert.deepEqual([a.body.status, a.body.platform, a.body.createdBy, a.body.releasedAt, a.body.notesHi], ['draft', 'android', 'alice', null, 'पहला']);
    assert.deepEqual(a.audit.after.versionCode, 1);
    assert.equal(a.audit.before, null);
    const b = await mk({ versionName: '1.1.0', versionCode: 2, status: 'live' });
    assert.equal(b.body.releasedAt, clock.toISOString());
    assert.deepEqual((await call('GET', '/admin/releases')).body.releases.map((r) => r.versionCode), [2, 1]);
    const dup = await mk({ versionName: 'again', versionCode: 2 });
    assert.deepEqual([dup.status, dup.body.code], [409, 'release_exists']);
    for (const bad of [{}, { versionName: '', versionCode: 3 }, { versionName: 'x', versionCode: -1 }, { versionName: 'x', versionCode: 1.5 }, { versionName: 'x', versionCode: '3' }, { versionName: 'y'.repeat(41), versionCode: 3 },
      { versionName: 'x', versionCode: 3, storeUrl: 'javascript:alert(1)' }, { versionName: 'x', versionCode: 3, status: 'withdrawn' }, { versionName: 'x', versionCode: 3, notes: 'n'.repeat(2001) }, { versionName: 'x', versionCode: 3, releasedAt: 'soon' }]) {
      const r = await mk(bad);
      assert.deepEqual([r.status, r.body.code], [400, 'bad_release'], JSON.stringify(bad).slice(0, 80));
      assert.ok(Object.keys(r.body.fields).length >= 1);
    }
    assert.equal(await AppRelease.countDocuments(), 2);
  });

  test('edit: notes, name, draft -> live; the version code is immutable; a withdrawn release stays withdrawn', async () => {
    const id = (await call('POST', '/admin/releases', { body: { versionName: '1.0.0', versionCode: 1 } })).body._id;
    const up = await call('PUT', `/admin/releases/${id}`, { body: { notes: 'Fixed things', status: 'live' } });
    assert.equal(up.status, 200);
    assert.deepEqual([up.body.notes, up.body.status, up.body.releasedAt], ['Fixed things', 'live', clock.toISOString()]);
    assert.deepEqual([up.audit.before.status, up.audit.after.status], ['draft', 'live']);
    assert.equal((await call('PUT', `/admin/releases/${id}`, { body: { versionCode: 9 } })).body.fields.versionCode.includes('cannot be changed'), true);
    assert.equal((await call('PUT', `/admin/releases/${id}`, { body: { versionCode: 1, versionName: '1.0.1' } })).body.versionName, '1.0.1', 'sending the same code is fine');
    assert.equal((await call('PUT', `/admin/releases/${id}`, { body: { versionName: '' } })).status, 400);
    assert.equal((await call('PUT', '/admin/releases/000000000000000000000009', { body: {} })).status, 404);
    assert.equal((await call('PUT', '/admin/releases/zzz', { body: {} })).status, 400);
    const w = await call('POST', `/admin/releases/${id}/withdraw`);
    assert.deepEqual([w.status, w.body.status], [200, 'withdrawn']);
    assert.equal((await call('POST', `/admin/releases/${id}/withdraw`)).status, 409);
    assert.equal((await call('PUT', `/admin/releases/${id}`, { body: { status: 'live' } })).status, 400);
    assert.equal((await call('POST', '/admin/releases/000000000000000000000009/withdraw')).status, 404);
  });
});

describe('PUT /admin/version-policy: validation', () => {
  const bad = async (body, field) => {
    const r = await putPolicy(body);
    assert.deepEqual([r.status, r.body.code], [400, 'bad_policy'], JSON.stringify(body));
    assert.ok(r.body.fields[field], `${field} in ${JSON.stringify(r.body.fields)}`);
  };
  test('every rule of the contract', async () => {
    await bad({ minVersionCode: -1 }, 'minVersionCode');
    await bad({ minVersionCode: 1.5 }, 'minVersionCode');
    await bad({ minVersionCode: '5' }, 'minVersionCode');
    await bad({ recommendedVersionCode: 'x' }, 'recommendedVersionCode');
    await bad({ minOsApi: -2 }, 'minOsApi');
    await bad({ minVersionCode: 9, recommendedVersionCode: 8 }, 'recommendedVersionCode');
    await bad({ blockedVersionCodes: Array.from({ length: 51 }, (_, i) => i) }, 'blockedVersionCodes');
    await bad({ blockedVersionCodes: [1, -1] }, 'blockedVersionCodes');
    await bad({ blockedVersionCodes: 'x' }, 'blockedVersionCodes');
    await bad({ message: 'm'.repeat(301) }, 'message');
    await bad({ messageHi: 5 }, 'messageHi');
    await bad({ storeUrl: 'ftp://x' }, 'storeUrl');
    await bad({ snoozeDays: 0 }, 'snoozeDays');
    await bad({ snoozeDays: 31 }, 'snoozeDays');
    await bad({ snoozeDays: 2.5 }, 'snoozeDays');
    await bad({ graceUntil: 'tomorrow-ish' }, 'graceUntil');
    await bad({ blockUnversioned: 'yes' }, 'blockUnversioned');
    await bad({ maintenance: 'on' }, 'maintenance');
    await bad({ maintenance: { enabled: 1 } }, 'maintenance.enabled');
    await bad({ maintenance: { until: 'later' } }, 'maintenance.until');
    await bad({ maintenance: { message: 'm'.repeat(301) } }, 'maintenance.message');
    await bad({ maintenance: { allowUids: Array.from({ length: 51 }, (_, i) => `u${i}`) } }, 'maintenance.allowUids');
    await bad({ maintenance: { allowUids: [5] } }, 'maintenance.allowUids');
    const r = await putPolicy({ minVersionCode: -1, snoozeDays: 99 });
    assert.deepEqual(Object.keys(r.body.fields).sort(), ['minVersionCode', 'snoozeDays'], 'every problem is reported at once');
    assert.equal((await policyNow()).version, 1, 'nothing was applied');
  });

  test('accepts the edges: 300-char message, 50 blocked builds, 50 allow-listed ids, snooze 1 and 30, recommended == min, empty clears', async () => {
    approverCount = 1;
    const r = await putPolicy({
      message: 'm'.repeat(300), blockedVersionCodes: Array.from({ length: 50 }, (_, i) => 100 + i), maintenance: { allowUids: Array.from({ length: 50 }, (_, i) => `u${i}`) }, snoozeDays: 30,
      minVersionCode: 4, recommendedVersionCode: 4, storeUrl: 'market://details?id=com.x',
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal((await putPolicy({ snoozeDays: 1, storeUrl: '', message: '', minVersionCode: null, recommendedVersionCode: null, blockedVersionCodes: [] })).status, 200);
    const p = await policyNow();
    assert.deepEqual([p.snoozeDays, p.minVersionCode, p.blockedVersionCodes, p.storeUrl], [1, null, [], '']);
  });

  test('dedupes and sorts block lists, trims text, merges a PARTIAL body over the current policy', async () => {
    await putPolicy({ message: '  hello  ', blockedVersionCodes: [], recommendedVersionCode: 3, maintenance: { message: 'm1' } });
    approverCount = 1;
    await putPolicy({ blockedVersionCodes: [9, 3, 9, 5] });
    await putPolicy({ maintenance: { messageHi: 'हिं' } });
    const p = await policyNow();
    assert.deepEqual([p.message, p.blockedVersionCodes, p.recommendedVersionCode, p.maintenance.message, p.maintenance.messageHi], ['hello', [3, 5, 9], 3, 'm1', 'हिं']);
    const ignored = await putPolicy({ version: 99, platform: 'ios', updatedBy: 'evil', message: 'ok' });
    assert.equal(ignored.status, 200);
    assert.deepEqual([(await policyNow()).platform, (await policyNow()).updatedBy], ['android', 'alice']);
  });
});

describe('PUT /admin/version-policy: risky or not (docs/RELEASES.md section 5)', () => {
  const baseline = async (extra = {}) => {
    approverCount = 1; // set the starting point without a second approver
    await putPolicy({ minVersionCode: 5, recommendedVersionCode: 7, blockedVersionCodes: [3], minOsApi: 26, graceUntil: '2026-11-01T00:00:00Z', snoozeDays: 3, message: 'm', ...extra });
    approverCount = 2;
    return (await policyNow()).version;
  };

  const RISKY = {
    'the minimum is raised': { minVersionCode: 6 },
    'a minimum appears where there was none': null, // handled below
    'a build is added to the blocked list': { blockedVersionCodes: [3, 4] },
    'maintenance is turned on': { maintenance: { enabled: true, message: 'down' } },
    'blockUnversioned is turned on': { blockUnversioned: true },
    'the grace date is brought earlier': { graceUntil: '2026-10-20T00:00:00Z' },
    'the grace date is removed (enforcement starts at once)': { graceUntil: null },
  };
  for (const [name, change] of Object.entries(RISKY)) {
    if (!change) continue;
    test(`RISKY - ${name}: sent for approval (202), nothing applied, the request records before/after`, async () => {
      const v0 = await baseline();
      const r = await putPolicy(change);
      assert.equal(r.status, 202, JSON.stringify(r.body));
      assert.equal(r.body.approval.status, 'pending');
      assert.equal(r.body.version, v0);
      assert.equal((await policyNow()).version, v0, 'unchanged');
      const a = await ApprovalRequest.findById(r.body.approval._id).lean();
      assert.deepEqual([a.requestedBy, a.status, a.selfApproved], ['alice', 'pending', false]);
      assert.equal(new Date(a.expiresAt) - new Date(a.requestedAt), 24 * 3600_000);
      assert.equal(a.payload.before.minVersionCode, 5);
      assert.ok(r.body.approval.summary.length > 0);
      assert.ok(r.audit?.after, 'before/after reach the audit trail');
    });
  }

  test('RISKY - a first-ever minimum is a raise', async () => {
    approverCount = 2;
    assert.equal((await putPolicy({ minVersionCode: 2 })).status, 202);
  });

  const SAFE = {
    'the minimum is lowered': { minVersionCode: 4 },
    'the minimum is cleared': { minVersionCode: null },
    'a build is removed from the blocked list': { blockedVersionCodes: [] },
    'maintenance stays off while its text is edited': { maintenance: { message: 'for later' } },
    'the grace date is pushed later': { graceUntil: '2026-12-01T00:00:00Z' },
    'the recommended build changes': { recommendedVersionCode: 9 },
    'the Android floor goes up (a notice, not a block)': { minOsApi: 33 },
    'the message, snooze and store link change': { message: 'New text', messageHi: 'नया', snoozeDays: 7, storeUrl: 'https://play.google.com/y' },
  };
  for (const [name, change] of Object.entries(SAFE)) {
    test(`NOT risky - ${name}: applied at once (200), version bumped`, async () => {
      const v0 = await baseline();
      const r = await putPolicy(change);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.version, v0 + 1);
      assert.equal(r.body.policy.version, v0 + 1);
      assert.equal(await ApprovalRequest.countDocuments({ status: 'pending' }), 0);
      assert.ok(r.audit?.before && r.audit?.after);
      assert.equal(r.audit.selfApproved, undefined);
    });
  }

  test('NOT risky - turning maintenance OFF and removing the grace-free nudge apply at once (relief is never gated)', async () => {
    approverCount = 1;
    await putPolicy({ maintenance: { enabled: true, message: 'down' }, blockUnversioned: true });
    approverCount = 2;
    const r = await putPolicy({ maintenance: { enabled: false }, blockUnversioned: false });
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.policy.maintenance.enabled, r.body.policy.blockUnversioned], [false, false]);
  });

  test('NOT risky - adding a grace date where there was none', async () => {
    await baseline({ graceUntil: null });
    assert.equal((await putPolicy({ graceUntil: '2026-12-01T00:00:00Z' })).status, 200);
  });

  test('re-sending the same blocked list or switch is no change at all: 200 unchanged, no version bump, nothing queued', async () => {
    const v0 = await baseline();
    for (const same of [{ blockedVersionCodes: [3] }, { blockUnversioned: false }, { blockedVersionCodes: [3, 3] }]) {
      const r = await putPolicy(same);
      assert.deepEqual([r.status, r.body.unchanged, r.body.version], [200, true, v0], JSON.stringify(same));
    }
  });

  test('an unchanged policy answers 200 {unchanged:true} without bumping the version', async () => {
    const v0 = await baseline();
    const r = await putPolicy({ minVersionCode: 5, message: 'm' });
    assert.deepEqual([r.status, r.body.unchanged, r.body.version], [200, true, v0]);
  });

  test('one risky edit among relief edits sends the whole change for approval, as one request', async () => {
    const v0 = await baseline();
    const r = await putPolicy({ minVersionCode: 6, message: 'cosmetic too', recommendedVersionCode: 9 });
    assert.equal(r.status, 202);
    assert.equal((await policyNow()).message, 'm');
    assert.equal((await policyNow()).version, v0);
    assert.equal(await ApprovalRequest.countDocuments({ status: 'pending' }), 1);
  });

  test('SELF-APPROVED: the only operator able to approve is applied at once, marked in the audit row, with a history entry', async () => {
    approverCount = 1;
    const r = await putPolicy({ minVersionCode: 3 });
    assert.equal(r.status, 200);
    assert.equal(r.body.selfApproved, true);
    assert.equal(r.audit.selfApproved, true);
    assert.equal((await policyNow()).minVersionCode, 3);
    const h = await ApprovalRequest.findOne().lean();
    assert.deepEqual([h.status, h.selfApproved, h.decidedBy], ['approved', true, 'alice']);
    assert.equal((await call('GET', '/admin/releases')).body.pending.length, 0);
  });

  test('a lone approver count of 1 does not self-approve for a requester who cannot approve: the change waits for the one who can', async () => {
    approverCount = 1;
    const releaseEditor = asOp(['releases:view', 'releases:edit'], 'op-rita', 'rita');
    assert.equal((await putPolicy({ minVersionCode: 3 }, releaseEditor)).status, 202);
  });

  test('approvals switched off: a risky change applies at once and is not marked self-approved', async () => {
    assert.equal((await call('PUT', '/admin/approvals/settings', { body: { approvalsEnabled: false } })).status, 200);
    const r = await putPolicy({ minVersionCode: 3, maintenance: { enabled: true } });
    assert.equal(r.status, 200);
    assert.equal(r.audit.selfApproved, undefined);
    assert.equal((await policyNow()).minVersionCode, 3);
  });

  test('identity unreachable (approver count unknown): a risky change is refused with 503, a relief change still goes through', async () => {
    approverCount = null;
    const r = await putPolicy({ minVersionCode: 3 });
    assert.deepEqual([r.status, r.body.code], [503, 'approvers_unavailable']);
    assert.equal((await putPolicy({ message: 'fine' })).status, 200);
  });

  test('the allow-list ids never reach the audit trail, only their count', async () => {
    approverCount = 1;
    const r = await putPolicy({ maintenance: { enabled: true, allowUids: ['uid-secret-1', 'uid-secret-2'] } });
    assert.equal(r.audit.after.maintenance.allowUidsCount, 2);
    assert.equal(JSON.stringify(r.audit).includes('uid-secret'), false);
  });

  test('a concurrent change loses cleanly: the version guard answers 409 policy_changed', async () => {
    const [a, b] = await Promise.all([putPolicy({ message: 'one' }), putPolicy({ message: 'two' })]);
    const codes = [a.status, b.status].sort();
    assert.ok(codes[0] === 200 && (codes[1] === 200 || codes[1] === 409), `got ${codes}`);
  });
});

describe('approvals', () => {
  async function pending(change = { minVersionCode: 6 }, by = ALICE()) {
    approverCount = 1;
    await putPolicy({ minVersionCode: 5, recommendedVersionCode: 7 });
    approverCount = 2;
    const r = await putPolicy(change, by);
    assert.equal(r.status, 202);
    return r.body.approval._id;
  }

  test('list: newest first, filter by status, a bad status is a 400; the releases view carries the pending ones', async () => {
    const id = await pending();
    const all = (await call('GET', '/admin/approvals', { headers: asOp(VIEWER) })).body.approvals;
    assert.equal(all.length, 2, 'the pending request and the self-approved history entry of the set-up');
    assert.deepEqual([all[0]._id, all[0].status, all[0].requestedBy], [id, 'pending', 'alice'], 'newest first');
    assert.deepEqual([all[1].status, all[1].selfApproved], ['approved', true]);
    assert.ok(all[0].changes.some((c) => c.includes('minimum build 5 -> 6')));
    assert.equal((await call('GET', '/admin/approvals?status=approved')).body.approvals.length, 1);
    assert.equal((await call('GET', '/admin/approvals?status=pending')).body.approvals.length, 1);
    assert.equal((await call('GET', '/admin/approvals?status=all')).body.approvals.length, 2);
    assert.equal((await call('GET', '/admin/approvals?status=wat')).status, 400);
    assert.equal((await call('GET', '/admin/releases')).body.pending.length, 1);
  });

  test('another operator approves: the policy changes (version +1), the request is closed with who/when/note', async () => {
    const id = await pending();
    const v0 = (await policyNow()).version;
    clock = new Date('2026-10-16T11:00:00Z');
    const r = await call('POST', `/admin/approvals/${id}/approve`, { headers: BOB(), body: { note: 'ok, checked impact' } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([r.body.approval.status, r.body.approval.decidedBy, r.body.approval.note, r.body.approval.decidedAt], ['approved', 'bob', 'ok, checked impact', '2026-10-16T11:00:00.000Z']);
    assert.deepEqual([r.body.policy.minVersionCode, r.body.policy.version, r.body.policy.updatedBy], [6, v0 + 1, 'bob']);
    assert.deepEqual([r.audit.before.minVersionCode, r.audit.after.minVersionCode], [5, 6]);
    assert.equal((await call('POST', `/admin/approvals/${id}/approve`, { headers: BOB(), body: {} })).body.code, 'not_pending', 'only once');
    assert.equal((await call('GET', '/admin/releases')).body.pending.length, 0);
  });

  test('you cannot approve or reject your own request (409 own_request), even with the same permissions', async () => {
    const id = await pending();
    for (const [a, b] of [['approve', {}], ['reject', { note: 'no' }]]) {
      const r = await call('POST', `/admin/approvals/${id}/${a}`, { headers: ALICE(), body: b });
      assert.deepEqual([r.status, r.body.code], [409, 'own_request'], a);
    }
    assert.equal((await ApprovalRequest.findById(id)).status, 'pending');
    assert.equal((await policyNow()).minVersionCode, 5);
  });

  test('reject needs a note and closes the request without touching the policy', async () => {
    const id = await pending();
    assert.equal((await call('POST', `/admin/approvals/${id}/reject`, { headers: BOB(), body: {} })).body.code, 'note_required');
    const r = await call('POST', `/admin/approvals/${id}/reject`, { headers: BOB(), body: { note: 'too early' } });
    assert.deepEqual([r.status, r.body.approval.status, r.body.approval.note], [200, 'rejected', 'too early']);
    assert.equal((await policyNow()).minVersionCode, 5);
    assert.equal((await call('POST', `/admin/approvals/${id}/approve`, { headers: BOB(), body: {} })).status, 409);
  });

  test('only the requester can cancel', async () => {
    const id = await pending();
    const other = await call('POST', `/admin/approvals/${id}/cancel`, { headers: BOB(), body: {} });
    assert.deepEqual([other.status, other.body.code], [403, 'not_requester']);
    const r = await call('POST', `/admin/approvals/${id}/cancel`, { headers: ALICE(), body: {} });
    assert.deepEqual([r.status, r.body.approval.status], [200, 'cancelled']);
    assert.equal((await call('POST', `/admin/approvals/${id}/cancel`, { headers: ALICE(), body: {} })).status, 409);
  });

  test('a request expires after 24 h: the listing shows it expired, approving it is 409 expired, the sweeper marks it', async () => {
    const id = await pending();
    clock = new Date(clock.getTime() + 24 * 3600_000 - 1000);
    assert.equal((await call('GET', '/admin/approvals?status=pending')).body.approvals.length, 1, '1 s before the deadline: still pending');
    clock = new Date(clock.getTime() + 2000);
    const r = await call('POST', `/admin/approvals/${id}/approve`, { headers: BOB(), body: {} });
    assert.deepEqual([r.status, r.body.code], [409, 'expired']);
    assert.equal((await ApprovalRequest.findById(id)).status, 'expired');
    assert.equal((await policyNow()).minVersionCode, 5);
    // the sweeper on its own
    const id2 = await pending({ minVersionCode: 7 });
    assert.equal(await expireApprovals(clock), 0);
    clock = new Date(clock.getTime() + 25 * 3600_000);
    assert.equal(await expireApprovals(clock), 1);
    assert.equal((await ApprovalRequest.findById(id2)).status, 'expired');
    assert.equal(await expireApprovals(clock), 0, 'idempotent');
  });

  test('stale: the policy moved since the request was made, so approving would overwrite newer work (409 stale_policy); the request stays open to reject', async () => {
    const id = await pending();
    await putPolicy({ message: 'someone edited meanwhile' });
    const r = await call('POST', `/admin/approvals/${id}/approve`, { headers: BOB(), body: {} });
    assert.deepEqual([r.status, r.body.code], [409, 'stale_policy']);
    assert.equal((await ApprovalRequest.findById(id)).status, 'pending');
    assert.equal((await call('POST', `/admin/approvals/${id}/reject`, { headers: BOB(), body: { note: 'stale' } })).status, 200);
  });

  test('the payload is re-validated on approval', async () => {
    const id = await pending();
    await ApprovalRequest.updateOne({ _id: id }, { $set: { 'payload.after.snoozeDays': 99 } });
    const r = await call('POST', `/admin/approvals/${id}/approve`, { headers: BOB(), body: {} });
    assert.deepEqual([r.status, r.body.code], [400, 'bad_policy']);
    assert.equal((await ApprovalRequest.findById(id)).status, 'pending');
  });

  test('unknown ids: 404; malformed: 400', async () => {
    for (const a of ['approve', 'reject', 'cancel']) {
      assert.equal((await call('POST', `/admin/approvals/000000000000000000000009/${a}`, { headers: BOB(), body: { note: 'n' } })).status, 404);
      assert.equal((await call('POST', `/admin/approvals/nope/${a}`, { headers: BOB(), body: { note: 'n' } })).status, 400);
    }
  });

  test('settings: default on; admin turns it off and on; others only read; audited with before/after', async () => {
    assert.deepEqual((await call('GET', '/admin/approvals/settings', { headers: asOp(VIEWER) })).body, { approvalsEnabled: true });
    const off = await call('PUT', '/admin/approvals/settings', { body: { approvalsEnabled: false } });
    assert.deepEqual([off.status, off.body, off.audit.before, off.audit.after], [200, { approvalsEnabled: false }, { approvalsEnabled: true }, { approvalsEnabled: false }]);
    assert.equal((await call('GET', '/admin/releases')).body.approvalsEnabled, false);
    assert.equal((await call('PUT', '/admin/approvals/settings', { body: { approvalsEnabled: 'no' } })).status, 400);
    assert.equal((await call('PUT', '/admin/approvals/settings', { headers: asOp(EDITOR), body: { approvalsEnabled: true } })).status, 403);
    assert.equal((await call('PUT', '/admin/approvals/settings', { body: { approvalsEnabled: true } })).body.approvalsEnabled, true);
  });
});

describe('impact and usage: counted from real device rows only', () => {
  const seen = (deviceId, versionCode, osApi, uid, daysAgo) => ({ deviceId, versionCode, osApi, uid, platform: 'android', lastSeen: new Date(clock.getTime() - daysAgo * 864e5) });
  beforeEach(async () => {
    await call('POST', '/admin/releases', { body: { versionName: '1.0.0', versionCode: 1, status: 'live' } });
    await call('POST', '/admin/releases', { body: { versionName: '1.1.0', versionCode: 2, status: 'live' } });
    await Visitor.insertMany([
      seen('d1', 1, 27, 'u1', 1), seen('d2', 1, 30, 'u1', 2), seen('d3', 1, 30, 'u2', 20), seen('d4', 2, 30, 'u3', 0), seen('d5', 2, 25, null, 3),
      seen('d6', 3, 34, 'u4', 1), seen('d-old', 1, 30, 'u9', 45), { deviceId: 'd-legacy', lastSeen: new Date(clock.getTime() - 86400000) },
    ]);
  });

  test('usage by build: devices in 30 days, active in 7, distinct signed-in users, share of active devices; unknown build listed; > 30 days excluded', async () => {
    const u = (await call('GET', '/admin/versions/usage', { headers: asOp(VIEWER) })).body;
    assert.equal(u.total, 7, 'd-old (45 days) is not counted');
    assert.deepEqual(u.byVersion.map((x) => x.versionCode), [3, 2, 1, null]);
    const by = Object.fromEntries(u.byVersion.map((x) => [String(x.versionCode), x]));
    assert.deepEqual([by[1].versionName, by[1].devices, by[1].activeDevices7d, by[1].activeUsers7d], ['1.0.0', 3, 2, 1]);
    assert.deepEqual([by[2].devices, by[2].activeDevices7d, by[2].activeUsers7d, by[3].versionName], [2, 2, 1, null]);
    assert.deepEqual([by.null.devices, by.null.versionName], [1, null]);
    assert.equal(by[1].pctOfActiveDevices7d, 33.3, '2 of the 6 devices active this week');
    assert.equal(u.byVersion.reduce((s, x) => s + x.pctOfActiveDevices7d, 0).toFixed(0), '100');
    assert.deepEqual(u.blockedRequests, []);
  });

  test('blocked requests: 7-day and today totals per build, from the flushed counters', async () => {
    await call('POST', '/policy/blocked-counts', { headers: phone(), body: { counts: [{ versionCode: 1, count: 5 }] } });
    for (const day of ['2026-10-12', '2026-10-09']) await VersionBlockCount.create({ platform: 'android', versionCode: 1, day, count: 10 });
    await VersionBlockCount.create({ platform: 'android', versionCode: 1, day: '2026-10-01', count: 1000 });
    const u = (await call('GET', '/admin/versions/usage')).body;
    assert.deepEqual(u.blockedRequests, [{ versionCode: 1, count7d: 15, countToday: 5 }]);
  });

  test('impact of a hypothetical minimum: blocked / nudged / unsupported-OS devices and the users behind them', async () => {
    const r = await call('POST', '/admin/version-policy/impact', { headers: asOp(VIEWER), body: { minVersionCode: 2 } });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.devices, { total: 7, blocked: 3, nudged: 0, unsupportedOs: 0 });
    assert.deepEqual(r.body.users, { blockedActive7d: 1, blockedActive30d: 2 });
    assert.deepEqual(r.body.activeWindowDays, [7, 30]);
    assert.equal(r.body.byVersion.length, 4);
    const r2 = await call('POST', '/admin/version-policy/impact', { body: { minVersionCode: 3, recommendedVersionCode: 3, blockedVersionCodes: [3], minOsApi: 30 } });
    assert.deepEqual(r2.body.devices, { total: 7, blocked: 6, nudged: 0, unsupportedOs: 0 }, 'a blocked or too-old build is blocked before any OS notice');
    const r3 = await call('POST', '/admin/version-policy/impact', { body: { recommendedVersionCode: 3, minOsApi: 30 } });
    assert.deepEqual(r3.body.devices, { total: 7, blocked: 0, nudged: 3, unsupportedOs: 2 });
  });

  test('unspecified fields use the CURRENT policy; grace and maintenance are ignored (the eventual effect); the policy is untouched', async () => {
    approverCount = 1;
    await putPolicy({ blockedVersionCodes: [3], graceUntil: '2026-12-31T00:00:00Z', maintenance: { enabled: true } });
    approverCount = 2;
    const r = await call('POST', '/admin/version-policy/impact', { body: { minVersionCode: 2 } });
    assert.equal(r.body.devices.blocked, 4, 'builds 1 (3 devices) + 3 (1 device)');
    assert.equal((await policyNow()).minVersionCode, null);
    assert.equal(await ApprovalRequest.countDocuments({ status: 'pending' }), 0);
  });

  test('blockUnversioned counts devices with no build as blocked', async () => {
    approverCount = 1;
    await putPolicy({ blockUnversioned: true });
    const r = await call('POST', '/admin/version-policy/impact', { body: {} });
    assert.equal(r.body.devices.blocked, 1);
  });

  test('a bad hypothetical is a 400 bad_policy; an empty one is "no change"', async () => {
    const r = await call('POST', '/admin/version-policy/impact', { body: { minVersionCode: -1 } });
    assert.deepEqual([r.status, r.body.code], [400, 'bad_policy']);
    assert.deepEqual((await call('POST', '/admin/version-policy/impact', { body: {} })).body.devices, { total: 7, blocked: 0, nudged: 0, unsupportedOs: 0 });
  });

  test('with no devices at all every number is 0, never invented', async () => {
    await Visitor.deleteMany({});
    const r = (await call('POST', '/admin/version-policy/impact', { body: { minVersionCode: 5 } })).body;
    assert.deepEqual([r.devices, r.users, r.byVersion], [{ total: 0, blocked: 0, nudged: 0, unsupportedOs: 0 }, { blockedActive7d: 0, blockedActive30d: 0 }, []]);
  });
});
