import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assignKeys, blankOffering, flattenOfferings, listingStatus, validateOffering } from './chadhava.js';

test('offering keys: from titles, unique, stored kept', () => {
  const o = (over) => ({ ...blankOffering(), ...over });
  const keys = assignKeys([o({ title: 'Ghee lamps' }), o({ title: 'Ghee lamps' }), o({ _stored: true, key: 'ghee-lamps-3', title: 'x' })]).map((x) => x.key);
  assert.deepEqual(keys, ['ghee-lamps', 'ghee-lamps-2', 'ghee-lamps-3']);
});

test('offering needs a name and whole coins >= 1', () => {
  assert.deepEqual(validateOffering({ title: 'A', coins: 101 }), {});
  assert.ok(validateOffering({ title: '', coins: 1 }).title);
  for (const coins of ['', 0, 1.5]) assert.ok(validateOffering({ title: 'A', coins }).coins);
});

test('flatten carries the parent; status follows the window', () => {
  const rows = flattenOfferings([{ _id: 'l1', title: 'L', slug: 'l', category: 'c', offerings: [{ key: 'b', order: 2 }, { key: 'a', order: 1 }] }]);
  assert.deepEqual(rows.map((r) => r.key), ['a', 'b']);
  assert.equal(rows[0].listingId, 'l1');
  const now = Date.parse('2026-10-08T00:00:00Z');
  assert.equal(listingStatus({ enabled: false }, now), 'hidden');
  assert.equal(listingStatus({ enabled: true, startsAt: '2026-11-01T00:00:00Z' }, now), 'scheduled');
  assert.equal(listingStatus({ enabled: true, endsAt: '2026-10-01T00:00:00Z' }, now), 'ended');
  assert.equal(listingStatus({ enabled: true }, now), 'live');
});
