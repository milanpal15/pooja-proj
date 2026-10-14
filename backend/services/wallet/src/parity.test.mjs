// The wallet service carries copies of three pieces of the monolith. When the monolith checkout is next to backend/ (a normal clone),
// fail on any drift: coin-pack.js (also copied into the dashboard), the pseudonym algorithm, and the payment-signature maths.
// Run: node --test --test-concurrency=1 src/parity.test.mjs   (no database needed)
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { describePack, packProblem } from './lib/coin-pack.js';
import { createRedactor } from './lib/redact.js';
import { signForTest } from './modules/coins/providers.js';

const mono = (f) => new URL(`../../../../pooja-api/src/${f}`, import.meta.url);
const have = existsSync(fileURLToPath(mono('lib/coin-pack.js')));
const skip = !have && 'pooja-api not checked out next to backend/';

test('coin-pack.js is the monolith\'s file byte for byte (and so, by the dashboard\'s own parity test, the dashboard\'s)', { skip }, async () => {
  assert.equal(readFileSync(fileURLToPath(new URL('./lib/coin-pack.js', import.meta.url)), 'utf8'), readFileSync(fileURLToPath(mono('lib/coin-pack.js')), 'utf8'));
  const api = await import(mono('lib/coin-pack.js'));
  for (const c of [{ coins: 30, price: 20 }, { coins: 250, price: 250 }, { coins: 10, price: 20 }, { coins: 'x', price: 20 }, { coins: 65, price: 10, coinsPerRupee: 5 }]) {
    assert.deepEqual(describePack(c), api.describePack(c));
    assert.equal(packProblem(c), api.packProblem(c));
  }
});

test('the devotee pseudonym is the monolith\'s for the same secret (one devotee, one label across the call log and the wallet)', { skip }, async () => {
  process.env.ADMIN_SESSION_SECRET = 'parity-secret-parity-secret-12';
  const api = await import(mono('access/redact.js'));
  const mine = createRedactor('parity-secret-parity-secret-12');
  for (const uid of ['a1', 'uid-with-dashes', 'ÜNICODE', '', undefined, 'x'.repeat(200)]) assert.equal(mine.pseudonym(uid), api.pseudonym(uid), String(uid));
  const rows = [{ uid: 'a1', who: 'Asha', note: 'refund for Priya', createdBy: 'ops', type: 'adjustment' }, { uid: 'b1', who: 'B', note: 'Bought 30 coins' }];
  const req = { can: () => false };
  assert.deepEqual(mine.redactWho(rows, req), api.redactWho(rows, req));
  assert.deepEqual(mine.redactWho(rows, { can: () => true }), api.redactWho(rows, { can: () => true }));
  assert.deepEqual(mine.redactWho(rows, {}), api.redactWho(rows, {}), 'no req.can = fail closed in both');
});

test('the checkout and webhook signatures are the documented HMAC-SHA256 hex digests', () => {
  const hmac = (secret, data) => createHmac('sha256', secret).update(data).digest('hex');
  assert.equal(signForTest.checkout('sekret', 'order_1', 'pay_1'), hmac('sekret', 'order_1|pay_1'));
  assert.equal(signForTest.webhook('whsec', '{"a":1}'), hmac('whsec', '{"a":1}'));
  assert.equal(signForTest.webhook('whsec', Buffer.from('{"a":1}')), hmac('whsec', '{"a":1}'), 'a Buffer and its string sign the same bytes');
  assert.equal(signForTest.webhook('whsec', '{"a": 1}') === hmac('whsec', '{"a":1}'), false, 'one space changes the signature - hence the raw bytes');
});
