// Service-level tests for the wallet: health/seed, auth refusals, who may call what, the ledger API, the devotee and operator routes,
// coin packs and purchases (mock + Razorpay), the signed webhook, strict settings, masking, config, the route table.
// Run: TEST_MONGODB_URI=mongodb://127.0.0.1:27231/x node --test --test-concurrency=1 src/wallet.test.mjs
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, test } from 'node:test';

import { WALLET_ADMIN_ROUTES, permissionsFor, signServiceToken } from '@bhakti/common';
import mongoose from 'mongoose';

import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { connectDb } from './db.js';
import { createSettingsReader } from './lib/engagement.js';
import { Wallet, WalletTxn, CoinOrder, CoinPack } from './models.js';
import { signForTest } from './modules/coins/providers.js';
import { seedWallet } from './seed.js';
import { EDITOR, SECRET, VIEWER, boot, fakeDeps, testConfig, token } from './test-kit.mjs';

const sign = (claims, o = {}) => signServiceToken(claims, { secret: SECRET, ...o });
const OID = '000000000000000000000000';

/* ───────────────────────────────────────────────────────────────── health and seed ── */
describe('health and seeding', () => {
  let server; let url; let ready = false;
  before(async () => {
    const config = testConfig('wallet_health_tests');
    await connectDb(config);
    await mongoose.connection.dropDatabase();
    await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
    const deps = fakeDeps();
    server = http.createServer(createApp(config, { isReady: () => ready, dbPing: async () => {}, logger: { info() {}, warn() {}, error() {} }, settings: deps.settings, identity: deps.identity }));
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
    await seedWallet();
    ready = true;
    r = await fetch(`${url}/health`);
    assert.equal(r.status, 200);
    assert.equal((await (await fetch(`${url}/health/deps`)).json()).deps.mongo.ok, true);
  });

  test('seeds the six starter packs, idempotently, and never overwrites an operator\'s edit', async () => {
    assert.equal(await CoinPack.countDocuments(), 6);
    await CoinPack.updateOne({ coins: 30 }, { $set: { price: 21 } });
    await seedWallet();
    await seedWallet();
    assert.equal(await CoinPack.countDocuments(), 6);
    assert.equal((await CoinPack.findOne({ coins: 30 })).price, 21);
    const packs = await CoinPack.find().sort({ order: 1 }).lean();
    assert.deepEqual(packs.map((p) => [p.coins, p.price, p.order, p.showSale]), [[20, 20, 0, false], [30, 21, 1, true], [120, 100, 2, true], [250, 250, 3, false], [650, 500, 4, true], [1400, 1000, 5, true]]);
  });

  test('the service owns exactly wallets, wallettxns, coinpacks, coinorders', async () => {
    await Wallet.create({ uid: 'x1' });
    const names = (await mongoose.connection.db.listCollections().toArray()).map((c) => c.name).sort();
    assert.deepEqual(names.filter((n) => !n.startsWith('system.')), ['coinorders', 'coinpacks', 'wallets', 'wallettxns']);
  });
});

/* ──────────────────────────────────────────────────────────────── auth and callers ── */
describe('auth: nothing without a valid service token, and each route family has its own callers', () => {
  let h;
  before(async () => { h = await boot('wallet_auth_tests'); await seedWallet(); });
  after(() => h.stop());

  const FAMILIES = [
    ['GET', '/wallet'], ['GET', '/wallet/transactions'], ['POST', '/wallet/orders'], ['POST', `/wallet/orders/${OID}/verify`],
    ['GET', '/coins/packs'], ['POST', '/webhooks/razorpay'],
    ['POST', '/debit'], ['POST', '/refund'], ['POST', '/credit'], ['GET', '/txn?key=x'], ['GET', '/balance/u'], ['POST', '/reconcile'],
    ['GET', '/admin/wallets'], ['GET', '/admin/wallet-transactions'], ['POST', '/admin/wallet/adjust'], ['GET', '/admin/coin-packs'], ['GET', '/admin/billing/rules'],
  ];

  test('no token, a malformed one, a wrong-secret one and an expired one are all 401 with a code - on every family', async () => {
    const bad = {
      none: null,
      junk: 'not-a-jwt',
      wrongSecret: signServiceToken({ iss: 'monolith', sub: 'x' }, { secret: 'another-secret-1234567' }),
      expired: sign({ iss: 'monolith', sub: 'x' }, { now: Date.now() - 3_600_000 }),
    };
    for (const [method, path] of FAMILIES) {
      for (const [name, tok] of Object.entries(bad)) {
        const r = await h.call(method, path, { tok, body: method === 'POST' ? {} : undefined });
        assert.equal(r.status, 401, `${name} ${method} ${path}`);
        assert.ok(r.body.code, `${name} ${path} has a code`);
      }
    }
    assert.equal((await h.call('GET', '/coins/packs', { tok: bad.expired })).body.code, 'token_expired');
    assert.equal((await h.call('GET', '/coins/packs', { tok: bad.wrongSecret })).body.code, 'bad_signature');
    assert.equal((await h.call('GET', '/coins/packs', { tok: null })).body.code, 'missing_token');
  });

  test('an issuer that is not on the allow-list is refused even with a valid signature', async () => {
    for (const iss of ['some-other-service', 'catalog', 'identity', 'engagement']) {
      const r = await h.call('GET', '/coins/packs', { tok: sign({ iss }) });
      assert.deepEqual([r.status, r.body.code], [401, 'wrong_issuer'], iss);
    }
  });

  test('who may use what: ledger = monolith/orders/calls only; devotee routes = mobile-bff only; packs + webhook = either BFF; admin = admin-bff only', async () => {
    const as = (iss) => sign({ iss, sub: iss === 'admin-bff' ? 'op1' : 'u1', role: iss === 'admin-bff' ? 'admin' : 'devotee', perms: iss === 'admin-bff' ? permissionsFor('admin') : [] });
    const status = async (iss, method, path) => (await h.call(method, path, { tok: as(iss), body: method === 'POST' ? {} : undefined })).status;
    const wrong = async (iss, method, path) => { const r = await h.call(method, path, { tok: as(iss), body: method === 'POST' ? {} : undefined }); return r.status === 403 && r.body.code === 'wrong_issuer'; };

    for (const path of ['/debit', '/refund', '/credit', '/reconcile']) {
      for (const iss of ['mobile-bff', 'admin-bff']) assert.ok(await wrong(iss, 'POST', path), `${iss} ${path}`);
    }
    for (const [m, p] of [['GET', '/txn?key=x'], ['GET', '/balance/u']]) for (const iss of ['mobile-bff', 'admin-bff']) assert.ok(await wrong(iss, m, p), `${iss} ${p}`);
    for (const iss of ['monolith', 'pooja-api', 'orders', 'calls']) assert.notEqual(await status(iss, 'GET', '/balance/u'), 403, iss);

    for (const [m, p] of [['GET', '/wallet'], ['GET', '/wallet/transactions'], ['POST', '/wallet/orders'], ['POST', `/wallet/orders/${OID}/verify`]]) {
      for (const iss of ['admin-bff', 'monolith', 'pooja-api', 'orders', 'calls']) assert.ok(await wrong(iss, m, p), `${iss} ${m} ${p}`);
      assert.notEqual(await status('mobile-bff', m, p), 403, p);
    }
    for (const [m, p] of [['GET', '/coins/packs']]) {
      for (const iss of ['mobile-bff', 'admin-bff']) assert.equal(await status(iss, m, p), 200);
      for (const iss of ['monolith', 'orders', 'calls']) assert.ok(await wrong(iss, m, p), `${iss} ${p}`);
    }
    for (const iss of ['monolith', 'orders', 'calls']) assert.ok(await wrong(iss, 'POST', '/webhooks/razorpay'), `${iss} webhook`);

    for (const [m, p] of [['GET', '/admin/wallets?q=a'], ['GET', '/admin/wallet-transactions'], ['POST', '/admin/wallet/adjust'], ['GET', '/admin/coin-packs'], ['GET', '/admin/coin-orders'], ['GET', '/admin/coin-stats'], ['GET', '/admin/billing/rules']]) {
      for (const iss of ['mobile-bff', 'monolith', 'pooja-api', 'orders', 'calls']) assert.ok(await wrong(iss, m, p), `${iss} ${m} ${p}`);
      assert.notEqual(await status('admin-bff', m, p), 403, p);
    }
  });

  test('an unknown path is 404 for a permitted caller and a refusal for everyone else (fail closed)', async () => {
    assert.equal((await h.call('GET', '/nothing', { iss: 'monolith', tok: sign({ iss: 'monolith' }) })).status, 403, 'no caller owns an unlisted path');
    assert.equal((await h.call('GET', '/admin/nothing', { perms: permissionsFor('admin') })).status, 404, 'an unlisted /admin path is 404 even for an admin');
  });

  test('a devotee token without a subject, an operator token without a subject, and an operator token with no permissions are refused', async () => {
    assert.equal((await h.call('GET', '/wallet', { tok: sign({ iss: 'mobile-bff', sub: null }) })).status, 401);
    assert.equal((await h.call('GET', '/admin/coin-packs', { tok: sign({ iss: 'admin-bff', sub: null, perms: permissionsFor('admin') }) })).status, 401);
    const none = await h.call('GET', '/admin/coin-packs', { tok: sign({ iss: 'admin-bff', sub: 'op', perms: [] }) });
    assert.deepEqual([none.status, none.body.code, none.body.needs], [403, 'forbidden', 'money:view']);
  });
});

