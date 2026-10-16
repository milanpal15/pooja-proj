// The identity service's read-only by-uid view of a devotee's bookings (Users 360, docs/USERS.md section 2).
// Run: TEST_MONGODB_URI=mongodb://127.0.0.1:27251/x node --test --test-concurrency=1 src/directory.test.mjs
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { boot } from './test-kit.mjs';
import { Booking } from './modules/bookings/index.js';

let t;
before(async () => {
  t = await boot('orders_directory_tests');
  for (let i = 0; i < 12; i += 1) {
    await Booking.create({
      uid: 'uid-a', bookingRef: `BK-A${i}`, poojaTitle: 'Navratri Durga Pooja', templeName: 'Kashi Vishwanath', packageName: 'Family', status: 'booked', totalCoins: 100 + i,
      names: [{ name: 'Asha Rao', gotra: 'Kashyap' }], address: { line1: '12 Gandhi Rd', city: 'Pune', pincode: '411001' }, createdAt: new Date(Date.UTC(2026, 9, 1 + i)),
    });
  }
  await Booking.create({ uid: 'uid-b', bookingRef: 'BK-B', status: 'performed' });
});
after(() => t.stop());

describe('GET /directory/users/:uid', () => {
  test('identity gets the total and the ten newest bookings, without the names, gotras or address recited on them', async () => {
    const r = await t.call('GET', '/directory/users/uid-a', { iss: 'identity' });
    assert.equal(r.status, 200);
    assert.equal(r.body.total, 12);
    assert.equal(r.body.recent.length, 10);
    assert.equal(r.body.recent[0].bookingRef, 'BK-A11', 'newest first');
    assert.deepEqual(Object.keys(r.body.recent[0]).sort(), ['at', 'bookingRef', 'coins', 'createdAt', 'id', 'packageName', 'poojaDate', 'poojaTitle', 'status', 'templeName', 'title', 'totalCoins']);
    const text = JSON.stringify(r.body);
    for (const secret of ['Asha', 'Kashyap', 'Gandhi', 'Pune']) assert.equal(text.includes(secret), false, secret);
    assert.deepEqual((await t.call('GET', '/directory/users/nobody', { iss: 'identity' })).body, { total: 0, recent: [] });
  });

  test('only identity may ask (the phone BFF, the admin BFF, the catalog and no token are refused)', async () => {
    for (const iss of ['mobile-bff', 'admin-bff', 'catalog']) assert.equal((await t.call('GET', '/directory/users/uid-a', { iss })).status, 403, iss);
    assert.equal((await t.call('GET', '/directory/users/uid-a', { tok: null })).status, 401);
    assert.equal((await t.call('POST', '/directory/users/uid-a', { iss: 'identity', body: {} })).status, 404);
  });
});
