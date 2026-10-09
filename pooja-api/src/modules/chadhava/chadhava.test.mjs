import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { Temple } from '../../models.js';
import { boot } from '../test-kit.mjs';
import * as wallet from '../wallet/wallet.service.js';
import * as chadhava from './index.js';
import { ChadhavaListing, ChadhavaOrder } from './chadhava.model.js';

let h;
const HOUR = 3_600_000;
const fund = (uid, n) => wallet.credit({ uid, amount: n, type: 'bonus', idempotencyKey: `fund:${uid}:${Math.random()}` });
const order = (uid, body = {}) => h.call('POST', '/chadhava/orders', {
  uid, body: { listingSlug: 'pitru', items: [{ key: 'flowers', qty: 2 }, { key: 'diya', qty: 1 }], requestId: `req-${Math.random()}`, ...body },
});
const off = (key, coins, extra = {}) => ({ key, title: key, titleHi: key, coins, ...extra });

before(async () => {
  h = await boot(chadhava, 'chadhava_tests');
  await Temple.create({ slug: 'gaya', name: 'Vishnupad', location: 'Gaya' });
  await chadhava.seed();
  await chadhava.seed(); // idempotent
  const c = await h.call('POST', '/admin/chadhava-categories', { body: { slug: 'pitru', name: 'Pitru', nameHi: 'पितृ', order: 1 } });
  assert.equal(c.status, 201);
  const l = await h.call('POST', '/admin/chadhava-listings', {
    body: { slug: 'pitru', title: 'Pitru Paksha Chadhava', templeSlug: 'gaya', place: 'Gaya', category: 'pitru', summary: 's', howItWorks: [{ text: 'Choose' }],
      endsAt: new Date(Date.now() + 48 * HOUR).toISOString(), offerings: [off('flowers', 11, { order: 1 }), off('diya', 21, { order: 0 }), off('gold', 501, { enabled: false })] },
  });
  assert.equal(l.status, 201, JSON.stringify(l.body));
});
after(() => h.stop());

test('admin listing validation: slug, offering key/coins, window', async () => {
  const post = (b) => h.call('POST', '/admin/chadhava-listings', { body: { title: 'T', ...b } });
  assert.equal((await post({ slug: 'Bad Slug' })).body.code, 'bad_listing');
  assert.equal((await post({ slug: 'a1', offerings: [off('x', 0)] })).body.code, 'bad_listing');
  assert.equal((await post({ slug: 'a2', offerings: [off('x', 1), off('x', 2)] })).body.code, 'bad_listing');
  assert.equal((await post({ slug: 'a3', startsAt: '2026-02-01', endsAt: '2026-01-01' })).body.code, 'bad_listing');
  assert.equal((await post({ slug: 'pitru' })).status, 409);
  assert.equal((await h.call('GET', '/admin/chadhava-listings')).body.length, 1);
  assert.equal((await h.call('GET', '/admin/chadhava-categories')).body.length, 1);
});

test('public listings and detail: window, enabled offerings only, categories, fromCoins', async () => {
  await h.call('POST', '/admin/chadhava-listings', { body: { slug: 'future', title: 'Future', startsAt: new Date(Date.now() + HOUR).toISOString(), offerings: [off('a', 5)] } });
  await h.call('POST', '/admin/chadhava-listings', { body: { slug: 'gone', title: 'Gone', endsAt: new Date(Date.now() - HOUR).toISOString(), offerings: [off('a', 5)] } });
  await h.call('POST', '/admin/chadhava-listings', { body: { slug: 'off', title: 'Off', enabled: false, offerings: [off('a', 5)] } });
  const { body } = await h.call('GET', '/chadhava/listings');
  assert.deepEqual(body.listings.map((l) => l.slug), ['pitru']);
  assert.deepEqual([body.listings[0].fromCoins, body.listings[0].templeName, body.listings[0].category], [11, 'Vishnupad', 'pitru']);
  assert.deepEqual(body.categories.map((c) => c.slug), ['pitru']);
  assert.equal((await h.call('GET', '/chadhava/listings?category=other')).body.listings.length, 0);
  const d = (await h.call('GET', '/chadhava/listings/pitru')).body.listing;
  assert.deepEqual(d.offerings.map((o) => o.key), ['diya', 'flowers']); // by order, disabled gold hidden
  assert.equal(d.howItWorks[0].text, 'Choose');
  assert.equal((await h.call('GET', '/chadhava/listings/off')).status, 404);
});

test('order total is computed from the database; client prices are ignored', async () => {
  await fund('d1', 100);
  const r = await order('d1', { items: [{ key: 'flowers', qty: 2, coins: 1, price: 0 }, { key: 'diya', qty: 1 }], totalCoins: 1, total: 1 });
  assert.equal(r.status, 201);
  assert.equal(r.body.order.totalCoins, 43); // 2*11 + 21
  assert.deepEqual(r.body.order.items, [{ key: 'flowers', title: 'flowers', qty: 2, coins: 11 }, { key: 'diya', title: 'diya', qty: 1, coins: 21 }]);
  assert.match(r.body.order.ref, /^CHD-[A-Z0-9]{5}$/);
  assert.deepEqual([r.body.order.status, r.body.order.canCancel, r.body.balance], ['booked', true, 57]);
  assert.equal((await wallet.verifyWallet('d1')).ok, true);
  assert.equal((await h.call('GET', '/chadhava/orders', { uid: 'd1' })).body.orders.length, 1);
  assert.equal((await h.call('GET', '/chadhava/orders')).status, 401);
});

