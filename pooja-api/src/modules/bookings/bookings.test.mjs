import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { pseudonym, redactBookings } from '../../access/redact.js';
import { Pooja, PoojaReview, Temple, User } from '../../models.js';
import { Booking } from './booking.model.js';
import { boot } from '../test-kit.mjs';
import * as poojasModule from '../poojas/index.js';
import * as wallet from '../wallet/wallet.service.js';
import * as bookings from './index.js';

let h;
const DAY = 86_400_000;
const day = (plus) => new Date(Date.now() + 5.5 * 3_600_000 + plus * DAY).toISOString().slice(0, 10);
const fund = (uid, n) => wallet.credit({ uid, amount: n, type: 'bonus', idempotencyKey: `fund:${uid}:${n}:${Math.random()}` });
const names = (n) => Array.from({ length: n }, (_, i) => ({ name: `Devotee ${i + 1}`, gotra: i ? '' : 'Kashyap' }));
const book = (uid, over = {}) => h.call('POST', '/bookings', {
  uid, body: { poojaSlug: 'navratri', packageKey: 'family', names: names(4), prasad: false, requestId: `req-${Math.random()}`, ...over },
});
const PK = (key, persons, coins) => ({ key, name: key[0].toUpperCase() + key.slice(1), persons, coins, order: persons });

before(async () => {
  h = await boot(bookings, 'bookings_tests', { mount: (app) => { /* nothing else needed */ void app; } });
  await Temple.create({ slug: 'kashi', name: 'Kashi Vishwanath', location: 'Varanasi' });
  await Pooja.create({
    slug: 'navratri', title: 'Navratri Durga Pooja', titleHi: 'नवरात्रि', templeSlug: 'kashi', place: 'Varanasi', poojaDate: day(10),
    prasadAvailable: true, prasadFeeCoins: 99, cancelHours: 24,
    packages: [PK('individual', 1, 551), PK('partner', 2, 851), PK('family', 4, 1251), PK('extended', 6, 1651)],
  });
  void poojasModule;
});
after(() => h.stop());

test('happy path: 4 persons, priced from the database, wallet debited once', async () => {
  await fund('b1', 2000);
  const r = await book('b1', { prasad: true, address: { line1: '1 Ghat Rd', city: 'Varanasi', pincode: '221001' }, totalCoins: 1, price: 1, packageCoins: 1 });
  assert.equal(r.status, 201);
  const b = r.body.booking;
  assert.deepEqual([b.packageCoins, b.prasadCoins, b.totalCoins, b.persons, b.status, b.kind], [1251, 99, 1350, 4, 'booked', 'pooja']);
  assert.match(b.bookingRef, /^BKT-[A-Z0-9]{5}$/);
  assert.deepEqual([b.canCancel, b.canReview, b.refunded, b.review], [true, false, false, null]);
  assert.equal(b.names.length, 4);
  assert.deepEqual(b.statusHistory.map((x) => x.status), ['booked']);
  assert.equal(b.cancelBy, new Date(new Date(`${day(10)}T00:00:00+05:30`).getTime() - 24 * 3_600_000).toISOString());
  assert.equal(r.body.balance, 650);
  assert.equal((await wallet.verifyWallet('b1')).ok, true);
  const list = await h.call('GET', '/bookings', { uid: 'b1' });
  assert.equal(list.body.bookings.length, 1);
  assert.equal((await h.call('GET', `/bookings/${b.id}`, { uid: 'b1' })).body.booking.bookingRef, b.bookingRef);
  assert.equal((await h.call('GET', `/bookings/${b.id}`, { uid: 'someone' })).status, 404);
  assert.equal((await h.call('GET', '/bookings')).status, 401);
});

test('validation: names count, name/gotra length, package, pooja, prasad address, request id', async () => {
  await fund('v1', 5000);
  for (const bad of [names(3), names(5), [], undefined, 'x']) assert.equal((await book('v1', { names: bad })).body.code, 'invalid_names');
  assert.equal((await book('v1', { names: names(1), packageKey: 'individual' })).status, 201);
  assert.equal((await book('v1', { names: [{ name: 'A', gotra: '' }], packageKey: 'individual' })).body.code, 'invalid_names');
  assert.equal((await book('v1', { names: [{ name: 'Asha', gotra: 'x'.repeat(41) }], packageKey: 'individual' })).body.code, 'invalid_names');
  assert.equal((await book('v1', { packageKey: 'nope' })).status, 404);
  assert.equal((await book('v1', { poojaSlug: 'nope' })).status, 404);
  assert.equal((await book('v1', { prasad: true })).body.code, 'invalid_address');
  assert.equal((await book('v1', { prasad: true, address: { line1: 'a', city: 'b', pincode: '12' } })).body.code, 'invalid_address');
  assert.equal((await book('v1', { requestId: 'x' })).body.code, 'bad_request_id');
  assert.equal(await wallet.getBalance('v1'), 5000 - 551); // only the one good booking
});