/* ───────────────────────────────────────────────────────────────────── the ledger API ── */
describe('the ledger API (what the order side moves coins through)', () => {
  let h;
  before(async () => { h = await boot('wallet_ledger_api_tests'); await seedWallet(); });
  after(() => h.stop());

  const fund = (uid, amount) => h.ledger('POST', '/credit', { uid, amount, key: `fund:${uid}:${Math.random()}`, type: 'bonus' });

  test('debit: 200 with the txn, the new balance and duplicate:false; the SAME key answers with the FIRST result', async () => {
    await fund('l1', 100);
    const a = await h.ledger('POST', '/debit', { uid: 'l1', amount: 30, key: 'booking:l1:req1', type: 'booking_debit', refType: 'booking', note: 'Navratri' });
    assert.equal(a.status, 200);
    assert.deepEqual([a.body.ok, a.body.balance, a.body.duplicate, a.body.txn.status, a.body.txn.amount, a.body.txn.type, a.body.txn.balanceAfter], [true, 70, false, 'posted', -30, 'booking_debit', 70]);
    const b = await h.ledger('POST', '/debit', { uid: 'l1', amount: 30, key: 'booking:l1:req1', type: 'booking_debit' });
    assert.deepEqual([b.status, b.body.balance, b.body.duplicate, b.body.txn.id], [200, 70, true, a.body.txn.id]);
    assert.equal((await h.ledger('GET', '/balance/l1')).body.balance, 70);
  });

  test('402 insufficient_coins keeps the {error, code, needed, balance, shortfall, type} shape and moves nothing', async () => {
    const r = await h.ledger('POST', '/debit', { uid: 'l1', amount: 500, key: 'booking:l1:big', type: 'booking_debit' });
    assert.equal(r.status, 402);
    assert.deepEqual(r.body, { error: 'Not enough coins.', code: 'insufficient_coins', needed: 500, balance: 70, shortfall: 430, type: 'booking_debit' });
    assert.equal((await h.ledger('GET', '/balance/l1')).body.balance, 70);
    const t = await h.ledger('GET', '/txn?key=booking:l1:big');
    assert.equal(t.body.txn.status, 'failed');
    assert.equal(t.body.txn.failReason, 'insufficient_coins');
  });

  test('a failed debit is REOPENED by the same key after a top-up and charges exactly once (also under a double submit)', async () => {
    await fund('l2', 10);
    const args = { uid: 'l2', amount: 50, key: 'booking:l2:reopen', type: 'booking_debit' };
    assert.equal((await h.ledger('POST', '/debit', args)).status, 402);
    await fund('l2', 100);
    const rs = await Promise.all([h.ledger('POST', '/debit', args), h.ledger('POST', '/debit', args), h.ledger('POST', '/debit', args)]);
    assert.ok(rs.every((r) => r.status === 200 && r.body.balance === 60), JSON.stringify(rs.map((r) => r.body)));
    assert.equal((await h.ledger('GET', '/balance/l2')).body.balance, 60);
    assert.equal(await WalletTxn.countDocuments({ idempotencyKey: args.key }), 1);
  });

  test('refund credits once; the same key again is the first result; the type is refund', async () => {
    await fund('l3', 40);
    await h.ledger('POST', '/debit', { uid: 'l3', amount: 40, key: 'booking:l3:a', type: 'booking_debit' });
    const a = await h.ledger('POST', '/refund', { uid: 'l3', amount: 40, key: 'booking:b1:refund', ofKey: 'booking:l3:a', refType: 'booking', refId: 'b1', note: 'Cancelled' });
    const b = await h.ledger('POST', '/refund', { uid: 'l3', amount: 40, key: 'booking:b1:refund', ofKey: 'booking:l3:a', refType: 'booking', refId: 'b1' });
    assert.deepEqual([a.status, a.body.balance, a.body.txn.type, a.body.duplicate], [200, 40, 'refund', false]);
    assert.deepEqual([b.status, b.body.balance, b.body.duplicate, b.body.txn.id], [200, 40, true, a.body.txn.id]);
    assert.equal((await h.ledger('GET', '/balance/l3')).body.balance, 40);
  });

  test('txn?key: the row, or {txn:null} for a key never seen; another account\'s key is a 409; a missing key is 400', async () => {
    const t = await h.ledger('GET', '/txn?key=booking:l1:req1&uid=l1');
    assert.equal(t.body.txn.status, 'posted');
    assert.equal(t.body.txn.idempotencyKey, 'booking:l1:req1');
    assert.deepEqual((await h.ledger('GET', '/txn?key=never-seen')).body, { txn: null });
    assert.equal((await h.ledger('GET', '/txn?key=booking:l1:req1&uid=somebody-else')).status, 409);
    assert.equal((await h.ledger('GET', '/txn')).status, 400);
  });

  test('the type allow-list: only the three spend types may be debited and only `bonus` credited through this API', async () => {
    for (const type of ['recharge', 'refund', 'adjustment', 'bonus', undefined, 'whatever']) {
      const r = await h.ledger('POST', '/debit', { uid: 'l1', amount: 1, key: `t:${type}`, type });
      assert.deepEqual([r.status, r.body.code], [400, 'bad_type'], String(type));
    }
    for (const type of ['recharge', 'booking_debit', 'refund', undefined]) {
      const r = await h.ledger('POST', '/credit', { uid: 'l1', amount: 1, key: `c:${type}`, type });
      assert.deepEqual([r.status, r.body.code], [400, 'bad_type'], String(type));
    }
    assert.equal((await h.ledger('GET', '/balance/l1')).body.balance, 70);
  });

  test('validation: amount must be a positive whole number, a key and a uid are required, a key is not shareable between accounts', async () => {
    const bad = async (b, code, status = 400) => { const r = await h.ledger('POST', '/debit', { type: 'call_debit', ...b }); assert.deepEqual([r.status, r.body.code], [status, code], JSON.stringify(b)); };
    await bad({ uid: 'l1', amount: 0, key: 'v1' }, 'bad_amount');
    await bad({ uid: 'l1', amount: -3, key: 'v2' }, 'bad_amount');
    await bad({ uid: 'l1', amount: 1.5, key: 'v3' }, 'bad_amount');
    await bad({ uid: 'l1', amount: '5; drop', key: 'v4' }, 'bad_amount');
    await bad({ uid: 'l1', amount: 5 }, 'no_key');
    await bad({ amount: 5, key: 'v5' }, 'no_user');
    await bad({ uid: 'someone-else', amount: 1, key: 'booking:l1:req1', type: 'booking_debit' }, 'key_reused', 409);
  });

  test('reconcile finishes a stranded pending row once, and is a no-op the second time', async () => {
    await fund('l4', 40);
    await WalletTxn.create({ uid: 'l4', type: 'call_debit', amount: -15, status: 'pending', idempotencyKey: 'stranded', createdAt: new Date(Date.now() - 120_000) });
    const a = await h.ledger('POST', '/reconcile', { olderThanMs: 1000 });
    const b = await h.ledger('POST', '/reconcile', { olderThanMs: 1000 });
    assert.ok(a.body.finished >= 1);
    assert.equal(b.body.finished, 0);
    assert.equal((await h.ledger('GET', '/balance/l4')).body.balance, 25);
    assert.equal((await h.ledger('GET', '/txn?key=stranded')).body.txn.status, 'posted');
  });

  test('20 parallel debits against a balance that affords 7: exactly 7 succeed (200), 13 are 402, and the ledger equals the balance', async () => {
    await fund('l5', 70);
    const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => h.ledger('POST', '/debit', { uid: 'l5', amount: 10, key: `booking:l5:${i}`, type: 'booking_debit' })));
    assert.equal(rs.filter((r) => r.status === 200).length, 7);
    assert.equal(rs.filter((r) => r.status === 402).length, 13);
    assert.equal((await h.ledger('GET', '/balance/l5')).body.balance, 0);
    const sum = await WalletTxn.aggregate([{ $match: { uid: 'l5', status: 'posted' } }, { $group: { _id: null, t: { $sum: '$amount' } } }]);
    assert.equal(sum[0].t, 0, 'posted ledger rows sum to the balance');
    assert.equal(await WalletTxn.countDocuments({ uid: 'l5', status: 'posted', type: 'booking_debit' }), 7);
  });
});

