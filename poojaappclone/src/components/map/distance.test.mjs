/** node --test src/components/map/distance.test.mjs */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadTs } from './load-ts.mjs';

const { formatDistance } = loadTs('distance');

test('metres under a kilometre, to 10 m', () => {
  assert.equal(formatDistance(420), '420 m');
  assert.equal(formatDistance(423), '420 m');
  assert.equal(formatDistance(3), '10 m');
});
test('kilometres: one decimal under 10, whole from 10', () => {
  assert.equal(formatDistance(1200), '1.2 km');
  assert.equal(formatDistance(14_300), '14 km');
});
test('Hindi units; bad input is blank', () => {
  assert.equal(formatDistance(420, 'hi'), '420 मी');
  assert.equal(formatDistance(2500, 'hi'), '2.5 कि.मी.');
  assert.equal(formatDistance(NaN), '');
  assert.equal(formatDistance(-1), '');
});