test('insufficient coins: 402 with shortfall, balance and needed; nothing stored', async () => {
  await fund('i1', 1000);
  const r = await book('i1');
  assert.equal(r.status, 402);
  assert.deepEqual([r.body.code, r.body.needed, r.body.balance, r.body.shortfall], ['insufficient_coins', 1251, 1000, 251]);
  assert.equal(await Booking.countDocuments({ uid: 'i1' }), 0);
  assert.equal(await wallet.getBalance('i1'), 1000);
});

test('a retried requestId returns the same booking (200) and debits once, even in parallel', async () => {
  await fund('r1', 5000);
  const a = await book('r1', { requestId: 'same-request-1' });
  const b = await book('r1', { requestId: 'same-request-1' });
  assert.deepEqual([a.status, b.status, a.body.booking.id === b.body.booking.id], [201, 200, true]);
  assert.equal(await wallet.getBalance('r1'), 5000 - 1251);
  const rs = await Promise.all([1, 2, 3].map(() => book('r1', { requestId: 'race-request-1' })));
  assert.ok(rs.every((x) => x.status === 200 || x.status === 201));
  assert.equal(new Set(rs.map((x) => x.body.booking.id)).size, 1);
  assert.equal(await wallet.getBalance('r1'), 5000 - 2 * 1251);
  assert.equal(await Booking.countDocuments({ uid: 'r1' }), 2);
  assert.equal((await wallet.verifyWallet('r1')).ok, true);
});

test('closed windows: past bookingClosesAt, past date, disabled package, disabled pooja', async () => {
  await fund('c9', 3000);
  await Pooja.create({ slug: 'closed-one', title: 'Closed', bookingClosesAt: new Date(Date.now() - 1000), packages: [PK('individual', 1, 100)] });
  await Pooja.create({ slug: 'past-one', title: 'Past', poojaDate: day(-1), packages: [PK('individual', 1, 100)] });
  await Pooja.create({ slug: 'off-one', title: 'Off', enabled: false, packages: [PK('individual', 1, 100)] });
  await Pooja.create({ slug: 'pk-off', title: 'PkOff', packages: [{ ...PK('individual', 1, 100), enabled: false }] });
  for (const slug of ['closed-one', 'past-one']) assert.equal((await book('c9', { poojaSlug: slug, packageKey: 'individual', names: names(1) })).body.code, 'booking_closed');
  assert.equal((await book('c9', { poojaSlug: 'off-one', packageKey: 'individual', names: names(1) })).status, 404);
  assert.equal((await book('c9', { poojaSlug: 'pk-off', packageKey: 'individual', names: names(1) })).status, 404);
  assert.equal(await wallet.getBalance('c9'), 3000);
});

test('cancel before the cut-off refunds once, idempotently; not yours is 404', async () => {
  await fund('x1', 2000);
  const b = (await book('x1')).body.booking;
  assert.equal(await wallet.getBalance('x1'), 749);
  const c1 = await h.call('POST', `/bookings/${b.id}/cancel`, { uid: 'x1' });
  const c2 = await h.call('POST', `/bookings/${b.id}/cancel`, { uid: 'x1' });
  assert.deepEqual([c1.status, c1.body.booking.status, c1.body.booking.refunded, c1.body.balance], [200, 'cancelled', true, 2000]);
  assert.equal(c2.body.balance, 2000);
  assert.equal(await wallet.getBalance('x1'), 2000);
  assert.equal((await wallet.verifyWallet('x1')).ok, true);
  assert.deepEqual((await h.call('GET', '/bookings', { uid: 'x1' })).body.bookings[0].statusHistory.map((s) => s.status), ['booked', 'cancelled']);
  assert.equal((await h.call('POST', `/bookings/${b.id}/cancel`, { uid: 'someone' })).status, 404);
});

