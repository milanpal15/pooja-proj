/** node --test src/features/temples-map/lib/format.test.mjs */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadTs } from './load-ts.mjs';

const f = loadTs('format');

test('formatPlaceDistance: metres under 1 km, one decimal under 10 km, whole km above', () => {
  assert.equal(f.formatPlaceDistance(0), '10 m');
  assert.equal(f.formatPlaceDistance(347), '350 m');
  assert.equal(f.formatPlaceDistance(996), '1.0 km');
  assert.equal(f.formatPlaceDistance(1234), '1.2 km');
  assert.equal(f.formatPlaceDistance(9949), '9.9 km');
  assert.equal(f.formatPlaceDistance(14_600), '15 km');
});

test('formatPlaceDistance: Hindi units, and junk in gives nothing', () => {
  assert.equal(f.formatPlaceDistance(350, 'hi'), '350 मी');
  assert.equal(f.formatPlaceDistance(2500, 'hi'), '2.5 कि.मी.');
  assert.equal(f.formatPlaceDistance(NaN), '');
  assert.equal(f.formatPlaceDistance(-5), '');
});

test('placeName prefers the Hindi name only in Hindi and only when present', () => {
  const p = { name: 'Shri Ram Mandir', nameHi: 'श्री राम मंदिर' };
  assert.equal(f.placeName(p, 'hi'), 'श्री राम मंदिर');
  assert.equal(f.placeName(p, 'en'), 'Shri Ram Mandir');
  assert.equal(f.placeName(p, null), 'Shri Ram Mandir');
  assert.equal(f.placeName({ name: 'Ram', nameHi: null }, 'hi'), 'Ram');
  assert.equal(f.placeName({ name: 'Ram', nameHi: '  ' }, 'hi'), 'Ram');
  assert.equal(f.placeName({ name: 'Ram' }, 'hi'), 'Ram');
});
