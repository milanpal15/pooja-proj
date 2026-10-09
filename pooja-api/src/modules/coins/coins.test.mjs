import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { describePack, packProblem } from '../../lib/coin-pack.js';
import { Flag, DEFAULT_FLAGS, Setting } from '../../models.js';
import { boot } from '../test-kit.mjs';
import * as wallet from '../wallet/wallet.service.js';
import * as coins from './index.js';
import { CoinOrder } from './coins.model.js';
import { signForTest } from './providers.js';

let h;
before(async () => {
  process.env.NODE_ENV = 'test';
  delete process.env.RAZORPAY_KEY_ID; delete process.env.RAZORPAY_KEY_SECRET; delete process.env.PAYMENTS_PROVIDER;
  h = await boot(coins, 'commerce_coins');
  await coins.seed();
});
after(() => h.stop());

test('describePack: 30 coins for ₹20 is +10 extra, 50% EXTRA', () => {
  const d = describePack({ coins: 30, price: 20 });
  assert.equal(d.baseCoins, 20); assert.equal(d.extraCoins, 10); assert.equal(d.salePct, 50); assert.equal(d.onSale, true);
  assert.equal(describePack({ coins: 20, price: 20 }).onSale, false);
});

test('packProblem refuses a premium and non-integers', () => {
  assert.match(packProblem({ coins: 10, price: 20 }), /at least 20/);
  assert.ok(packProblem({ coins: 1.5, price: 2 }));
  assert.equal(packProblem({ coins: 30, price: 20 }), null);
});

test('seed: settings, flags, offerings-free packs; and it is idempotent', async () => {
  await Setting.updateOne({ key: 'chadhavaServiceFee' }, { $set: { value: '9' } });
  await coins.seed();
  assert.equal((await Setting.findOne({ key: 'chadhavaServiceFee' })).value, '9', 'operator edit survives');
  const { body } = await h.call('GET', '/coins/packs');
  assert.equal(body.packs.length, 6);
  assert.equal(body.coinsPerRupee, 1);
  const p30 = body.packs.find((p) => p.coins === 30);
  assert.deepEqual([p30.price, p30.extraCoins, p30.salePct, p30.onSale], [20, 10, 50, true]);
  assert.equal(body.packs.find((p) => p.coins === 20).onSale, false);
  assert.ok(await Flag.findOne({ key: 'astrologerCalls' }));
  assert.ok(DEFAULT_FLAGS.some((f) => f.key === 'astrologerCalls'));
  await Flag.create({ key: 'payments', label: 'Payments', desc: 'Razorpay checkout' }).catch(() => Flag.updateOne({ key: 'payments' }, { $set: { label: 'Payments' } }));
  await coins.seed();
  assert.equal((await Flag.findOne({ key: 'payments' })).label, 'Coin purchases');
});

test('admin pack CRUD validates with packProblem and returns derived fields', async () => {
  const bad = await h.call('POST', '/admin/coin-packs', { body: { coins: 10, price: 20 } });
  assert.equal(bad.status, 400); assert.equal(bad.body.code, 'bad_pack');
  const ok = await h.call('POST', '/admin/coin-packs', { body: { coins: 60, price: 40, order: 9, bogus: 1 } });
  assert.equal(ok.status, 201); assert.equal(ok.body.salePct, 50);
  const put = await h.call('PUT', `/admin/coin-packs/${ok.body.id}`, { body: { price: 80 } });
  assert.equal(put.status, 400, 'merged with stored coins=60 → premium');
  const put2 = await h.call('PUT', `/admin/coin-packs/${ok.body.id}`, { body: { active: false } });
  assert.equal(put2.body.active, false);
  assert.equal((await h.call('GET', '/coins/packs')).body.packs.some((p) => p.id === ok.body.id), false, 'inactive hidden');
  assert.equal((await h.call('DELETE', `/admin/coin-packs/${ok.body.id}`)).status, 200);
});

