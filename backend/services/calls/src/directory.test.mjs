// The identity service's read-only by-uid view of a person's calls (Users 360, docs/USERS.md section 2).
// Run: TEST_MONGODB_URI=mongodb://127.0.0.1:27261/x node --test --test-concurrency=1 src/directory.test.mjs
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { after, before, describe, test } from 'node:test';

import { CallSession } from './modules/calls/index.js';
import { boot } from './test-kit.mjs';

let t;
before(async () => {
  t = await boot('calls_directory_tests');
  const astro = new mongoose.Types.ObjectId();
  for (let i = 0; i < 12; i += 1) {
    await CallSession.create({
      devoteeUid: 'uid-a', devoteeName: 'Asha Rao', astrologerId: astro, astrologerUid: 'uid-astro', astrologerName: 'Pandit Ji', status: 'ended', endReason: 'completed',
      ratePerMinSnapshot: 10, shareSnapshot: 30, requestedAt: new Date(Date.UTC(2026, 9, 1 + i)), minutesBilled: 3, coinsCharged: 30, rtcChannel: `c${i}`,
    });
  }
});
after(() => t.stop());

describe('GET /directory/users/:uid/calls', () => {
  test('the caller sees their ten newest calls with the astrologer\'s public name; the astrologer sees theirs without the caller\'s name', async () => {
    const a = await t.call('GET', '/directory/users/uid-a/calls', { iss: 'identity' });
    assert.equal(a.status, 200);
    assert.equal(a.body.total, 12);
    assert.equal(a.body.recent.length, 10);
    assert.deepEqual([a.body.recent[0].as, a.body.recent[0].with, a.body.recent[0].status, a.body.recent[0].minutesBilled], ['devotee', 'Pandit Ji', 'ended', 3]);
    const p = await t.call('GET', '/directory/users/uid-astro/calls', { iss: 'identity' });
    assert.equal(p.body.total, 12);
    assert.deepEqual([p.body.recent[0].as, p.body.recent[0].with], ['astrologer', null]);
    assert.equal(JSON.stringify(p.body).includes('Asha'), false);
    assert.deepEqual((await t.call('GET', '/directory/users/nobody/calls', { iss: 'identity' })).body, { total: 0, recent: [] });
  });

  test('only identity may ask; identity may ask for nothing else', async () => {
    for (const iss of ['mobile-bff', 'admin-bff']) assert.equal((await t.call('GET', '/directory/users/uid-a/calls', { iss })).status, 403, iss);
    assert.equal((await t.call('GET', '/directory/users/uid-a/calls', { tok: null })).status, 401);
    assert.equal((await t.call('GET', '/admin/calls', { iss: 'identity' })).status, 403);
    assert.equal((await t.call('GET', '/astrologers', { iss: 'identity' })).status, 403);
  });
});
