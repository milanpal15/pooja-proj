import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { Festival, Seva, Setting, Temple } from '../../models.js';
import { Booking } from '../bookings/booking.model.js';
import { boot } from '../test-kit.mjs';
import { Pooja, PoojaReview } from './pooja.model.js';
import * as poojas from './index.js';

let h;
const DAY = 86_400_000;
const day = (plus) => new Date(Date.now() + 5.5 * 3_600_000 + plus * DAY).toISOString().slice(0, 10);
const pk = (key, persons, coins, extra = {}) => ({ key, name: key, persons, coins, ...extra });
const mk = (slug, extra = {}) => ({ slug, title: `Pooja ${slug}`, templeSlug: 'kashi', place: 'Varanasi', packages: [pk('individual', 1, 551)], ...extra });

before(async () => {
  h = await boot(poojas, 'poojas_tests');
  await Temple.create({ slug: 'kashi', name: 'Kashi Vishwanath', location: 'Varanasi', about: 'Ancient', imageUrl: '/uploads/k.jpg' });
  await Temple.create({ slug: 'ujjain', name: 'Mahakal', location: 'Ujjain' });
  await Festival.create({ slug: 'navratri', name: 'Navratri', nameHi: 'नवरात्रि', date: day(9) });
});
after(() => h.stop());

test('admin create validates: slug, package keys/persons/coins, dates', async () => {
  const post = (b) => h.call('POST', '/admin/poojas', { body: b });
  assert.equal((await post(mk('ok-1', { poojaDate: day(5), packages: [pk('individual', 1, 551), pk('partner', 2, 851), pk('family', 4, 1251), pk('extended', 6, 1651)] }))).status, 201);
  assert.equal((await post(mk('ok-1'))).status, 409);
  assert.equal((await post(mk('Bad Slug'))).body.code, 'bad_pooja');
  assert.equal((await post(mk('v1', { packages: [pk('a', 0, 5)] }))).status, 400);
  assert.equal((await post(mk('v2', { packages: [pk('a', 13, 5)] }))).status, 400);
  assert.equal((await post(mk('v3', { packages: [pk('a', 1.5, 5)] }))).status, 400);
  assert.equal((await post(mk('v4', { packages: [pk('a', 1, 0)] }))).status, 400);
  assert.equal((await post(mk('v5', { packages: [pk('a', 1, 5), pk('a', 2, 9)] }))).status, 400);
  assert.equal((await post(mk('v6', { poojaDate: '2026-13-40' }))).status, 400);
  assert.equal((await post({ ...mk('v7'), title: '' })).status, 400);
  assert.equal((await post(mk('v8', { bookingClosesAt: 'soon' }))).status, 400);
});

test('admin list: computed status and bookingCount', async () => {
  const mkp = async (slug, extra) => (await h.call('POST', '/admin/poojas', { body: mk(slug, extra) })).body;
  await mkp('st-live', { poojaDate: day(20) });
  await mkp('st-closing', { poojaDate: day(5), bookingClosesAt: new Date(Date.now() + 3_600_000).toISOString() });
  await mkp('st-ended', { poojaDate: day(-2) });
  await mkp('st-sched', { publishAt: new Date(Date.now() + DAY).toISOString() });
  await mkp('st-draft', { packages: [pk('a', 1, 5, { enabled: false })] });
  await mkp('st-off', { enabled: false });
  await Booking.create({ uid: 'u', bookingRef: 'BKT-AAAAA', poojaSlug: 'st-live', status: 'booked' });
  await Booking.create({ uid: 'u', bookingRef: 'BKT-AAAAB', poojaSlug: 'st-live', status: 'cancelled' });
  const rows = Object.fromEntries((await h.call('GET', '/admin/poojas')).body.map((r) => [r.slug, r]));
  assert.deepEqual(['st-live', 'st-closing', 'st-ended', 'st-sched', 'st-draft', 'st-off'].map((s) => rows[s].status), ['live', 'closing', 'ended', 'scheduled', 'draft', 'draft']);
  assert.equal(rows['st-live'].bookingCount, 1);
  const one = await h.call('GET', `/admin/poojas/${rows['st-live']._id}`);
  assert.equal(one.body.bookingCount, 1);
  const upd = await h.call('PUT', `/admin/poojas/${rows['st-live']._id}`, { body: { title: 'Renamed' } });
  assert.equal(upd.body.title, 'Renamed');
  assert.equal(upd.body.packages.length, 1); // partial PUT keeps the rest
  assert.equal((await h.call('PUT', `/admin/poojas/${rows['st-live']._id}`, { body: { packages: [pk('x', 99, 1)] } })).status, 400);
  assert.equal((await h.call('GET', '/admin/poojas/000000000000000000000000')).status, 404);
});

