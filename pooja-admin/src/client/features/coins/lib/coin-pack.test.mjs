// Proves the dashboard's copy of coin-pack.js behaves exactly like the API's.
// Run: PATH=/opt/homebrew/bin:$PATH node --test features/coins/lib/coin-pack.test.mjs  (from src/client)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import * as dash from './coin-pack.js';
import * as api from '../../../../../../pooja-api/src/lib/coin-pack.js';

test('the copy differs from the API file only by its header comment', () => {
  const strip = (p) => readFileSync(fileURLToPath(p), 'utf8').replace(/^(\/\/.*\n)+\n/, '');
  assert.equal(strip(new URL('./coin-pack.js', import.meta.url)), strip(new URL('../../../../../../pooja-api/src/lib/coin-pack.js', import.meta.url)));
});

const cases = [
  { coins: 30, price: 20 },
  { coins: 250, price: 250 },
  { coins: 10, price: 20 },
  { coins: 'x', price: 20 },
  { coins: 65, price: 10, coinsPerRupee: 5 },
];
test('describePack and packProblem agree with the API on every case', () => {
  for (const c of cases) {
    assert.deepEqual(dash.describePack(c), api.describePack(c));
    assert.equal(dash.packProblem(c), api.packProblem(c));
  }
});

test('the documented examples', () => {
  const a = dash.describePack({ coins: 30, price: 20 });
  assert.equal(a.baseCoins, 20);
  assert.equal(a.extraCoins, 10);
  assert.equal(a.salePct, 50);
  assert.equal(a.discountPct, 33);
  assert.equal(a.onSale, true);

  const b = dash.describePack({ coins: 250, price: 250 });
  assert.equal(b.extraCoins, 0);
  assert.equal(b.salePct, 0);
  assert.equal(b.onSale, false);

  assert.equal(dash.packProblem({ coins: 10, price: 20 }), 'Coins must be at least 20 for ₹20 (1 coin = ₹1).');
  assert.equal(dash.packProblem({ coins: 30, price: 20 }), null);
});