/* ──────────────────────────────────────────────────────────── refund hardening (phase 5) ── */
describe('a refund must name the spend it reverses (ofKey)', () => {
  let h;
  before(async () => { h = await boot('wallet_refund_hardening_tests'); await seedWallet(); });
  after(() => h.stop());

  const fund = (uid, amount) => h.ledger('POST', '/credit', { uid, amount, key: `fund:${uid}:${Math.random()}`, type: 'bonus' });
  const spend = async (uid, amount, key, type = 'booking_debit') => { await fund(uid, amount); return h.ledger('POST', '/debit', { uid, amount, key, type }); };
  const refund = (body, iss = 'monolith') => h.ledger('POST', '/refund', body, iss);
  const code = (r) => [r.status, r.body.code];
  const balance = async (uid) => (await h.ledger('GET', `/balance/${uid}`)).body.balance;

  test('a legitimate refund of a posted debit works, at most once, and the retry with the same key is the first result', async () => {
    await spend('h1', 50, 'booking:h1:r1');
    const a = await refund({ uid: 'h1', amount: 50, key: 'booking:x:refund', ofKey: 'booking:h1:r1', refType: 'booking' }, 'orders');
    assert.deepEqual([a.status, a.body.balance, a.body.txn.type, a.body.duplicate], [200, 50, 'refund', false]);
    const again = await refund({ uid: 'h1', amount: 50, key: 'booking:x:refund', ofKey: 'booking:h1:r1', refType: 'booking' }, 'orders');
    assert.deepEqual([again.status, again.body.balance, again.body.duplicate], [200, 50, true]);
    assert.equal(await balance('h1'), 50);
  });

  test('a refund with no matching debit is rejected (409 refund_no_debit) and moves nothing', async () => {
    const r = await refund({ uid: 'h2', amount: 10, key: 'forged-1', ofKey: 'booking:h2:never-happened', refType: 'booking' }, 'orders');
    assert.deepEqual(code(r), [409, 'refund_no_debit']);
    assert.equal(await balance('h2'), 0);
    assert.deepEqual((await h.ledger('GET', '/txn?key=forged-1')).body, { txn: null }, 'no ledger row was even opened');
  });

  test('a second refund of the same charge under ANOTHER key is rejected (409 already_refunded), including in parallel', async () => {
    await spend('h3', 40, 'booking:h3:r');
    const first = await refund({ uid: 'h3', amount: 40, key: 'refund-h3-a', ofKey: 'booking:h3:r' }, 'orders');
    assert.equal(first.status, 200);
    const second = await refund({ uid: 'h3', amount: 40, key: 'refund-h3-b', ofKey: 'booking:h3:r' }, 'orders');
    assert.deepEqual(code(second), [409, 'already_refunded']);
    assert.equal(await balance('h3'), 40);

    await spend('h3p', 40, 'booking:h3p:r');
    const rs = await Promise.all(Array.from({ length: 8 }, (_, i) => refund({ uid: 'h3p', amount: 40, key: `refund-h3p-${i}`, ofKey: 'booking:h3p:r' }, 'orders')));
    assert.equal(rs.filter((r) => r.status === 200).length, 1, JSON.stringify(rs.map((r) => r.body)));
    assert.ok(rs.filter((r) => r.status !== 200).every((r) => r.status === 409 && r.body.code === 'already_refunded'));
    assert.equal(await balance('h3p'), 40, 'refunded exactly once');
    assert.equal(await WalletTxn.countDocuments({ ofKey: 'booking:h3p:r' }), 1);
  });

  test('a refund larger than the charge is rejected (400 refund_exceeds_debit); the exact amount, and less, are fine', async () => {
    await spend('h4', 30, 'booking:h4:r');
    const over = await refund({ uid: 'h4', amount: 31, key: 'refund-h4-over', ofKey: 'booking:h4:r' }, 'orders');
    assert.deepEqual(code(over), [400, 'refund_exceeds_debit']);
    assert.deepEqual([over.body.charged, over.body.requested], [30, 31]);
    assert.equal(await balance('h4'), 0);
    assert.equal((await refund({ uid: 'h4', amount: 30, key: 'refund-h4-ok', ofKey: 'booking:h4:r' }, 'orders')).status, 200);
    await spend('h4b', 30, 'booking:h4b:r');
    assert.equal((await refund({ uid: 'h4b', amount: 10, key: 'refund-h4b', ofKey: 'booking:h4b:r' }, 'orders')).status, 200, 'a partial refund is within the charge');
    assert.equal(await balance('h4b'), 10);
  });

  test('a refund for another account\'s charge is rejected (409 refund_wrong_account)', async () => {
    await spend('h5', 20, 'booking:h5:r');
    const r = await refund({ uid: 'thief', amount: 20, key: 'refund-h5-thief', ofKey: 'booking:h5:r' }, 'orders');
    assert.deepEqual(code(r), [409, 'refund_wrong_account']);
    assert.equal(await balance('thief'), 0);
    assert.equal(await balance('h5'), 0);
  });

  test('only a POSTED SPEND can be refunded: a failed debit, a credit, a refund and a bonus are all refused', async () => {
    await fund('h6', 5);
    const failed = await h.ledger('POST', '/debit', { uid: 'h6', amount: 50, key: 'booking:h6:failed', type: 'booking_debit' });
    assert.equal(failed.status, 402);
    assert.deepEqual(code(await refund({ uid: 'h6', amount: 50, key: 'r-h6-1', ofKey: 'booking:h6:failed' }, 'orders')), [409, 'refund_debit_not_posted']);
    await WalletTxn.create({ uid: 'h6', type: 'call_debit', amount: -3, status: 'pending', idempotencyKey: 'call:h6:pending' });
    assert.deepEqual(code(await refund({ uid: 'h6', amount: 3, key: 'r-h6-2', ofKey: 'call:h6:pending' }, 'orders')), [409, 'refund_debit_not_posted']);
    const bonusKey = (await WalletTxn.findOne({ uid: 'h6', type: 'bonus' })).idempotencyKey;
    assert.deepEqual(code(await refund({ uid: 'h6', amount: 5, key: 'r-h6-3', ofKey: bonusKey }, 'orders')), [409, 'refund_not_a_debit']);
    assert.equal(await balance('h6'), 5);
  });

  test('without ofKey: refused from orders and calls and with no reason; only the monolith\'s goodwill path (reason + refType call) is accepted', async () => {
    await spend('h7', 20, 'call:h7:min:1', 'call_debit');
    for (const iss of ['orders', 'calls', 'monolith']) {
      const r = await refund({ uid: 'h7', amount: 5, key: `g-${iss}`, refType: 'call' }, iss);
      assert.deepEqual(code(r), [400, 'ofkey_required'], `${iss} without a reason`);
    }
    for (const iss of ['orders', 'calls']) {
      const r = await refund({ uid: 'h7', amount: 5, key: `g2-${iss}`, refType: 'call', reason: 'call dropped' }, iss);
      assert.deepEqual(code(r), [400, 'ofkey_required'], `${iss} with a reason`);
    }
    assert.deepEqual(code(await refund({ uid: 'h7', amount: 5, key: 'g3', refType: 'booking', reason: 'x' }, 'monolith')), [400, 'ofkey_required'], 'goodwill is for calls only');
    assert.deepEqual(code(await refund({ uid: 'h7', amount: 5, key: 'g4', refType: 'call', reason: '   ' }, 'monolith')), [400, 'ofkey_required'], 'a blank reason is no reason');
    assert.deepEqual(code(await refund({ uid: 'h7', amount: 5, key: 'g5', ofKey: 7, refType: 'call', reason: 'ok' }, 'monolith')), [400, 'ofkey_required']);
    assert.equal(await balance('h7'), 0);
    const ok = await refund({ uid: 'h7', amount: 5, key: 'call:h7:goodwill:1', refType: 'call', reason: 'call dropped', note: 'call dropped', createdBy: 'ops' }, 'monolith');
    assert.deepEqual([ok.status, ok.body.balance, ok.body.txn.type], [200, 5, 'refund']);
    assert.deepEqual((await refund({ uid: 'h7', amount: 5, key: 'call:h7:goodwill:1', refType: 'call', reason: 'call dropped' }, 'pooja-api')).body.duplicate, true);
  });

  test('phase 6: the calls service may re-send a goodwill refund the monolith queued (key call:<id>:goodwill:<rid>, a reason) - and nothing else without ofKey', async () => {
    await spend('h7b', 20, 'call:h7b:min:1', 'call_debit');
    const send = (key, extra = {}, iss = 'calls') => refund({ uid: 'h7b', amount: 5, key, refType: 'call', reason: 'call dropped', ...extra }, iss);
    for (const key of ['call:h7b:gw:r1:1', 'call:h7b:refund:1', 'g-other', 'call:h7b:goodwill', 'xcall:h7b:goodwill:r1', 'booking:h7b:goodwill:r1']) {
      assert.deepEqual(code(await send(key)), [400, 'ofkey_required'], key);
    }
    assert.deepEqual(code(await send('call:h7b:goodwill:r1', { refType: 'booking' })), [400, 'ofkey_required'], 'refType call only');
    assert.deepEqual(code(await send('call:h7b:goodwill:r1', { reason: ' ' })), [400, 'ofkey_required'], 'a reason is mandatory');
    assert.deepEqual(code(await send('call:h7b:goodwill:r1', {}, 'orders')), [400, 'ofkey_required'], 'orders never');
    assert.equal(await balance('h7b'), 0);
    const ok = await send('call:h7b:goodwill:r1', { note: 'call dropped', createdBy: 'ops' });
    assert.deepEqual([ok.status, ok.body.balance, ok.body.txn.type], [200, 5, 'refund']);
    assert.equal((await send('call:h7b:goodwill:r1')).body.duplicate, true, 'a re-send is the idempotent first result');
    // a proper per-minute refund from calls still works, with ofKey
    const per = await refund({ uid: 'h7b', amount: 10, key: 'call:h7b:gw:r2:1', ofKey: 'call:h7b:min:1', refType: 'call' }, 'calls');
    assert.deepEqual([per.status, per.body.balance], [200, 15]);
  });

  test('per-minute call refunds: each minute\'s debit is refundable once (ofKey = the minute\'s key)', async () => {
    await fund('h8', 10);
    for (const n of [1, 2]) await h.ledger('POST', '/debit', { uid: 'h8', amount: 4, key: `call:c1:min:${n}`, type: 'call_debit' });
    for (const n of [1, 2]) assert.equal((await refund({ uid: 'h8', amount: 4, key: `call:c1:refund:${n}`, ofKey: `call:c1:min:${n}`, refType: 'call' })).status, 200);
    assert.equal(await balance('h8'), 10);
    assert.deepEqual(code(await refund({ uid: 'h8', amount: 4, key: 'call:c1:refund:again', ofKey: 'call:c1:min:1', refType: 'call' })), [409, 'already_refunded']);
  });

  test('the ledger still balances after all of that', async () => {
    for (const uid of ['h1', 'h3', 'h3p', 'h4', 'h4b', 'h7', 'h8']) {
      const sum = await WalletTxn.aggregate([{ $match: { uid, status: 'posted' } }, { $group: { _id: null, t: { $sum: '$amount' } } }]);
      assert.equal(sum[0]?.t ?? 0, await balance(uid), uid);
    }
  });
});

