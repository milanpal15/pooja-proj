import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDiff, changedOnly, showValue } from './diff.js';

test('walks nested objects and classifies', () => {
  const d = buildDiff({ min: 5, maint: { enabled: false, until: null }, gone: 1 }, { min: 9, maint: { enabled: true, until: null }, fresh: 'x' });
  const by = Object.fromEntries(d.map((r) => [r.path, r.kind]));
  assert.deepEqual(by, { min: 'changed', 'maint.enabled': 'changed', 'maint.until': 'same', gone: 'removed', fresh: 'added' });
});

test('plain arrays are one field', () => {
  const d = changedOnly(buildDiff({ blocked: [1, 2] }, { blocked: [1, 2, 3] }));
  assert.equal(d.length, 1);
  assert.equal(d[0].path, 'blocked');
  assert.equal(showValue(d[0].after), '1, 2, 3');
  assert.equal(changedOnly(buildDiff({ b: [1] }, { b: [1] })).length, 0);
});

test('arrays of objects are walked by index; null and empty are quiet', () => {
  const d = changedOnly(buildDiff({ items: [{ a: 1 }] }, { items: [{ a: 2 }, { a: 3 }] }));
  assert.deepEqual(d.map((r) => r.path), ['items.0.a', 'items.1.a']);
  assert.equal(changedOnly(buildDiff({}, { x: null, y: '' })).length, 0);
  assert.equal(changedOnly(buildDiff(null, undefined)).length, 0);
});

test('showValue', () => {
  assert.equal(showValue(null), '—');
  assert.equal(showValue([]), 'none');
  assert.equal(showValue(true), 'on');
  assert.equal(showValue(0), '0');
});