test('public list: hidden when disabled, no enabled package, closed, unpublished or past; sorted by date; card fields', async () => {
  const { body } = await h.call('GET', '/poojas');
  const slugs = body.poojas.map((p) => p.slug);
  assert.deepEqual(slugs, ['ok-1', 'st-closing', 'st-live']); // dated asc; hidden ones absent
  const card = body.poojas[0];
  assert.deepEqual([card.fromCoins, card.toCoins, card.packageCount, card.status, card.templeName], [551, 1651, 4, 'open', 'Kashi Vishwanath']);
  assert.equal(body.poojas[1].status, 'closing');
  // Closing the booking window hides it.
  await Pooja.updateOne({ slug: 'st-live' }, { $set: { bookingClosesAt: new Date(Date.now() - 1000) } });
  assert.ok(!(await h.call('GET', '/poojas')).body.poojas.some((p) => p.slug === 'st-live'));
  await Pooja.updateOne({ slug: 'st-live' }, { $set: { bookingClosesAt: null } });
});

test('the list banner falls back to the first gallery picture', async () => {
  await Pooja.updateOne({ slug: 'ok-1' }, { $set: { banner: '', gallery: ['/uploads/g1.jpg', '/uploads/g2.jpg'] } });
  const card = (await h.call('GET', '/poojas')).body.poojas.find((p) => p.slug === 'ok-1');
  assert.equal(card.banner, '/uploads/g1.jpg');
  await Pooja.updateOne({ slug: 'ok-1' }, { $set: { banner: '/uploads/own.jpg' } });
  assert.equal((await h.call('GET', '/poojas')).body.poojas.find((p) => p.slug === 'ok-1').banner, '/uploads/own.jpg');
  await Pooja.updateOne({ slug: 'ok-1' }, { $set: { banner: '', gallery: [] } });
});

test('public list filters and the filter options', async () => {
  await Pooja.updateOne({ slug: 'ok-1' }, { $set: { festivalSlug: 'navratri', tithi: 'Ashtami' } });
  await Pooja.updateOne({ slug: 'st-live' }, { $set: { templeSlug: 'ujjain', place: 'Ujjain', tithi: 'Pradosh', title: 'Rudrabhishek' } });
  const get = async (qs) => (await h.call('GET', `/poojas?${qs}`)).body;
  // A pooja tied to no temple is offered everywhere, as a blank-temple seva always was.
  await Pooja.updateOne({ slug: 'st-closing' }, { $set: { templeSlug: '' } });
  assert.deepEqual((await get('temple=ujjain')).poojas.map((p) => p.slug), ['st-closing', 'st-live']);
  assert.deepEqual((await get('festival=navratri')).poojas.map((p) => p.slug), ['ok-1']);
  assert.deepEqual((await get('tithi=ashtami')).poojas.map((p) => p.slug), ['ok-1']);
  assert.deepEqual((await get('place=ujj')).poojas.map((p) => p.slug), ['st-live']);
  assert.deepEqual((await get('q=rudra')).poojas.map((p) => p.slug), ['st-live']);
  assert.equal((await get('q=zzz')).poojas.length, 0);
  const f = (await get('temple=ujjain')).filters; // options do not shrink with the selection
  assert.deepEqual(f.temples.map((t) => t.slug).sort(), ['kashi', 'ujjain']);
  assert.deepEqual(f.festivals, [{ slug: 'navratri', name: 'Navratri', nameHi: 'नवरात्रि' }]);
  assert.ok(f.tithis.includes('Ashtami') && f.places.includes('Varanasi'));
});