/* ───────────────────────────────────────────────────── devotee routes and purchases ── */
describe('devotee routes, coin packs and purchases', () => {
  let h;
  before(async () => { h = await boot('wallet_coins_tests'); await seedWallet(); });
  after(() => h.stop());

  test('GET /wallet and /wallet/transactions: the exact shapes, scoped to the token\'s uid', async () => {
    await h.ledger('POST', '/credit', { uid: 'd1', amount: 50, key: 'd1-fund', type: 'bonus', note: 'welcome' });
    await h.ledger('POST', '/debit', { uid: 'd1', amount: 20, key: 'd1-spend', type: 'chadhava_debit', refType: 'chadhava', note: 'Chadhava' });
    assert.deepEqual((await h.call('GET', '/wallet', { uid: 'd1' })).body, { balance: 30 });
    assert.deepEqual((await h.call('GET', '/wallet', { uid: 'nobody' })).body, { balance: 0 });
    const tx = (await h.call('GET', '/wallet/transactions', { uid: 'd1' })).body.transactions;
    assert.equal(tx.length, 2);
    assert.deepEqual(Object.keys(tx[0]), ['id', 'type', 'amount', 'balanceAfter', 'refType', 'note', 'at']);
    assert.deepEqual([tx[0].type, tx[0].amount, tx[0].balanceAfter, tx[0].refType], ['chadhava_debit', -20, 30, 'chadhava']);
    assert.equal((await h.call('GET', '/wallet/transactions', { uid: 'nobody' })).body.transactions.length, 0);
  });

  test('GET /coins/packs: the pack shape with its derived fields, in order', async () => {
    const { body } = await h.call('GET', '/coins/packs', { iss: 'mobile-bff', tok: sign({ iss: 'mobile-bff' }) });
    assert.deepEqual(Object.keys(body), ['coinsPerRupee', 'packs']);
    assert.equal(body.packs.length, 6);
    assert.equal(body.coinsPerRupee, 1);
    assert.deepEqual(Object.keys(body.packs[0]), ['id', 'coins', 'price', 'baseCoins', 'extraCoins', 'salePct', 'discountPct', 'costPerCoin', 'onSale', 'showSale', 'saleEndsAt', 'order', 'active']);
    const p30 = body.packs.find((p) => p.coins === 30);
    assert.deepEqual([p30.price, p30.extraCoins, p30.salePct, p30.onSale], [20, 10, 50, true]);
    assert.equal(body.packs.find((p) => p.coins === 20).onSale, false);
  });

  test('mock purchase: create, verify twice then a third time - credited exactly once, from the order\'s snapshot, and only its owner may verify', async () => {
    const uid = 'buyer1';
    const pack = (await h.call('GET', '/coins/packs', { iss: 'mobile-bff', tok: sign({ iss: 'mobile-bff' }) })).body.packs.find((p) => p.coins === 30);
    const o = await h.call('POST', '/wallet/orders', { uid, body: { packId: pack.id } });
    assert.equal(o.status, 200);
    assert.deepEqual(Object.keys(o.body), ['orderId', 'provider', 'amountPaise', 'currency', 'coins', 'price']);
    assert.deepEqual([o.body.provider, o.body.amountPaise, o.body.currency, o.body.coins, o.body.price], ['mock', 2000, 'INR', 30, 20]);
    // An operator edits the pack mid-payment: the order keeps its snapshot.
    await h.call('PUT', `/admin/coin-packs/${pack.id}`, { body: { coins: 99, price: 20 } });
    const v1 = await h.call('POST', `/wallet/orders/${o.body.orderId}/verify`, { uid, body: { mock: true } });
    const [v2, v3] = await Promise.all([h.call('POST', `/wallet/orders/${o.body.orderId}/verify`, { uid, body: { mock: true } }), h.call('POST', `/wallet/orders/${o.body.orderId}/verify`, { uid, body: { mock: true } })]);
    assert.deepEqual(v1.body, { ok: true, balance: 30, coinsAdded: 30 });
    assert.equal(v2.body.balance, 30);
    assert.equal(v3.body.balance, 30);
    assert.equal((await h.call('GET', '/wallet', { uid })).body.balance, 30);
    const order = await CoinOrder.findById(o.body.orderId);
    assert.equal(order.status, 'paid');
    assert.ok(order.paidAt);
    assert.equal(await WalletTxn.countDocuments({ uid, type: 'recharge' }), 1);
    assert.equal(await WalletTxn.countDocuments({ idempotencyKey: `order:${o.body.orderId}` }), 1, 'the order id is the idempotency key');
    assert.equal((await h.call('POST', `/wallet/orders/${o.body.orderId}/verify`, { uid: 'other', body: { mock: true } })).status, 404);
    const o2 = await h.call('POST', '/wallet/orders', { uid, body: { packId: pack.id } });
    assert.equal((await h.call('POST', `/wallet/orders/${o2.body.orderId}/verify`, { uid, body: {} })).status, 400, 'mock needs the flag');
    assert.equal((await h.call('GET', '/wallet', { uid })).body.balance, 30);
  });

  test('unknown or inactive pack is 404; a malformed order id is 404; the error shape is {error, code}', async () => {
    const r = await h.call('POST', '/wallet/orders', { uid: 'u', body: { packId: 'nope' } });
    assert.deepEqual([r.status, r.body.code], [404, 'pack_not_found']);
    assert.ok(r.body.error);
    assert.equal((await h.call('POST', '/wallet/orders/not-an-id/verify', { uid: 'u', body: { mock: true } })).status, 404);
    assert.equal((await h.call('POST', `/wallet/orders/${OID}/verify`, { uid: 'u', body: { mock: true } })).body.code, 'order_not_found');
  });

  test('mock is refused in production, even when asked for by name; a missing provider in production is also refused', async () => {
    const pack = (await h.call('GET', '/coins/packs', { iss: 'mobile-bff', tok: sign({ iss: 'mobile-bff' }) })).body.packs[0];
    const save = h.config.payments;
    try {
      h.setPayments({ nodeEnv: 'production', provider: '' });
      let r = await h.call('POST', '/wallet/orders', { uid: 'x', body: { packId: pack.id } });
      assert.deepEqual([r.status, r.body.code], [503, 'payments_unavailable']);
      h.setPayments({ nodeEnv: 'production', provider: 'mock' });
      r = await h.call('POST', '/wallet/orders', { uid: 'x', body: { packId: pack.id } });
      assert.deepEqual([r.status, r.body.code], [503, 'payments_unavailable']);
      // an existing mock order cannot be verified in production either
      h.setPayments({ nodeEnv: 'test', provider: 'mock' });
      const o = await h.call('POST', '/wallet/orders', { uid: 'x', body: { packId: pack.id } });
      h.setPayments({ nodeEnv: 'production', provider: 'mock' });
      const v = await h.call('POST', `/wallet/orders/${o.body.orderId}/verify`, { uid: 'x', body: { mock: true } });
      assert.deepEqual([v.status, v.body.code], [503, 'payments_unavailable']);
      assert.equal((await h.call('GET', '/wallet', { uid: 'x' })).body.balance, 0);
      // razorpay named but no keys: unavailable
      h.setPayments({ nodeEnv: 'test', provider: 'razorpay', keyId: '', keySecret: '' });
      assert.equal((await h.call('POST', '/wallet/orders', { uid: 'x', body: { packId: pack.id } })).status, 503);
    } finally { h.setPayments(save); }
  });

  test('razorpay: order creation (keys trimmed), bad checkout signature rejected, good one credits once', async () => {
    const calls = [];
    h.setFetch(async (u, init) => {
      calls.push({ u: String(u), init });
      const b = JSON.parse(init.body);
      return new Response(JSON.stringify({ id: `order_RZ${calls.length}`, amount: b.amount }), { status: 200 });
    });
    const padded = loadConfig({ INTERNAL_JWT_SECRET: SECRET, ENGAGEMENT_URL: 'http://e', IDENTITY_URL: 'http://i', RAZORPAY_KEY_ID: '  rzp_test_x\n', RAZORPAY_KEY_SECRET: ' sekret ', RAZORPAY_WEBHOOK_SECRET: ' whsec ' }).payments;
    const save = h.config.payments;
    h.setPayments(padded);
    try {
      const uid = 'buyer2';
      const pack = (await h.call('GET', '/coins/packs', { iss: 'mobile-bff', tok: sign({ iss: 'mobile-bff' }) })).body.packs.find((p) => p.coins === 120);
      const o = await h.call('POST', '/wallet/orders', { uid, body: { packId: pack.id } });
      assert.deepEqual(Object.keys(o.body), ['orderId', 'provider', 'razorpayOrderId', 'keyId', 'amountPaise', 'currency', 'coins', 'price']);
      assert.deepEqual([o.body.provider, o.body.razorpayOrderId, o.body.keyId, o.body.amountPaise], ['razorpay', 'order_RZ1', 'rzp_test_x', 10000]);
      assert.equal(calls[0].u, 'https://api.razorpay.com/v1/orders');
      assert.equal(calls[0].init.headers.Authorization, `Basic ${Buffer.from('rzp_test_x:sekret').toString('base64')}`);
      assert.deepEqual(JSON.parse(calls[0].init.body), { amount: 10000, currency: 'INR', receipt: o.body.orderId, notes: { orderId: o.body.orderId, uid } });

      const bad = await h.call('POST', `/wallet/orders/${o.body.orderId}/verify`, { uid, body: { razorpayPaymentId: 'pay_1', razorpaySignature: 'deadbeef' } });
      assert.deepEqual([bad.status, bad.body.code], [400, 'bad_signature']);
      assert.equal((await h.call('POST', `/wallet/orders/${o.body.orderId}/verify`, { uid, body: { mock: true } })).status, 400, 'the mock flag does not bypass razorpay');
      assert.equal((await h.call('GET', '/wallet', { uid })).body.balance, 0);

      const sig = signForTest.checkout('sekret', 'order_RZ1', 'pay_1');
      const good = await h.call('POST', `/wallet/orders/${o.body.orderId}/verify`, { uid, body: { razorpayPaymentId: 'pay_1', razorpaySignature: sig } });
      assert.deepEqual(good.body, { ok: true, balance: 120, coinsAdded: 120 });
      const again = await h.call('POST', `/wallet/orders/${o.body.orderId}/verify`, { uid, body: { razorpayPaymentId: 'pay_1', razorpaySignature: sig } });
      assert.equal(again.body.balance, 120);
      // a signature for ANOTHER order/payment pair does not verify this one
      const o2 = await h.call('POST', '/wallet/orders', { uid, body: { packId: pack.id } });
      assert.equal((await h.call('POST', `/wallet/orders/${o2.body.orderId}/verify`, { uid, body: { razorpayPaymentId: 'pay_1', razorpaySignature: sig } })).status, 400);
      assert.equal((await h.call('GET', '/wallet', { uid })).body.balance, 120);
      assert.equal((await CoinOrder.findById(o.body.orderId)).razorpayPaymentId, 'pay_1');
    } finally { h.setPayments(save); h.setFetch(null); }
  });

  test('razorpay refusing the order is 502 payments_failed and the pending order is marked failed (nothing credited)', async () => {
    h.setFetch(async () => new Response(JSON.stringify({ error: { description: 'Authentication failed' } }), { status: 401 }));
    const save = h.config.payments;
    h.setPayments({ provider: 'razorpay', keyId: 'rzp_test_x', keySecret: 's' });
    try {
      const pack = (await h.call('GET', '/coins/packs', { iss: 'mobile-bff', tok: sign({ iss: 'mobile-bff' }) })).body.packs[0];
      const r = await h.call('POST', '/wallet/orders', { uid: 'z', body: { packId: pack.id } });
      assert.deepEqual([r.status, r.body.code], [502, 'payments_failed']);
      assert.equal((await CoinOrder.find({ uid: 'z' }))[0].status, 'failed');
    } finally { h.setPayments(save); h.setFetch(null); }
  });
});