test('cancel after cancelBy, or once the booking has moved on, is 409 cannot_cancel with no refund', async () => {
  await fund('x2', 3000);
  const b = (await book('x2')).body.booking;
  await Booking.updateOne({ _id: b.id }, { $set: { cancelBy: new Date(Date.now() - 1000) } });
  const late = await h.call('POST', `/bookings/${b.id}/cancel`, { uid: 'x2' });
  assert.deepEqual([late.status, late.body.code], [409, 'cannot_cancel']);
  assert.equal((await h.call('GET', `/bookings/${b.id}`, { uid: 'x2' })).body.booking.canCancel, false);
  const b2 = (await book('x2')).body.booking;
  await h.call('PUT', `/admin/bookings/${b2.id}/status`, { body: { status: 'sankalp' } });
  assert.equal((await h.call('POST', `/bookings/${b2.id}/cancel`, { uid: 'x2' })).status, 409);
  assert.equal(await wallet.getBalance('x2'), 3000 - 2 * 1251);
});

test('a failed booking write refunds the debit', async () => {
  await fund('f1', 2000);
  const orig = Booking.create;
  Booking.create = async () => { throw new Error('disk on fire'); };
  try {
    assert.equal((await book('f1', { requestId: 'fail-request-1' })).status, 500);
  } finally { Booking.create = orig; }
  assert.equal(await wallet.getBalance('f1'), 2000);
  assert.equal((await wallet.verifyWallet('f1')).ok, true);
});

test('status moves forward only, writes statusHistory, and cancelled is final', async () => {
  await fund('s1', 5000);
  const b = (await book('s1')).body.booking;
  const put = (id, status) => h.call('PUT', `/admin/bookings/${id}/status`, { body: { status } });
  assert.equal((await put(b.id, 'booked')).body.code, 'invalid_status');
  const s = await put(b.id, 'sankalp');
  assert.deepEqual([s.status, s.body.booking.status], [200, 'sankalp']);
  assert.equal((await put(b.id, 'sankalp')).status, 409);
  const p = await put(b.id, 'performed');
  assert.deepEqual(p.body.booking.statusHistory.map((x) => x.status), ['booked', 'sankalp', 'performed']);
  assert.equal((await put(b.id, 'sankalp')).body.code, 'invalid_transition');
  const c = (await book('s1')).body.booking;
  await h.call('POST', `/bookings/${c.id}/cancel`, { uid: 's1' });
  assert.equal((await put(c.id, 'sankalp')).status, 409);
  assert.equal((await put('000000000000000000000000', 'sankalp')).status, 404);
});

test('review: only performed, once, rating 1-5, text <= 500; first name only; admin can hide', async () => {
  await fund('rv', 5000);
  await User.create({ uid: 'rv', contact: '+919999900077', name: 'Meera Sharma' });
  const b = (await book('rv')).body.booking;
  const rev = (id, body, uid = 'rv') => h.call('POST', `/bookings/${id}/review`, { uid, body });
  assert.equal((await rev(b.id, { rating: 5 })).body.code, 'not_reviewable'); // still booked
  await h.call('PUT', `/admin/bookings/${b.id}/status`, { body: { status: 'performed' } });
  assert.equal((await h.call('GET', `/bookings/${b.id}`, { uid: 'rv' })).body.booking.canReview, true);
  for (const bad of [{ rating: 0 }, { rating: 6 }, { rating: 4.5 }, { rating: '5' }, {}, { rating: 5, text: 'x'.repeat(501) }]) {
    assert.equal((await rev(b.id, bad)).body.code, 'invalid_review');
  }
  assert.equal((await rev(b.id, { rating: 5 }, 'other')).status, 404);
  const ok = await rev(b.id, { rating: 5, text: 'Wonderful' });
  assert.deepEqual([ok.status, ok.body.booking.review.rating, ok.body.booking.canReview], [201, 5, false]);
  assert.equal((await rev(b.id, { rating: 1 })).body.code, 'not_reviewable'); // once
  const pub = (await PoojaReview.findOne({ bookingId: b.id }).lean());
  assert.equal(pub.name, 'Meera');
  const list = (await h.call('GET', '/admin/reviews')).body.reviews;
  assert.deepEqual([list[0].poojaTitle, list[0].rating, list[0].bookingRef], ['Navratri Durga Pooja', 5, b.bookingRef]);
  assert.equal((await h.call('PUT', `/admin/reviews/${list[0].id}`, { body: { hidden: 'yes' } })).status, 400);
  assert.equal((await h.call('PUT', `/admin/reviews/${list[0].id}`, { body: { hidden: true } })).body.review.hidden, true);
  assert.equal((await h.call('GET', '/admin/reviews?hidden=false')).body.reviews.length, 0);
  assert.equal((await h.call('GET', '/admin/reviews?hidden=true')).body.reviews.length, 1);
});

