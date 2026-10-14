import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { Temple } from '../../models.js';
import { boot, fakeDeps } from '../../test-kit.mjs';
import * as chadhava from './index.js';
import { ChadhavaListing } from './chadhava.model.js';

let h;
const deps = fakeDeps();
const HOUR = 3_600_000;
const off = (key, coins, extra = {}) => ({ key, title: key, titleHi: key, coins, ...extra });

before(async () => {
  h = await boot('chadhava_tests', { deps });
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

test('legacy offerings catalogue still works and reads its fee/minimum from engagement settings', async () => {
  const r = (await h.call('GET', '/chadhava/offerings')).body;
  assert.deepEqual(r.offerings.map((o) => o.key), ['flowers', 'prasad', 'vastram']);
  assert.deepEqual([r.serviceFee, r.minAmount], [5, 1]); // defaults when engagement has no such rows
  deps.settingsData.chadhavaServiceFee = '7';
  assert.equal((await h.call('GET', '/chadhava/offerings')).body.serviceFee, 7);
});

test('the order routes are not catalog\'s: they are 404 here (the monolith serves them until phase 5)', async () => {
  assert.equal((await h.call('POST', '/chadhava/orders', { uid: 'd1', body: { listingSlug: 'pitru' } })).status, 404);
  assert.equal((await h.call('GET', '/admin/chadhava-orders')).status, 404);
});

test('listing price edits are served immediately (orders copy prices at purchase time)', async () => {
  const l = await ChadhavaListing.findOne({ slug: 'pitru' });
  await h.call('PUT', `/admin/chadhava-listings/${l._id}`, { body: { offerings: l.offerings.map((o) => ({ ...o.toObject(), coins: o.coins * 10 })) } });
  const d = (await h.call('GET', '/chadhava/listings/pitru')).body.listing;
  assert.deepEqual(d.offerings.map((o) => o.coins), [210, 110]);
});