/* ────────────────────────────────────────────────────────────────── the webhook ── */
describe('the Razorpay webhook: raw bytes, signature, replay', () => {
  let h; let n = 0;
  const WH = 'whsec-test-value';
  before(async () => {
    const fetchImpl = async (_u, init) => new Response(JSON.stringify({ id: `order_WH${++n}`, amount: JSON.parse(init.body).amount }), { status: 200 });
    h = await boot('wallet_webhook_tests', { fetchImpl, extra: { PAYMENTS_PROVIDER: 'razorpay', RAZORPAY_KEY_ID: 'rzp_test_x', RAZORPAY_KEY_SECRET: 'sekret', RAZORPAY_WEBHOOK_SECRET: WH } });
    await seedWallet();
  });
  after(() => h.stop());

  const buy = async (uid, coins = 120) => {
    const pack = (await h.call('GET', '/coins/packs', { iss: 'mobile-bff', tok: sign({ iss: 'mobile-bff' }) })).body.packs.find((p) => p.coins === coins);
    return (await h.call('POST', '/wallet/orders', { uid, body: { packId: pack.id } })).body;
  };
  const evt = (o, event = 'payment.captured', amount = o.amountPaise, id = 'pay_x') => JSON.stringify({ event, payload: { payment: { entity: { id, order_id: o.razorpayOrderId, amount } } } });
  const post = (raw, signature, extraHeaders = {}) => h.call('POST', '/webhooks/razorpay', { iss: 'mobile-bff', tok: sign({ iss: 'mobile-bff' }), raw, headers: { ...(signature ? { 'x-razorpay-signature': signature } : {}), ...extraHeaders } });

  test('a signed event credits once; the same event replayed (and in parallel) credits nothing more', async () => {
    const o = await buy('w1');
    const raw = evt(o);
    const sig = signForTest.webhook(WH, raw);
    const first = await post(raw, sig);
    assert.deepEqual([first.status, first.body], [200, { ok: true, credited: true }]);
    const replays = await Promise.all([post(raw, sig), post(raw, sig), post(raw, sig)]);
    for (const r of replays) assert.deepEqual([r.status, r.body], [200, { ok: true, credited: false }]);
    assert.equal((await h.call('GET', '/wallet', { uid: 'w1' })).body.balance, 120);
    assert.equal(await WalletTxn.countDocuments({ uid: 'w1', type: 'recharge' }), 1);
    assert.equal((await CoinOrder.findById(o.orderId)).status, 'paid');
  });

  test('verify and the webhook both firing credit once, in either order and in parallel', async () => {
    const o = await buy('w2');
    const raw = evt(o, 'order.paid');
    const sig = signForTest.webhook(WH, raw);
    const checkout = signForTest.checkout('sekret', o.razorpayOrderId, 'pay_x');
    const rs = await Promise.all([
      post(raw, sig),
      h.call('POST', `/wallet/orders/${o.orderId}/verify`, { uid: 'w2', body: { razorpayPaymentId: 'pay_x', razorpaySignature: checkout } }),
      post(raw, sig),
    ]);
    assert.ok(rs.every((r) => r.status === 200));
    assert.equal((await h.call('GET', '/wallet', { uid: 'w2' })).body.balance, 120);
    assert.equal(await WalletTxn.countDocuments({ uid: 'w2', type: 'recharge' }), 1);
    const o3 = await buy('w2');
    await h.call('POST', `/wallet/orders/${o3.orderId}/verify`, { uid: 'w2', body: { razorpayPaymentId: 'pay_y', razorpaySignature: signForTest.checkout('sekret', o3.razorpayOrderId, 'pay_y') } });
    const raw3 = evt(o3, 'payment.captured', o3.amountPaise, 'pay_y');
    assert.equal((await post(raw3, signForTest.webhook(WH, raw3))).body.credited, false, 'the webhook after verify credits nothing');
    assert.equal((await h.call('GET', '/wallet', { uid: 'w2' })).body.balance, 240);
  });

  test('a bad or missing signature is 400 bad_signature and credits nothing; a body altered by one byte invalidates the signature', async () => {
    const o = await buy('w3');
    const raw = evt(o);
    const sig = signForTest.webhook(WH, raw);
    for (const s of ['nope', sig.toUpperCase(), sig.slice(0, -1), '', undefined]) {
      const r = await post(raw, s);
      assert.deepEqual([r.status, r.body.code], [400, 'bad_signature'], String(s));
    }
    const tampered = raw.replace('"amount":', '"amount": ');
    assert.equal((await post(tampered, sig)).status, 400, 'signature is over the exact bytes');
    assert.equal((await post(evt(o, 'payment.captured', o.amountPaise, 'pay_other'), sig)).status, 400);
    assert.equal((await h.call('GET', '/wallet', { uid: 'w3' })).body.balance, 0);
  });

  test('the signature is checked over the RAW BYTES: pretty-printed JSON with its own signature is accepted; its re-serialisation is not', async () => {
    const o = await buy('w4');
    const pretty = `{\n  "event": "payment.captured",\n  "payload": { "payment": { "entity": { "id": "pay_p", "order_id": "${o.razorpayOrderId}", "amount": ${o.amountPaise} } } }\n}\n`;
    const sig = signForTest.webhook(WH, pretty);
    assert.equal((await post(JSON.stringify(JSON.parse(pretty)), sig)).status, 400, 'compact re-serialisation does not match the signed bytes');
    const ok = await post(pretty, sig, { 'content-type': 'application/json; charset=utf-8' });
    assert.deepEqual([ok.status, ok.body.credited], [200, true]);
    // utf-8 payloads too
    const uni = JSON.stringify({ event: 'payment.failed', note: 'भक्ति', payload: {} });
    assert.deepEqual((await post(uni, signForTest.webhook(WH, uni))).body, { ok: true, ignored: true });
  });

  test('other events are acknowledged and ignored; an unknown order is acknowledged; a paid amount that differs from the snapshot is NOT credited', async () => {
    const o = await buy('w5');
    const failed = evt(o, 'payment.failed');
    assert.deepEqual((await post(failed, signForTest.webhook(WH, failed))).body, { ok: true, ignored: true });
    const unknown = evt({ razorpayOrderId: 'order_nope', amountPaise: 1 }, 'payment.captured', 1);
    assert.deepEqual((await post(unknown, signForTest.webhook(WH, unknown))).body, { ok: true, ignored: true });
    const cheap = evt(o, 'payment.captured', 100);
    assert.deepEqual((await post(cheap, signForTest.webhook(WH, cheap))).body, { ok: true, ignored: true });
    assert.equal((await h.call('GET', '/wallet', { uid: 'w5' })).body.balance, 0);
    assert.equal((await CoinOrder.findById(o.orderId)).status, 'created');
  });

  test('a signed body that is not JSON is 400 bad_json; an empty body is a bad signature', async () => {
    const junk = 'not json at all';
    const r = await post(junk, signForTest.webhook(WH, junk));
    assert.deepEqual([r.status, r.body.code], [400, 'bad_json']);
    assert.equal((await post('', signForTest.webhook(WH, ''))).body.code, 'bad_signature');
  });

  test('no webhook secret configured: 503 webhook_unconfigured (never "valid")', async () => {
    const save = h.config.payments;
    try {
      h.setPayments({ webhookSecret: '' });
      const raw = evt({ razorpayOrderId: 'o', amountPaise: 1 });
      const r = await post(raw, signForTest.webhook('', raw));
      assert.deepEqual([r.status, r.body.code], [503, 'webhook_unconfigured']);
    } finally { h.setPayments(save); }
  });

  test('only the BFFs may deliver a webhook (a service token is still required)', async () => {
    const raw = '{}';
    const sig = signForTest.webhook(WH, raw);
    const noTok = await h.call('POST', '/webhooks/razorpay', { tok: null, raw, headers: { 'x-razorpay-signature': sig } });
    assert.equal(noTok.status, 401);
    const mono = await h.call('POST', '/webhooks/razorpay', { tok: sign({ iss: 'monolith' }), raw, headers: { 'x-razorpay-signature': sig } });
    assert.equal(mono.status, 403);
    assert.equal((await h.call('POST', '/webhooks/razorpay', { tok: sign({ iss: 'admin-bff' }), raw, headers: { 'x-razorpay-signature': sig } })).status, 200);
  });
});