test('mock purchase: verify twice then webhook credits exactly once, from the snapshot', async () => {
  const uid = 'buyer1';
  const packs = (await h.call('GET', '/coins/packs')).body.packs;
  const pack = packs.find((p) => p.coins === 30);
  const o = await h.call('POST', '/wallet/orders', { uid, body: { packId: pack.id } });
  assert.equal(o.status, 200);
  assert.deepEqual([o.body.provider, o.body.amountPaise, o.body.coins, o.body.price], ['mock', 2000, 30, 20]);
  // Operator changes the pack mid-payment: the order keeps its snapshot.
  await h.call('PUT', `/admin/coin-packs/${pack.id}`, { body: { coins: 99, price: 20 } });
  const v1 = await h.call('POST', `/wallet/orders/${o.body.orderId}/verify`, { uid, body: { mock: true } });
  const v2 = await h.call('POST', `/wallet/orders/${o.body.orderId}/verify`, { uid, body: { mock: true } });
  assert.deepEqual([v1.body.ok, v1.body.balance, v1.body.coinsAdded], [true, 30, 30]);
  assert.equal(v2.body.balance, 30);
  assert.equal(await wallet.getBalance(uid), 30);
  assert.equal((await CoinOrder.findById(o.body.orderId)).status, 'paid');
  assert.equal((await wallet.verifyWallet(uid)).ok, true);
  // Someone else cannot verify it.
  assert.equal((await h.call('POST', `/wallet/orders/${o.body.orderId}/verify`, { uid: 'other', body: { mock: true } })).status, 404);
  // mock without the flag is rejected
  const o2 = await h.call('POST', '/wallet/orders', { uid, body: { packId: pack.id } });
  assert.equal((await h.call('POST', `/wallet/orders/${o2.body.orderId}/verify`, { uid, body: {} })).status, 400);
  assert.equal(await wallet.getBalance(uid), 30);
});

test('mock is refused in production', async () => {
  process.env.NODE_ENV = 'production';
  try {
    const packs = (await h.call('GET', '/coins/packs')).body.packs;
    const r = await h.call('POST', '/wallet/orders', { uid: 'x', body: { packId: packs[0].id } });
    assert.equal(r.status, 503); assert.equal(r.body.code, 'payments_unavailable');
    process.env.PAYMENTS_PROVIDER = 'mock';
    assert.equal((await h.call('POST', '/wallet/orders', { uid: 'x', body: { packId: packs[0].id } })).status, 503);
  } finally { process.env.NODE_ENV = 'test'; delete process.env.PAYMENTS_PROVIDER; }
});