test('validation and errors: invalid_items, listing_closed, not_found, 402 with shortfall', async () => {
  await fund('d2', 30);
  assert.equal((await order('d2', { items: [{ key: 'gold', qty: 1 }] })).body.code, 'invalid_items'); // disabled offering
  assert.equal((await order('d2', { items: [{ key: 'nope', qty: 1 }] })).body.code, 'invalid_items');
  for (const items of [[], [{ key: 'flowers', qty: 0 }], [{ key: 'flowers', qty: 21 }], [{ key: 'flowers', qty: 1.5 }], 'x']) assert.equal((await order('d2', { items })).body.code, 'invalid_items');
  assert.equal((await order('d2', { listingSlug: 'gone' })).body.code, 'listing_closed');
  assert.equal((await order('d2', { listingSlug: 'future' })).body.code, 'listing_closed');
  assert.equal((await order('d2', { listingSlug: 'nope' })).status, 404);
  const r = await order('d2');
  assert.deepEqual([r.status, r.body.code, r.body.needed, r.body.balance, r.body.shortfall], [402, 'insufficient_coins', 43, 30, 13]);
  assert.equal(await ChadhavaOrder.countDocuments({ uid: 'd2' }), 0);
});

test('idempotent retry charges once', async () => {
  await fund('d3', 200);
  const a = await order('d3', { requestId: 'chad-same-1' });
  const b = await order('d3', { requestId: 'chad-same-1' });
  assert.deepEqual([a.status, b.status, a.body.order.id === b.body.order.id], [201, 200, true]);
  assert.equal(await wallet.getBalance('d3'), 157);
});

test('cancel refunds while booked and before the listing ends; then 409', async () => {
  await fund('k1', 100);
  const o = (await order('k1')).body.order;
  const c1 = await h.call('POST', `/chadhava/orders/${o.id}/cancel`, { uid: 'k1' });
  const c2 = await h.call('POST', `/chadhava/orders/${o.id}/cancel`, { uid: 'k1' });
  assert.deepEqual([c1.status, c1.body.order.status, c1.body.balance, c2.body.balance], [200, 'cancelled', 100, 100]);
  assert.equal(await wallet.getBalance('k1'), 100);
  assert.equal((await h.call('POST', `/chadhava/orders/${o.id}/cancel`, { uid: 'other' })).status, 404);
  const late = (await order('k1')).body.order;
  await ChadhavaOrder.updateOne({ _id: late.id }, { $set: { cancelBy: new Date(Date.now() - 1000) } });
  assert.deepEqual([(await h.call('POST', `/chadhava/orders/${late.id}/cancel`, { uid: 'k1' })).status], [409]);
  assert.equal(await wallet.getBalance('k1'), 57);
});

test('admin: orders list, mark offered once (cancel then refused), roles area wiring', async () => {
  await fund('m1', 100);
  const o = (await order('m1')).body.order;
  const list = (await h.call('GET', '/admin/chadhava-orders')).body.orders;
  assert.ok(list.length >= 3 && 'who' in list[0]);
  assert.equal((await h.call('PUT', `/admin/chadhava-orders/${o.id}/status`, { body: { status: 'booked' } })).status, 400);
  assert.equal((await h.call('PUT', `/admin/chadhava-orders/${o.id}/status`, { body: { status: 'offered' } })).body.order.status, 'offered');
  assert.equal((await h.call('PUT', `/admin/chadhava-orders/${o.id}/status`, { body: { status: 'offered' } })).status, 409);
  assert.equal((await h.call('POST', `/chadhava/orders/${o.id}/cancel`, { uid: 'm1' })).status, 409);
  assert.equal((await h.call('PUT', '/admin/chadhava-orders/000000000000000000000000/status', { body: { status: 'offered' } })).status, 404);
});

test('the old free-amount POST /chadhava answers 410, even without a token', async () => {
  const r = await h.call('POST', '/chadhava', { body: { templeSlug: 'x', amount: 21 } });
  assert.deepEqual([r.status, r.body.code], [410, 'gone']);
});

test('legacy offerings catalogue still works; listing price edits do not rewrite past orders', async () => {
  assert.deepEqual((await h.call('GET', '/chadhava/offerings')).body.offerings.map((o) => o.key), ['flowers', 'prasad', 'vastram']);
  const l = await ChadhavaListing.findOne({ slug: 'pitru' });
  await h.call('PUT', `/admin/chadhava-listings/${l._id}`, { body: { offerings: l.offerings.map((o) => ({ ...o.toObject(), coins: o.coins * 10 })) } });
  assert.equal((await h.call('GET', '/chadhava/orders', { uid: 'd1' })).body.orders[0].totalCoins, 43);
});