/* ────────────────────────────────────────────────────────── operator routes + masking ── */
describe('operator routes: packs, orders, stats, wallets, adjust, billing rules, masking', () => {
  let h; let deps;
  before(async () => {
    deps = fakeDeps({ users: [{ uid: 'a1', name: 'Asha Rao', contact: '+919800000001' }, { uid: 'b1', name: 'Bhaskar', contact: 'b@example.com' }] });
    h = await boot('wallet_admin_tests', { deps });
    await seedWallet();
  });
  after(() => h.stop());

  test('pack CRUD validates with packProblem against the coin rate and returns the derived fields', async () => {
    const bad = await h.call('POST', '/admin/coin-packs', { body: { coins: 10, price: 20 } });
    assert.deepEqual([bad.status, bad.body.code], [400, 'bad_pack']);
    const ok = await h.call('POST', '/admin/coin-packs', { body: { coins: 60, price: 40, order: 9, bogus: 1 } });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.salePct, 50);
    assert.equal(ok.body.bogus, undefined);
    assert.equal((await h.call('PUT', `/admin/coin-packs/${ok.body.id}`, { body: { price: 80 } })).status, 400, 'merged with the stored coins = a premium');
    assert.equal((await h.call('PUT', `/admin/coin-packs/${ok.body.id}`, { body: { active: false } })).body.active, false);
    assert.equal((await h.call('GET', '/coins/packs', { iss: 'mobile-bff', tok: sign({ iss: 'mobile-bff' }) })).body.packs.some((p) => p.id === ok.body.id), false, 'inactive packs are hidden');
    assert.equal((await h.call('PUT', `/admin/coin-packs/${OID}`, { body: { active: true } })).body.code, 'pack_not_found');
    assert.equal((await h.call('DELETE', `/admin/coin-packs/${ok.body.id}`)).status, 200);
    assert.equal((await h.call('GET', '/admin/coin-packs')).body.some((p) => p.id === ok.body.id), false);
  });

  test('roles: pack and billing writes need money:edit; an editor and a viewer read but cannot write; the area gate is enforced here too', async () => {
    for (const perms of [EDITOR, VIEWER]) {
      assert.equal((await h.call('GET', '/admin/coin-packs', { perms })).status, 200);
      assert.equal((await h.call('GET', '/admin/coin-stats', { perms })).status, 200);
      assert.equal((await h.call('GET', '/admin/billing/rules', { perms })).status, 200);
      for (const [m, p, b] of [['POST', '/admin/coin-packs', { coins: 30, price: 20 }], ['PUT', `/admin/coin-packs/${OID}`, {}], ['DELETE', `/admin/coin-packs/${OID}`], ['PUT', '/admin/billing/rules', { callsEnabled: true }], ['POST', '/admin/wallet/adjust', { uid: 'a1', amount: 5, reason: 'x' }]]) {
        const r = await h.call(m, p, { perms, body: b });
        assert.equal(r.status, 403, `${m} ${p}`);
        assert.equal(r.body.code, 'forbidden');
      }
      assert.equal((await h.call('GET', '/admin/wallets?q=asha', { perms })).status, 403, 'the wallet search needs devotees:view');
    }
    assert.equal((await h.call('GET', '/admin/coin-packs', { perms: ['content:edit'] })).status, 403);
  });

  test('wallet search goes through identity: name or contact -> uid + balance; devotees:view is required; identity down is a clear 503', async () => {
    await h.ledger('POST', '/credit', { uid: 'a1', amount: 25, key: 'search-fund', type: 'bonus' });
    const r = await h.call('GET', '/admin/wallets?q=asha');
    assert.deepEqual(r.body, { wallets: [{ uid: 'a1', name: 'Asha Rao', contact: '+919800000001', balance: 25 }] });
    assert.deepEqual((await h.call('GET', '/admin/wallets')).body, { wallets: [] });
    assert.equal((await h.call('GET', '/admin/wallets?q=bhaskar')).body.wallets[0].balance, 0);
    deps.identityDown = true;
    const down = await h.call('GET', '/admin/wallets?q=asha');
    deps.identityDown = false;
    assert.deepEqual([down.status, down.body.code], [503, 'identity_unavailable']);
  });

  test('adjust: the reason is mandatory, an unknown uid is refused, the operator is recorded, a repeat applies once, and it never overdraws', async () => {
    const adj = (b, o) => h.call('POST', '/admin/wallet/adjust', { body: b, ...o });
    assert.equal((await adj({ amount: 5, reason: 'x' })).body.code, 'no_user');
    assert.equal((await adj({ uid: 'a1', amount: 5 })).body.code, 'reason_required');
    assert.equal((await adj({ uid: 'a1', amount: 5, reason: '   ' })).body.code, 'reason_required');
    assert.equal((await adj({ uid: 'a1', amount: 0, reason: 'x' })).body.code, 'bad_amount');
    const ok = await adj({ uid: 'a1', amount: 10, reason: 'Goodwill credit, call dropped', requestId: 'req-adj-1' }, { ctx: { username: 'priya' } });
    assert.deepEqual(ok.body, { ok: true, balance: 35 });
    const dup = await adj({ uid: 'a1', amount: 10, reason: 'Goodwill credit, call dropped', requestId: 'req-adj-1' });
    assert.equal(dup.body.balance, 35, 'a retried request id applies once');
    assert.deepEqual((await adj({ uid: 'a1', amount: -10, reason: 'Reversal', requestId: 'req-adj-2' })).body, { ok: true, balance: 25 });
    const over = await adj({ uid: 'a1', amount: -1000, reason: 'Too much', requestId: 'req-adj-3' });
    assert.deepEqual([over.status, over.body.code], [402, 'insufficient_coins']);
    const row = await WalletTxn.findOne({ idempotencyKey: 'adjust:req-adj-1' });
    assert.deepEqual([row.type, row.refType, row.createdBy, row.note, row.amount], ['adjustment', 'admin', 'priya', 'Goodwill credit, call dropped', 10]);
  });

  test('the admin ledger: names from identity (uid when unknown), filters, and the masking an editor gets: pseudonym + the reason hidden', async () => {
    const tx = (await h.call('GET', '/admin/wallet-transactions?uid=a1')).body.transactions;
    assert.ok(tx.length >= 3);
    const ORDER = ['id', 'uid', 'who', 'type', 'amount', 'balanceAfter', 'refType', 'refId', 'note', 'createdBy', 'at'];
    for (const t of tx) assert.deepEqual(Object.keys(t), ORDER.filter((k) => k in t), 'the monolith\'s key order (a field with no value is simply absent)');
    assert.equal(tx[0].who, 'Asha Rao');
    assert.ok(tx.some((t) => t.note === 'Goodwill credit, call dropped'), 'an admin sees the reason');
    assert.equal((await h.call('GET', '/admin/wallet-transactions?type=adjustment')).body.transactions.every((t) => t.type === 'adjustment'), true);
    const masked = (await h.call('GET', '/admin/wallet-transactions?uid=a1', { perms: EDITOR })).body.transactions;
    assert.ok(masked.every((t) => /^Devotee ••\d{4}$/.test(t.who)), JSON.stringify(masked.map((t) => t.who)));
    assert.ok(masked.every((t) => t.who === masked[0].who), 'a stable pseudonym for one devotee');
    assert.ok(!JSON.stringify(masked).includes('Asha'));
    assert.ok(!JSON.stringify(masked).includes('Goodwill'), 'the free-text reason is hidden from roles that may not see devotees');
    assert.ok(masked.some((t) => t.note === 'Adjustment (reason visible to admins)'));
    assert.equal((await h.call('GET', '/admin/wallet-transactions?uid=ghost')).body.transactions.length, 0);
    deps.users.push({ uid: 'ghost', name: 'Ghost', contact: 'g' });
    await h.ledger('POST', '/credit', { uid: 'zz', amount: 1, key: 'zz', type: 'bonus' });
    assert.equal((await h.call('GET', '/admin/wallet-transactions?uid=zz')).body.transactions[0].who, 'zz', 'an unknown devotee shows the uid');
  });

  test('coin orders and stats: the lists, redacted for roles that may not see devotees; sales count only paid razorpay orders', async () => {
    await CoinOrder.create({ uid: 'a1', coins: 120, price: 100, amountPaise: 10000, status: 'paid', provider: 'razorpay', paidAt: new Date() });
    await CoinOrder.create({ uid: 'a1', coins: 30, price: 20, amountPaise: 2000, status: 'paid', provider: 'mock', paidAt: new Date() });
    await CoinOrder.create({ uid: 'a1', coins: 30, price: 20, amountPaise: 2000, status: 'created', provider: 'razorpay' });
    const orders = (await h.call('GET', '/admin/coin-orders')).body.orders;
    assert.deepEqual(Object.keys(orders[0]), ['id', 'uid', 'who', 'coins', 'price', 'status', 'provider', 'at']);
    assert.equal(orders[0].who, 'Asha Rao');
    assert.ok((await h.call('GET', '/admin/coin-orders', { perms: VIEWER })).body.orders.every((o) => /^Devotee ••/.test(o.who)));
    const stats = (await h.call('GET', '/admin/coin-stats')).body;
    assert.deepEqual(Object.keys(stats), ['salesPaise', 'coinsSold', 'coinsSpent', 'unspentCoins']);
    assert.deepEqual([stats.salesPaise, stats.coinsSold], [10000, 120], 'a mock purchase is not revenue');
    assert.ok(stats.unspentCoins >= 25);
  });

  test('billing rules: GET the values from engagement, PUT validates everything first, writes through engagement with the operator\'s claims, ignores unknown keys', async () => {
    deps.settingsData = { coinsPerRupee: '1', minMinutes: '3', callsEnabled: 'true', bookingCancelHours: '0' };
    const g = (await h.call('GET', '/admin/billing/rules')).body;
    assert.deepEqual(Object.keys(g), ['minMinutes', 'ringTimeoutSec', 'defaultSharePct', 'payoutPaisePerCoin', 'callsEnabled', 'coinsPerRupee', 'chadhavaServiceFee', 'chadhavaMinAmount', 'bookingCancelHours', 'prasadDelivery']);
    assert.deepEqual([g.minMinutes, g.ringTimeoutSec, g.defaultSharePct, g.callsEnabled, g.coinsPerRupee], [3, 25, 30, true, 1]);
    const p = await h.call('PUT', '/admin/billing/rules', { body: { minMinutes: 5, callsEnabled: false, defaultSharePct: 40, evil: 'x' }, ctx: { username: 'root' } });
    assert.equal(p.status, 200);
    assert.deepEqual([p.body.minMinutes, p.body.callsEnabled, p.body.defaultSharePct], [5, false, 40]);
    const w = deps.upserts.at(-1);
    assert.deepEqual(w.items.map((i) => i.key).sort(), ['callsEnabled', 'defaultSharePct', 'minMinutes']);
    assert.ok(w.as.perms.includes('money:edit') && w.as.ctx.username === 'root');
    const bad = await h.call('PUT', '/admin/billing/rules', { body: { minMinutes: 7, defaultSharePct: 140 } });
    assert.deepEqual([bad.status, bad.body.code, bad.body.field], [400, 'bad_rule', 'defaultSharePct']);
    assert.equal((await h.call('GET', '/admin/billing/rules')).body.minMinutes, 5, 'nothing half-applied');
    assert.equal((await h.call('PUT', '/admin/billing/rules', { body: { callsEnabled: 'yes' } })).status, 400);
    assert.equal((await h.call('PUT', '/admin/billing/rules', { body: { minMinutes: 2.5 } })).status, 400);
    assert.equal((await h.call('PUT', '/admin/billing/rules', { body: { coinsPerRupee: 0 } })).status, 400);
  });
});