test('public detail: enabled packages only, temple block, rating null until a visible review', async () => {
  await Pooja.updateOne({ slug: 'ok-1' }, { $set: { 'packages.1.enabled': false, prasadAvailable: true, prasadFeeCoins: 99, cancelHours: 12 } });
  const d = (await h.call('GET', '/poojas/ok-1')).body.pooja;
  assert.deepEqual(d.packages.map((p) => p.key), ['individual', 'family', 'extended']);
  assert.deepEqual([d.temple.name, d.temple.about, d.temple.image, d.prasadFeeCoins, d.cancelHours, d.rating], ['Kashi Vishwanath', 'Ancient', '/uploads/k.jpg', 99, 12, null]);
  assert.equal((await h.call('GET', '/poojas/st-off')).status, 404);
  assert.equal((await h.call('GET', '/poojas/nope')).status, 404);
  await PoojaReview.create({ bookingId: 'b1', uid: 'u1', poojaSlug: 'ok-1', rating: 5, text: 'Lovely', name: 'Asha', packageName: 'individual' });
  await PoojaReview.create({ bookingId: 'b2', uid: 'u2', poojaSlug: 'ok-1', rating: 4, text: 'Good', name: 'Ravi' });
  await PoojaReview.create({ bookingId: 'b3', uid: 'u3', poojaSlug: 'ok-1', rating: 1, text: 'Hidden', name: 'Hid', hidden: true });
  assert.deepEqual((await h.call('GET', '/poojas/ok-1')).body.pooja.rating, { avg: 4.5, count: 2 });
  const r = (await h.call('GET', '/poojas/ok-1/reviews?limit=1')).body.reviews;
  assert.equal(r.length, 1);
  assert.deepEqual(Object.keys(r[0]).sort(), ['createdAt', 'id', 'name', 'packageName', 'rating', 'text']);
  const all = (await h.call('GET', '/poojas/ok-1/reviews')).body.reviews;
  assert.deepEqual(all.map((x) => x.name), ['Ravi', 'Asha']);
  assert.equal((await h.call('GET', `/poojas/ok-1/reviews?before=${encodeURIComponent(new Date(Date.now() - DAY).toISOString())}`)).body.reviews.length, 0);
});

test('import-sevas is idempotent and migrates one package per seva', async () => {
  await Seva.create({ slug: 'archana', name: 'Archana', nameHi: 'अर्चना', price: 251, templeSlug: 'kashi', description: 'd' });
  await Seva.create({ slug: 'free', name: 'Free', price: 0 });
  await Setting.create({ key: 'prasadDelivery', value: '99' });
  const a = await h.call('POST', '/admin/poojas/import-sevas');
  assert.deepEqual(a.body, { created: 1, skipped: 1 });
  const p = await Pooja.findOne({ slug: 'archana' }).lean();
  assert.deepEqual([p.packages.length, p.packages[0].persons, p.packages[0].coins, p.poojaDate, p.place, p.prasadFeeCoins], [1, 1, 251, null, 'Varanasi', 99]);
  assert.deepEqual((await h.call('POST', '/admin/poojas/import-sevas')).body, { created: 0, skipped: 2 });
  assert.ok((await h.call('GET', '/poojas')).body.poojas.some((x) => x.slug === 'archana'));
});

test('seed: sevas become poojas; samples only on an empty, seva-less database; never overwrites', async () => {
  await Pooja.deleteMany({});
  await Seva.deleteMany({});
  await poojas.seed();
  const rows = await Pooja.find().sort({ order: 1 }).lean();
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.slug.startsWith('sample-') && r.title.startsWith('[SAMPLE]')));
  assert.deepEqual(rows[0].packages.map((k) => [k.key, k.persons, k.coins]), [['individual', 1, 551], ['partner', 2, 851], ['family', 4, 1251], ['extended', 6, 1651]]);
  await poojas.seed();
  assert.equal(await Pooja.countDocuments(), 3);
  // With sevas present they are imported and no samples appear.
  await Pooja.deleteMany({});
  await Seva.create({ slug: 'abhishek', name: 'Abhishek', price: 351 });
  await poojas.seed();
  assert.deepEqual((await Pooja.find().lean()).map((r) => r.slug), ['abhishek']);
});
