// Phase 6 monolith side: the CALLS_URL switch. Unset = astrologers, calls and payouts are served here exactly as before (and identity's internal claim
// endpoints answer); set = every route of theirs answers 404 (the calls service owns them), the internal claim endpoints step aside, the billing ticker is
// not started, the saga sweeper leaves the call refunds to the calls service, and the boot refuses a half-configured stack. Rollback = unset it.
// Run: TEST_MONGODB_URI=mongodb://127.0.0.1:27271/x node --test --test-concurrency=1 src/lib/calls-mode.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { after, afterEach, before, beforeEach, describe, mock, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import mongoose from 'mongoose';

import { createApp } from '../app.js';
import { Operator, Setting } from '../models.js';
import { Astrologer } from '../modules/astrologers/astrologer.model.js';
import { seedModules, startModuleJobs } from '../modules/index.js';
import { hashPassword } from '../modules/operators/index.js';
import { sign } from '../modules/operators/session.js';
import * as callsMod from '../modules/calls/index.js';
import { markReady } from './readiness.js';
import { signServiceToken } from './service-jwt.js';
import * as wallet from './wallet-client.js';
import * as saga from './wallet-saga.js';
import { startWalletStub } from './wallet-stub.mjs';

const SECRET = 'test-secret-test-secret-1234';
const IDENTITY_MODE = Boolean(process.env.IDENTITY_MODE);
const dbUri = (n) => {
  const u = new URL(process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27271/x');
  u.pathname = `/${n}`;
  return u.toString();
};
const OID = '000000000000000000000000';

describe('the monolith app with CALLS_URL set', { skip: IDENTITY_MODE && 'cookie sessions are phase 1; IDENTITY_URL set (phase 2) moves them to the admin BFF' }, () => {
  let server; let base; let cookie;
  before(async () => {
    process.env.INTERNAL_JWT_SECRET = SECRET;
    await mongoose.connect(dbUri('calls_mode_app_tests'));
    await mongoose.connection.dropDatabase();
    await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
    const o = await Operator.create({ username: 'admin1', passwordHash: hashPassword('password-123'), role: 'admin' });
    cookie = `pooja_admin=${encodeURIComponent(sign({ uid: String(o._id), role: 'admin', exp: Date.now() + 3600_000 }))}`;
    await Astrologer.create({ name: 'Pt. Sharma', ratePerMin: 10, signInEmail: 's@example.com', uid: 'a-uid', status: 'active', listed: true, presence: 'online', lastSeenAt: new Date() });
    server = createApp().listen(0, '127.0.0.1');
    await new Promise((ok) => server.once('listening', ok));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => {
    await new Promise((ok) => server.close(ok));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  afterEach(() => { delete process.env.CALLS_URL; delete process.env.IDENTITY_URL; });
  const get = async (path, { method = 'GET', headers = {}, body } = {}) => {
    const res = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, body });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* html 404 */ }
    return { status: res.status, body: json };
  };

  const RETIRED = [
    ['GET', '/api/astrologers'], ['GET', `/api/astrologers/${OID}`],
    ['GET', '/api/astrologer/me'], ['PUT', '/api/astrologer/me/presence'], ['POST', '/api/astrologer/me/heartbeat'], ['GET', '/api/astrologer/me/incoming'],
    ['GET', '/api/astrologer/me/calls'], ['GET', '/api/astrologer/me/earnings'],
    ['POST', '/api/calls'], ['GET', `/api/calls/${OID}`], ['POST', `/api/calls/${OID}/cancel`], ['POST', `/api/calls/${OID}/end`], ['POST', `/api/calls/${OID}/accept`],
    ['POST', `/api/calls/${OID}/decline`], ['POST', `/api/calls/${OID}/rating`],
    ['GET', '/api/admin/astrologers'], ['POST', '/api/admin/astrologers'], ['PUT', `/api/admin/astrologers/${OID}`], ['DELETE', `/api/admin/astrologers/${OID}`],
    ['POST', `/api/admin/astrologers/${OID}/suspend`], ['POST', `/api/admin/astrologers/${OID}/reactivate`],
    ['GET', '/api/admin/calls'], ['POST', `/api/admin/calls/${OID}/end`], ['POST', `/api/admin/calls/${OID}/refund`],
    ['GET', '/api/admin/payouts/summary'], ['GET', '/api/admin/payouts'], ['POST', '/api/admin/payouts'],
  ];

  test('with CALLS_URL set every astrologer / call / payout route answers 404 - public, devotee and operator alike (an operator cookie shows it is not the gate)', async () => {
    process.env.CALLS_URL = 'http://127.0.0.1:9';
    for (const [method, path] of RETIRED) {
      const r = await get(path, { method, headers: { cookie }, body: method === 'GET' || method === 'DELETE' ? undefined : '{}' });
      assert.equal(r.status, 404, `${method} ${path} -> ${r.status}`);
    }
    // a stranger still meets the gate, never an astrologer
    assert.equal((await get('/api/admin/astrologers')).status, 401);
    assert.equal((await get('/api/admin/calls')).status, 401);
  });

  test('with CALLS_URL unset the same routes are served by the monolith again (rollback = unset it)', async () => {
    assert.equal((await get('/api/astrologers')).body.astrologers.length, 1);
    assert.equal((await get('/api/astrologers')).body.astrologers[0].name, 'Pt. Sharma');
    assert.equal((await get('/api/astrologer/me')).status, 401, 'astrologer route wants a token');
    assert.equal((await get('/api/calls', { method: 'POST', body: '{}' })).status, 401);
    assert.equal((await get('/api/admin/astrologers')).status, 401);
    assert.equal((await get('/api/admin/astrologers', { headers: { cookie } })).body.astrologers.length, 1);
    assert.equal((await get('/api/admin/calls', { headers: { cookie } })).status, 200);
    assert.equal((await get('/api/admin/payouts/summary', { headers: { cookie } })).status, 200);
  });

  test('what is NOT calls\' stays: health, the operator session, the settings and the billing-rules screen keep answering with CALLS_URL set', async () => {
    markReady();
    process.env.CALLS_URL = 'http://127.0.0.1:9';
    assert.equal((await get('/api/health')).status, 200);
    assert.equal((await get('/api/admin/session', { headers: { cookie } })).status, 200);
    assert.equal((await get('/api/content/settings', { headers: { cookie } })).status, 200);
  });

  test('identity\'s internal claim endpoints answer only while CALLS_URL is unset (then the calls service answers them, same shapes)', async () => {
    process.env.IDENTITY_URL = 'http://127.0.0.1:9';
    const tok = signServiceToken({ iss: 'identity' }, { secret: SECRET });
    const auth = { authorization: `Bearer ${tok}` };
    const claim = () => get('/internal/astrologers/claim', { method: 'POST', headers: auth, body: JSON.stringify({ decoded: { uid: 'a-uid' } }) });
    const active = () => get('/internal/astrologers/active?uid=a-uid', { headers: auth });
    assert.deepEqual([(await claim()).status, (await claim()).body], [200, { astrologer: { id: String((await Astrologer.findOne({ uid: 'a-uid' }))._id), name: 'Pt. Sharma' } }]);
    assert.equal((await active()).body.astrologer.name, 'Pt. Sharma');
    assert.equal((await get('/internal/astrologers/claim', { method: 'POST', headers: { authorization: `Bearer ${signServiceToken({ iss: 'catalog' }, { secret: SECRET })}` }, body: '{}' })).status, 401);
    process.env.CALLS_URL = 'http://127.0.0.1:9';
    assert.equal((await claim()).status, 404);
    assert.equal((await active()).status, 404);
  });
});

describe('seeds and jobs', () => {
  before(async () => {
    await mongoose.connect(dbUri('calls_mode_jobs_tests'));
    await mongoose.connection.dropDatabase();
    await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  });
  after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  afterEach(() => { delete process.env.CALLS_URL; delete process.env.WALLET_URL; delete process.env.ORDERS_URL; mock.restoreAll(); });

  test('the billing rules are seeded by the monolith only while it owns calls (with CALLS_URL they live in engagement)', async () => {
    await Setting.deleteMany({});
    process.env.CALLS_URL = 'http://127.0.0.1:9';
    await seedModules();
    assert.equal(await Setting.countDocuments({ key: 'minMinutes' }), 0);
    delete process.env.CALLS_URL;
    await callsMod.seed();
    assert.equal(await Setting.countDocuments({ key: { $in: ['minMinutes', 'ringTimeoutSec', 'defaultSharePct', 'payoutPaisePerCoin', 'callsEnabled'] } }), 5);
  });

  const countTimers = (fn) => {
    const made = [];
    mock.method(globalThis, 'setInterval', (f, ms) => { made.push(ms); return { unref() {}, ref() {} }; });
    fn();
    mock.restoreAll();
    return made;
  };

  test('the billing ticker starts only while the monolith owns calls; with CALLS_URL set (and WALLET_URL, no ORDERS_URL) only the order sagas\' sweeper runs; with both moved nothing does', () => {
    process.env.WALLET_URL = 'http://127.0.0.1:9';
    process.env.CALLS_URL = 'http://127.0.0.1:9';
    assert.deepEqual(countTimers(() => callsMod.start()), [5000], 'the sweeper alone');
    process.env.ORDERS_URL = 'http://127.0.0.1:9';
    assert.deepEqual(countTimers(() => callsMod.start()), [], 'bookings / chadhava / calls all moved: the monolith has no money job left');
    // note: the module-level `sweeper` guard means a second start() is a no-op, so the order above matters (it is the realistic one)
  });
});

describe('the saga sweeper with CALLS_URL set leaves call refunds to the calls service', () => {
  let stub;
  before(async () => {
    stub = await startWalletStub({ secret: SECRET });
    process.env.INTERNAL_JWT_SECRET = SECRET;
    await mongoose.connect(dbUri('calls_mode_sweeper_tests'));
    await mongoose.connection.dropDatabase();
    await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  });
  after(async () => {
    await stub.close();
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  beforeEach(async () => {
    process.env.WALLET_URL = stub.url;
    stub.mode = 'up';
    stub.hits.length = 0;
    stub.txns.clear();
    wallet._reset();
    await saga.WalletIntent.deleteMany({});
  });
  afterEach(() => { delete process.env.WALLET_URL; delete process.env.ORDERS_URL; delete process.env.CALLS_URL; });

  const old = new Date(Date.now() - 60_000);
  const seed = async () => {
    stub.fund('s1', 100);
    stub.txns.set('booking:b1:debit', { id: '3'.padStart(24, '0'), uid: 's1', type: 'booking_debit', amount: -7, status: 'posted', idempotencyKey: 'booking:b1:debit', balanceAfter: 83 });
    stub.txns.set('call:c1:min:1', { id: '2'.padStart(24, '0'), uid: 's1', type: 'call_debit', amount: -5, status: 'posted', idempotencyKey: 'call:c1:min:1', balanceAfter: 85 });
    const mk = (key, extra) => ({ key, uid: 's1', amount: 5, status: 'pending', openedAt: old, ...extra });
    await saga.WalletIntent.insertMany([
      mk('booking:b1:refund', { kind: 'refund', refType: 'booking', refId: 'b1', ofKey: 'booking:b1:debit', amount: 7 }),
      mk('call:c1:refund:1', { kind: 'refund', refType: 'call', refId: 'c1', ofKey: 'call:c1:min:1' }),
      mk('call:c1:goodwill:r1', { kind: 'refund', refType: 'call', refId: 'c1', note: 'x' }),
    ]);
  };

  test('unset: every pending intent is swept; CALLS_URL set: only the order intents; both set: none', async () => {
    await seed();
    assert.equal((await saga.sweep({ minAgeMs: 0 })).checked, 3);
    await saga.WalletIntent.deleteMany({});
    stub.txns.clear();
    stub.hits.length = 0;
    await seed();
    process.env.CALLS_URL = 'http://127.0.0.1:9';
    const r = await saga.sweep({ minAgeMs: 0 });
    assert.deepEqual([r.checked, r.done], [1, 1], 'the booking refund only');
    assert.deepEqual((await saga.WalletIntent.find({ status: 'pending' }).lean()).map((x) => x.key).sort(), ['call:c1:goodwill:r1', 'call:c1:refund:1']);
    assert.deepEqual(stub.hits.map((x) => x.body.key), ['booking:b1:refund']);
    process.env.ORDERS_URL = 'http://127.0.0.1:9';
    stub.hits.length = 0;
    assert.equal((await saga.sweep({ minAgeMs: 0 })).checked, 0);
    assert.equal(stub.hits.length, 0, 'the wallet was not asked about anything');
  });
});

describe('booting the monolith with CALLS_URL', () => {
  const boot = (env) => spawnSync(process.execPath, [fileURLToPath(new URL('../server.js', import.meta.url))], {
    env: { PATH: process.env.PATH, MONGODB_URI: dbUri('calls_boot_refusal'), PORT: '0', ...env }, encoding: 'utf8', timeout: 15_000,
  });
  test('CALLS_URL without the services it needs is refused, and so is a missing secret', () => {
    const a = boot({ CALLS_URL: 'http://127.0.0.1:9', INTERNAL_JWT_SECRET: SECRET });
    assert.equal(a.status, 1);
    assert.match(a.stderr, /CALLS_URL is set but WALLET_URL, IDENTITY_URL, ENGAGEMENT_URL are not/);
    const b = boot({ CALLS_URL: 'http://127.0.0.1:9', WALLET_URL: 'http://127.0.0.1:9', IDENTITY_URL: 'http://127.0.0.1:9', INTERNAL_JWT_SECRET: SECRET });
    assert.equal(b.status, 1);
    assert.match(b.stderr, /ENGAGEMENT_URL is not/);
    const c = boot({ CALLS_URL: 'http://127.0.0.1:9', WALLET_URL: 'http://127.0.0.1:9', IDENTITY_URL: 'http://127.0.0.1:9', ENGAGEMENT_URL: 'http://127.0.0.1:9' });
    assert.equal(c.status, 1);
    assert.match(c.stderr, /INTERNAL_JWT_SECRET/);
  });
});