test('review moderation: edit text, hide + edit, validation, immutable fields', async () => {
  const r0 = await PoojaReview.create({ bookingId: 'bk-mod', bookingRef: 'REF-MOD', uid: 'rv-mod', poojaSlug: 'navratri', poojaTitle: 'Navratri Durga Pooja', name: 'Meera', rating: 4, text: 'Rude  word here' });
  const id = String(r0._id);
  const put = (body) => h.call('PUT', `/admin/reviews/${id}`, { body });
  for (const bad of [{}, { rating: 1 }, { text: 5 }, { text: null }, { text: ['a'] }, { text: 'x'.repeat(501) }, { hidden: 'no' }, { text: 'ok', hidden: 1 }]) {
    const r = await put(bad);
    assert.deepEqual([r.status, r.body.code], [400, 'invalid_review'], JSON.stringify(bad));
  }
  assert.equal((await h.call('PUT', '/admin/reviews/000000000000000000000000', { body: { text: 'x' } })).status, 404);
  assert.equal((await PoojaReview.findById(id).lean()).edited, false);

  // edit only; rating/name/bookingId/uid sent are ignored
  const a = await put({ text: '  Lovely word  ', rating: 1, name: 'Hacker', uid: 'zzz', bookingId: 'other', originalText: 'fake', edited: false });
  assert.equal(a.status, 200);
  assert.deepEqual([a.body.review.text, a.body.review.edited, a.body.review.hidden, a.body.review.rating], ['Lovely word', true, false, 4]);
  assert.ok(a.body.review.editedAt);
  let d = await PoojaReview.findById(id).lean();
  assert.deepEqual([d.rating, d.name, d.uid, d.bookingId, d.originalText], [4, 'Meera', 'rv-mod', 'bk-mod', 'Rude  word here']);

  // second edit keeps the FIRST original; hide + edit together; empty text allowed
  const b = await put({ hidden: true, text: '' });
  assert.deepEqual([b.status, b.body.review.hidden, b.body.review.text], [200, true, '']);
  d = await PoojaReview.findById(id).lean();
  assert.equal(d.originalText, 'Rude  word here');

  // hide-only does not mark edited / touch editedAt
  const at = d.editedAt.getTime();
  await put({ hidden: false });
  assert.equal((await PoojaReview.findById(id).lean()).editedAt.getTime(), at);
  // unchanged text is not an edit
  const fresh = await PoojaReview.create({ bookingId: 'bk-mod2', uid: 'rv-mod2', poojaSlug: 'navratri', name: 'A', rating: 5, text: 'same' });
  const same = await h.call('PUT', `/admin/reviews/${fresh._id}`, { body: { text: ' same ' } });
  assert.deepEqual([same.body.review.edited, same.body.review.editedAt], [false, null]);

  const row = (await h.call('GET', '/admin/reviews')).body.reviews.find((x) => x.id === id);
  assert.deepEqual([row.edited, !!row.editedAt, 'originalText' in row], [true, true, false]);
  await PoojaReview.deleteMany({ bookingId: { $in: ['bk-mod', 'bk-mod2'] } });
});

test('admin list: filters, search, and devotee identity redacted without devotees:view', async () => {
  const all = await h.call('GET', '/admin/bookings');
  assert.equal(all.status, 200);
  assert.ok(all.body.bookings.length >= 5 && 'who' in all.body.bookings[0] && 'address' in all.body.bookings[0]);
  const performed = (await h.call('GET', '/admin/bookings?status=performed')).body.bookings;
  assert.ok(performed.length >= 1 && performed.every((x) => x.status === 'performed'));
  assert.ok((await h.call('GET', '/admin/bookings?q=Devotee%201')).body.bookings.length >= 1);
  assert.equal((await h.call('GET', '/admin/bookings?limit=2')).body.bookings.length, 2);
});

test('redaction: without devotees:view names, address, gotra and identity are masked', async () => {
  const row = (await h.call('GET', '/admin/bookings?q=Navratri')).body.bookings.find((b) => b.address);
  assert.ok(row.names[0].name.startsWith('Devotee '));
  const masked = redactBookings([row], { can: () => false })[0];
  assert.equal(masked.who, pseudonym(row.uid));
  assert.equal(masked.address, null);
  assert.ok(masked.names.every((n) => n.name === pseudonym(row.uid) && n.gotra === ''));
  assert.ok(!JSON.stringify(masked).includes('Ghat Rd') && !JSON.stringify(masked).includes('Kashyap'));
});
