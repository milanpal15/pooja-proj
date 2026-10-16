// The identity service's read-only by-uid view of a devotee's wallet (Users 360, docs/USERS.md section 2).
// Run: TEST_MONGODB_URI=mongodb://127.0.0.1:27231/x node --test --test-concurrency=1 src/directory.test.mjs
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { boot } from './test-kit.mjs';

let t;
before(async () => {
  t = await boot('wallet_directory_tests');
  for (let i = 0; i < 12; i += 1) await t.ledger('POST', '/credit', { uid: 'uid-a', amount: i + 1, type: 'bonus', key: `bonus-${i}`, note: 'goodwill for Asha', createdBy: 'op' });
  await t.ledger('POST', '/credit', { uid: 'uid-b', amount: 5, type: 'bonus', key: 'bonus-b' });
});
after(() => t.stop());

describe('GET /directory/users/:uid', () => {
  test('identity gets the balance and the ten newest movements; no free-text note, no operator name, no id of anyone else', async () => {
    const r = await t.call('GET', '/directory/users/uid-a', { iss: 'identity' });
    assert.equal(r.status, 200);
    assert.equal(r.body.balance, 78);
    assert.equal(r.body.recent.length, 10);
    assert.equal(r.body.recent[0].amount, 12, 'newest first');
    assert.deepEqual(Object.keys(r.body.recent[0]).sort(), ['amount', 'at', 'balanceAfter', 'createdAt', 'id', 'refType', 'type']);
    assert.equal(JSON.stringify(r.body).includes('Asha'), false);
  });

  test('an account with no wallet reads as zero, not an error', async () => {
    assert.deepEqual((await t.call('GET', '/directory/users/nobody', { iss: 'identity' })).body, { balance: 0, recent: [] });
  });

  test('only identity: every other caller (the BFFs, the ledger services, no token) is refused', async () => {
    for (const iss of ['mobile-bff', 'admin-bff', 'monolith', 'orders', 'calls', 'events']) {
      const r = await t.call('GET', '/directory/users/uid-a', { iss });
      assert.equal(r.status, 403, iss);
      assert.equal(r.body.code, 'wrong_issuer');
    }
    assert.equal((await t.call('GET', '/directory/users/uid-a', { tok: null })).status, 401);
  });

  test('identity gets nothing else: no ledger, no admin, no devotee route', async () => {
    for (const [m, p] of [['POST', '/credit'], ['GET', '/balance/uid-a'], ['GET', '/admin/wallets?q=a'], ['GET', '/wallet']]) {
      const r = await t.call(m, p, { iss: 'identity', body: m === 'POST' ? {} : undefined });
      assert.equal(r.status, 403, `${m} ${p}`);
    }
    assert.equal((await t.call('POST', '/directory/users/uid-a', { iss: 'identity', body: {} })).status, 404, 'read-only: the route has no write');
  });
});