/* ─────────────────────────────────────────── money-affecting settings fail CLOSED ── */
describe('settings: the coin rate and the billing rules are read strictly - unavailable is a 503, never a guess', () => {
  let h; let deps;
  before(async () => { deps = fakeDeps(); h = await boot('wallet_strict_tests', { deps }); await seedWallet(); });
  after(() => h.stop());

  test('engagement unreachable: creating or editing a pack and the billing rules are 503 settings_unavailable, and nothing is written', async () => {
    deps.down = true;
    try {
      const before = await CoinPack.countDocuments();
      for (const [m, p, b] of [['POST', '/admin/coin-packs', { coins: 30, price: 20 }], ['PUT', `/admin/coin-packs/${(await CoinPack.findOne())._id}`, { price: 5 }], ['GET', '/admin/billing/rules'], ['GET', '/admin/coin-packs']]) {
        const r = await h.call(m, p, { body: b });
        assert.deepEqual([r.status, r.body.code], [503, 'settings_unavailable'], `${m} ${p}`);
      }
      const put = await h.call('PUT', '/admin/billing/rules', { body: { minMinutes: 4 } });
      assert.equal(put.status, 502);
      assert.equal(await CoinPack.countDocuments(), before);
    } finally { deps.down = false; }
  });

  test('the pack list the app shows needs the rate only for its sale labels; credited coins never do', async () => {
    deps.down = true;
    try {
      const r = await h.call('GET', '/coins/packs', { iss: 'mobile-bff', tok: sign({ iss: 'mobile-bff' }) });
      assert.deepEqual([r.status, r.body.code], [503, 'settings_unavailable']);
      // a purchase does not read settings at all: it is priced from the pack row
      const pack = await CoinPack.findOne({ coins: 120 });
      const o = await h.call('POST', '/wallet/orders', { uid: 'strict1', body: { packId: String(pack._id) } });
      assert.equal(o.status, 200);
      const v = await h.call('POST', `/wallet/orders/${o.body.orderId}/verify`, { uid: 'strict1', body: { mock: true } });
      assert.deepEqual(v.body, { ok: true, balance: 120, coinsAdded: 120 });
    } finally { deps.down = false; }
  });
});

describe('the settings reader (engagement client): fresh vs display reads, no defaults for an outage', () => {
  const cfg = () => loadConfig({ INTERNAL_JWT_SECRET: SECRET, ENGAGEMENT_URL: 'http://e', IDENTITY_URL: 'http://i' });
  const mk = (state, t = { now: 1_000_000 }) => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push(String(url));
      if (state.down) throw new Error('ECONNREFUSED');
      return new Response(JSON.stringify({ settings: state.settings }), { status: 200 });
    };
    return { calls, reader: createSettingsReader(cfg(), { fetchImpl, logger: { warn() {}, info() {}, error() {} }, now: () => t.now }), t };
  };

  test('a fresh read within the TTL does not ask again; after it, it asks; unreachable = HttpError 503 even if an older answer is cached', async () => {
    const state = { settings: { coinsPerRupee: '2' } };
    const { calls, reader, t } = mk(state);
    assert.equal(await reader.getNumber('coinsPerRupee', 1, { fresh: true }), 2);
    assert.equal(await reader.getNumber('coinsPerRupee', 1, { fresh: true }), 2);
    assert.equal(calls.length, 1);
    t.now += 16_000;
    state.settings = { coinsPerRupee: '3' };
    assert.equal(await reader.getNumber('coinsPerRupee', 1, { fresh: true }), 3);
    t.now += 16_000;
    state.down = true;
    await assert.rejects(() => reader.getNumber('coinsPerRupee', 1, { fresh: true }), (e) => e.status === 503 && e.code === 'settings_unavailable');
    assert.equal(await reader.getNumber('coinsPerRupee', 1), 3, 'a display read may use the last answer of any age');
  });

  test('nothing ever known + unreachable: even a display read is 503 (no default is invented); an absent KEY in a map that was read gets the documented default', async () => {
    const down = mk({ down: true, settings: {} });
    await assert.rejects(() => down.reader.getNumber('coinsPerRupee', 1), (e) => e.status === 503);
    await assert.rejects(() => down.reader.map({ fresh: true }), (e) => e.code === 'settings_unavailable');
    const up = mk({ settings: {} });
    assert.equal(await up.reader.getNumber('coinsPerRupee', 1, { fresh: true }), 1);
    assert.equal(await up.reader.getBool('callsEnabled', true), true);
  });

  test('upsert signs the operator\'s claims and drops the cache', async () => {
    const state = { settings: { a: '1' } };
    const seen = [];
    const fetchImpl = async (url, init) => {
      seen.push({ url: String(url), method: init.method, auth: init.headers.authorization, body: init.body });
      return new Response(JSON.stringify(init.method === 'POST' ? { ok: true } : { settings: state.settings }), { status: 200 });
    };
    const reader = createSettingsReader(cfg(), { fetchImpl, logger: { warn() {} } });
    await reader.map({ fresh: true });
    await reader.upsert([{ key: 'a', value: '2' }], { sub: 'op1', role: 'admin', perms: ['money:edit'] });
    await reader.map({ fresh: true });
    assert.equal(seen.filter((s) => s.method === 'GET').length, 2, 'the cache was dropped by the write');
    const post = seen.find((s) => s.method === 'POST');
    assert.equal(post.url, 'http://e/internal/engagement/settings/upsert');
    const claims = JSON.parse(Buffer.from(post.auth.split('.')[1], 'base64url'));
    assert.deepEqual([claims.iss, claims.sub, claims.perms], ['wallet', 'op1', ['money:edit']]);
  });
});

