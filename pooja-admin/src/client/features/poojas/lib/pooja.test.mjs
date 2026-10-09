import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assignKeys, blankPackage, blankPooja, priceRange, toPayload, validatePooja } from './pooja.js';

const pkg = (over) => ({ ...blankPackage(1), name: 'Individual pooja', coins: 551, ...over });
const pooja = (over) => ({ ...blankPooja(), slug: 'navratri', title: 'Navratri', ...over });

test('keys come from names and are unique; stored keys are kept', () => {
  const keys = assignKeys([pkg({}), pkg({}), pkg({ _stored: true, key: 'individual-pooja' }), pkg({ name: '' })]).map((p) => p.key);
  assert.deepEqual(keys, ['individual-pooja-2', 'individual-pooja-3', 'individual-pooja', 'package-4']);
});

test('package validation: persons 1-12, coins integer >= 1', () => {
  const ok = pkg({ persons: 12 });
  assert.deepEqual(validatePooja(pooja({ packages: [ok] })), {});
  for (const bad of [{ persons: 0 }, { persons: 13 }, { persons: 1.5 }, { coins: 0 }, { coins: 10.5 }, { coins: '' }]) {
    const p = pkg(bad);
    const errors = validatePooja(pooja({ packages: [p] }));
    assert.ok(errors.packages[p._cid], JSON.stringify(bad));
  }
});

test('publishing needs a visible package; a draft does not', () => {
  const hidden = pooja({ packages: [pkg({ enabled: false })] });
  assert.deepEqual(validatePooja(hidden), {});
  assert.ok(validatePooja(hidden, { publish: true }).packagesGeneral);
});

test('payload drops client fields, splits perks, numbers the order', () => {
  const body = toPayload(pooja({ packages: [pkg({ perksText: 'One name\n\nGotra read out ' }), pkg({ name: 'Partner', persons: 2, coins: '851' })] }), { enabled: true });
  assert.deepEqual(body.packages[0].perks, ['One name', 'Gotra read out']);
  assert.equal(body.packages[1].coins, 851);
  assert.deepEqual(body.packages.map((p) => p.order), [1, 2]);
  assert.equal('_cid' in body.packages[0], false);
  assert.equal(body.poojaDate, null);
  assert.equal(body.enabled, true);
});

test('price range over visible packages', () => {
  assert.equal(priceRange([{ coins: 551 }, { coins: 1651 }, { coins: 9, enabled: false }]), '551 – 1,651');
  assert.equal(priceRange([{ coins: 5 }]), '5');
  assert.equal(priceRange([]), null);
});