test('razorpay: order creation, signature rejection, verify, then webhook is a no-op', async () => {
  Object.assign(process.env, { RAZORPAY_KEY_ID: 'rzp_test_x', RAZORPAY_KEY_SECRET: 'sekret', RAZORPAY_WEBHOOK_SECRET: 'whsec' });
  const realFetch = globalThis.fetch;
  let rzCalls = 0;
  globalThis.fetch = async (u, init) => {
    if (String(u).startsWith('https://api.razorpay.com')) {
      rzCalls++;
      assert.match(init.headers.Authorization, /^Basic /);
      const b = JSON.parse(init.body);
      assert.equal(b.currency, 'INR');
      return new Response(JSON.stringify({ id: `order_RZ${rzCalls}`, amount: b.amount }), { status: 200 });
    }
    return realFetch(u, init);
  };
  try {
    const uid = 'buyer2';
    const pack = (await h.call('GET', '/coins/packs')).body.packs.find((p) => p.coins === 120);
    const o = await h.call('POST', '/wallet/orders', { uid, body: { packId: pack.id } });
    assert.deepEqual([o.body.provider, o.body.razorpayOrderId, o.body.keyId, o.body.amountPaise], ['razorpay', 'order_RZ1', 'rzp_test_x', 10000]);

    const bad = await h.call('POST', `/wallet/orders/${o.body.orderId}/verify`, { uid, body: { razorpayPaymentId: 'pay_1', razorpaySignature: 'deadbeef' } });
    assert.equal(bad.status, 400); assert.equal(bad.body.code, 'bad_signature');
    assert.equal((await h.call('POST', `/wallet/orders/${o.body.orderId}/verify`, { uid, body: { mock: true } })).status, 400, 'mock flag does not bypass razorpay');
    assert.equal(await wallet.getBalance(uid), 0);

    const sig = signForTest.checkout('sekret', 'order_RZ1', 'pay_1');
    const good = await h.call('POST', `/wallet/orders/${o.body.orderId}/verify`, { uid, body: { razorpayPaymentId: 'pay_1', razorpaySignature: sig } });
    assert.deepEqual([good.body.ok, good.body.balance, good.body.coinsAdded], [true, 120, 120]);

    // Webhook: bad signature rejected; good one acknowledged without double credit.
    const evt = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1', order_id: 'order_RZ1', amount: 10000 } } } });
    assert.equal((await h.call('POST', '/webhooks/razorpay', { raw: evt, headers: { 'x-razorpay-signature': 'nope' } })).status, 400);
    const wh = await h.call('POST', '/webhooks/razorpay', { raw: evt, headers: { 'x-razorpay-signature': signForTest.webhook('whsec', evt) } });
    assert.equal(wh.status, 200); assert.equal(wh.body.credited, false);
    assert.equal(await wallet.getBalance(uid), 120);

    // Webhook alone credits when verify never arrived.
    const o3 = await h.call('POST', '/wallet/orders', { uid, body: { packId: pack.id } });
    const evt2 = JSON.stringify({ event: 'order.paid', payload: { payment: { entity: { id: 'pay_2', order_id: o3.body.razorpayOrderId, amount: 10000 } } } });
    const h2 = { 'x-razorpay-signature': signForTest.webhook('whsec', evt2) };
    assert.equal((await h.call('POST', '/webhooks/razorpay', { raw: evt2, headers: h2 })).body.credited, true);
    await h.call('POST', '/webhooks/razorpay', { raw: evt2, headers: h2 });
    assert.equal(await wallet.getBalance(uid), 240);
    // A wrong paid amount is not credited.
    const o4 = await h.call('POST', '/wallet/orders', { uid, body: { packId: pack.id } });
    const evt3 = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_3', order_id: o4.body.razorpayOrderId, amount: 100 } } } });
    await h.call('POST', '/webhooks/razorpay', { raw: evt3, headers: { 'x-razorpay-signature': signForTest.webhook('whsec', evt3) } });
    assert.equal(await wallet.getBalance(uid), 240);

    const stats = (await h.call('GET', '/admin/coin-stats')).body;
    assert.equal(stats.coinsSold, 240); assert.equal(stats.salesPaise, 20000);
    const orders = (await h.call('GET', '/admin/coin-orders')).body.orders;
    assert.ok(orders.length >= 4 && orders.some((x) => x.status === 'paid'));
  } finally {
    globalThis.fetch = realFetch;
    for (const k of ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET']) delete process.env[k];
  }
});

test('unknown pack is 404; devotee routes need a token', async () => {
  assert.equal((await h.call('POST', '/wallet/orders', { uid: 'u', body: { packId: 'nope' } })).status, 404);
  assert.equal((await h.call('POST', '/wallet/orders', { body: { packId: 'nope' } })).status, 401);
});

test('billing rules: GET defaults, PUT round trip, validation, unknown keys ignored', async () => {
  const g = (await h.call('GET', '/admin/billing/rules')).body;
  assert.deepEqual(
    [g.minMinutes, g.ringTimeoutSec, g.defaultSharePct, g.payoutPaisePerCoin, g.callsEnabled, g.coinsPerRupee, g.bookingCancelHours],
    [3, 25, 30, 100, true, 1, 0],
  );
  assert.equal(g.chadhavaServiceFee, 9, 'earlier seed edit is read');
  const p = await h.call('PUT', '/admin/billing/rules', { body: { minMinutes: 5, callsEnabled: false, defaultSharePct: 40, evil: 'x' } });
  assert.equal(p.status, 200);
  assert.deepEqual([p.body.minMinutes, p.body.callsEnabled, p.body.defaultSharePct], [5, false, 40]);
  assert.equal(await Setting.findOne({ key: 'evil' }), null);
  assert.equal((await h.call('GET', '/admin/billing/rules')).body.callsEnabled, false);
  const bad = await h.call('PUT', '/admin/billing/rules', { body: { minMinutes: 7, defaultSharePct: 140 } });
  assert.equal(bad.status, 400); assert.equal(bad.body.field, 'defaultSharePct');
  assert.equal((await h.call('GET', '/admin/billing/rules')).body.minMinutes, 5, 'nothing half-applied');
  assert.equal((await h.call('PUT', '/admin/billing/rules', { body: { callsEnabled: 'yes' } })).status, 400);
});