/* ───────────────────────────────────────────────────────────── table + config + jobs ── */
describe('every route the admin BFF forwards exists here, and every operator route here is forwarded', () => {
  let h;
  before(async () => { h = await boot('wallet_table_tests'); });
  after(() => h.stop());

  test('table -> service: each entry is a real route (not the 404 fall-through)', async () => {
    for (const r of WALLET_ADMIN_ROUTES) {
      const path = (r.sample ?? r.path);
      const res = await h.call(r.method, path, { body: r.method === 'GET' ? undefined : {} });
      assert.ok(!(res.status === 404 && res.body?.error === 'not found'), `${r.method} ${path} is not registered in the wallet service`);
    }
  });

  test('service -> table: every /admin route the wallet registers is in the BFF table (a new one needs an entry there and an area)', () => {
    const app = createApp(testConfig('unused'), { isReady: () => true, ...fakeDeps() });
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
    const operator = [...found].map((s) => s.replace('/internal/wallet', '').replace(/(.)\/$/, '$1')).filter((s) => /^[A-Z]+ \/admin\//.test(s));
    assert.equal(operator.length, WALLET_ADMIN_ROUTES.length, operator.join(', '));
    const table = new Set(WALLET_ADMIN_ROUTES.map((r) => `${r.method} ${r.path.replace(/:\w+/g, ':p')}`));
    for (const s of operator) assert.ok(table.has(s.replace(/:\w+/g, ':p')), `${s} is not forwarded by the admin BFF`);
  });
});

/* ──────────────────────────────────────────────────────────────── the events caller (rewards) ── */
describe('the events service may only pay rewards: credit type bonus with an `event-` key, and read its own keys', () => {
  let h;
  before(async () => { h = await boot('wallet_events_caller_tests'); await seedWallet(); });
  after(() => h.stop());

  const as = (method, path, body) => h.ledger(method, path, body, 'events');
  const code = (r) => [r.status, r.body.code];
  const balance = async (uid) => (await h.ledger('GET', `/balance/${uid}`)).body.balance;

  test('a reward credit lands once; the same key again is the first result (no second payment)', async () => {
    const a = await as('POST', '/credit', { uid: 'ev1', amount: 25, type: 'bonus', key: 'event-ms:yatra:day1:ev1', refType: 'event', refId: 'yatra' });
    assert.deepEqual([a.status, a.body.balance, a.body.txn.type, a.body.duplicate], [200, 25, 'bonus', false]);
    const b = await as('POST', '/credit', { uid: 'ev1', amount: 25, type: 'bonus', key: 'event-ms:yatra:day1:ev1' });
    assert.deepEqual([b.status, b.body.balance, b.body.duplicate, b.body.txn.id], [200, 25, true, a.body.txn.id]);
    assert.equal(await balance('ev1'), 25);
  });

  test('a key that does not start with `event-` is refused (403 key_not_allowed) and moves nothing', async () => {
    for (const key of ['booking:ev2:x', 'call:1:goodwill:2', 'event', 'event-', 'Event-x', ' event-x', undefined]) {
      const r = await as('POST', '/credit', { uid: 'ev2', amount: 5, type: 'bonus', key });
      assert.deepEqual(code(r), [403, 'key_not_allowed'], String(key));
    }
    assert.equal(await balance('ev2'), 0);
  });

  test('only type bonus, and only a whole number of coins from 1 to 100000', async () => {
    for (const type of ['recharge', 'refund', 'adjustment', 'booking_debit', undefined]) {
      assert.deepEqual(code(await as('POST', '/credit', { uid: 'ev3', amount: 5, type, key: 'event-x:1' })), [400, 'bad_type'], String(type));
    }
    for (const amount of [0, -5, 1.5, '5', 100_001, null, undefined]) {
      assert.deepEqual(code(await as('POST', '/credit', { uid: 'ev3', amount, type: 'bonus', key: `event-x:${amount}` })), [400, 'bad_amount'], String(amount));
    }
    assert.equal((await as('POST', '/credit', { uid: 'ev3', amount: 100_000, type: 'bonus', key: 'event-x:max' })).status, 200);
  });

  test('it cannot debit, refund, reconcile or read a balance (403 wrong_issuer), and may only look up `event-` keys', async () => {
    for (const [m, p, body] of [
      ['POST', '/debit', { uid: 'ev1', amount: 1, key: 'event-d', type: 'booking_debit' }],
      ['POST', '/refund', { uid: 'ev1', amount: 1, key: 'event-r', ofKey: 'event-ms:yatra:day1:ev1' }],
      ['POST', '/reconcile', {}],
      ['GET', '/balance/ev1'],
    ]) assert.deepEqual(code(await as(m, p, body)), [403, 'wrong_issuer'], `${m} ${p}`);
    assert.equal((await as('GET', '/txn?key=event-ms:yatra:day1:ev1&uid=ev1')).body.txn.status, 'posted');
    assert.deepEqual((await as('GET', '/txn?key=event-never')).body, { txn: null });
    assert.deepEqual(code(await as('GET', '/txn?key=booking:l1:req1')), [403, 'key_not_allowed']);
    assert.deepEqual(code(await as('GET', '/txn')), [403, 'key_not_allowed']);
    assert.equal(await balance('ev1'), 25, 'nothing above moved a coin');
  });

  test('other callers are unchanged: orders can still credit with any key, and the events key rule does not apply to them', async () => {
    const r = await h.ledger('POST', '/credit', { uid: 'ev4', amount: 3, type: 'bonus', key: 'anything:goes' }, 'orders');
    assert.deepEqual([r.status, r.body.balance], [200, 3]);
  });

  test('events is a default allowed issuer', () => {
    assert.ok(testConfig('x').allowedIssuers.includes('events'));
  });
});

describe('config', () => {
  const need = { INTERNAL_JWT_SECRET: SECRET, ENGAGEMENT_URL: 'http://e/', IDENTITY_URL: 'http://i/' };
  test('the required variables, the defaults, and the parsing', () => {
    assert.throws(() => loadConfig({ ENGAGEMENT_URL: 'http://e', IDENTITY_URL: 'http://i' }), /INTERNAL_JWT_SECRET/);
    assert.throws(() => loadConfig({ INTERNAL_JWT_SECRET: SECRET, IDENTITY_URL: 'http://i' }), /ENGAGEMENT_URL/);
    assert.throws(() => loadConfig({ INTERNAL_JWT_SECRET: SECRET, ENGAGEMENT_URL: 'http://e' }), /IDENTITY_URL/);
    assert.throws(() => loadConfig({ ...need, INTERNAL_JWT_SECRET: 'short' }), /16 characters/);
    const c = loadConfig(need);
    assert.deepEqual([c.port, c.dbName, c.engagementUrl, c.identityUrl, c.isProduction, c.reconcileEveryMs], [4060, 'wallet', 'http://e', 'http://i', false, 15000]);
    assert.deepEqual(c.allowedIssuers, ['mobile-bff', 'admin-bff', 'monolith', 'pooja-api', 'orders', 'calls', 'events']);
    const o = loadConfig({ ...need, PORT: '5000', DB_NAME: 'w2', ALLOWED_ISSUERS: 'a, b', NODE_ENV: 'production', GIT_COMMIT: 'abc', RECONCILE_EVERY_MS: '0' });
    assert.deepEqual([o.port, o.dbName, o.allowedIssuers, o.isProduction, o.commit, o.reconcileEveryMs], [5000, 'w2', ['a', 'b'], true, 'abc', 0]);
    assert.throws(() => { o.port = 1; }, TypeError, 'frozen');
  });

  test('the payment settings are read once and TRIMMED (a pasted newline breaks auth invisibly)', () => {
    const c = loadConfig({ ...need, PAYMENTS_PROVIDER: ' mock ', RAZORPAY_KEY_ID: ' rzp_test_a\n', RAZORPAY_KEY_SECRET: '\tsec ', RAZORPAY_WEBHOOK_SECRET: ' wh \n', NODE_ENV: 'production' });
    assert.deepEqual({ ...c.payments }, { nodeEnv: 'production', provider: 'mock', keyId: 'rzp_test_a', keySecret: 'sec', webhookSecret: 'wh' });
    assert.throws(() => { c.payments.keyId = 'x'; }, TypeError);
  });

  test('.env.example lists exactly the variables config.js reads', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const read = (f) => readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8');
    const used = new Set([...read('./config.js').matchAll(/(?:name: '|env\.)([A-Z][A-Z0-9_]+)/g)].map((m) => m[1]));
    const listed = new Set([...read('../.env.example').matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]));
    assert.deepEqual([...used].sort(), [...listed].sort());
    assert.ok(used.has('RAZORPAY_WEBHOOK_SECRET') && used.has('PAYMENTS_PROVIDER') && used.has('NODE_ENV'));
  });

  test('config.js is the only file that reads the environment', async () => {
    const { execFileSync } = await import('node:child_process');
    const { fileURLToPath } = await import('node:url');
    const out = execFileSync('grep', ['-rl', '--include=*.js', 'process\\.env', fileURLToPath(new URL('.', import.meta.url))], { encoding: 'utf8' }).split('\n').filter(Boolean);
    assert.deepEqual(out.map((p) => p.split('/src/')[1]), ['config.js']);
  });
});
