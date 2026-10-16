import assert from 'node:assert/strict';
import { test } from 'node:test';

import { passwordStrength } from './password.js';

test('empty is level 0 and not ok', () => {
  assert.deepEqual(passwordStrength(''), { level: 0, label: '', ok: false });
});
test('under 8 characters is too short and says how many more', () => {
  const r = passwordStrength('abc');
  assert.equal(r.level, 1);
  assert.equal(r.ok, false);
  assert.match(r.label, /5 more characters/);
  assert.match(passwordStrength('abcdefg').label, /1 more character needed/);
});
test('8 lowercase letters is weak but accepted', () => {
  const r = passwordStrength('abcdefgh');
  assert.equal(r.level, 2);
  assert.equal(r.ok, true);
});
test('mixed and long is strong', () => {
  assert.equal(passwordStrength('Correct-Horse-9-Battery').level, 4);
  assert.equal(passwordStrength('Abcdefg1').level, 3);
});
