/**
 *   node --test src/features/alarm/lib/reminder-state.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const here = path.dirname(fileURLToPath(import.meta.url));

const src = ts.transpileModule(fs.readFileSync(path.join(here, 'reminder-state.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
new Function('exports', 'require', 'module', src)(mod.exports, () => ({}), mod);
const { withToggled, withTime, withTone, withAdded, withRemoved, withDefaultsRestored } = mod.exports;

const base = () => ({ enabled: { mangala: true }, times: { mangala: '4:00' }, custom: [], removed: [], tone: 'bell' });

test('toggle and time are immutable and pad minutes', () => {
  const s = base();
  const t = withTime(withToggled(s, 'sandhya', true), 'sandhya', 18, 5);
  assert.equal(t.enabled.sandhya, true);
  assert.equal(t.times.sandhya, '18:05');
  assert.equal(s.enabled.sandhya, undefined);
  assert.equal(withTone(s, 'conch').tone, 'conch');
});

test('adding a custom reminder starts it ON', () => {
  const s = withAdded(base(), 'custom-x', 'Tulsi', 7, 30);
  assert.deepEqual(s.custom, [{ id: 'custom-x', title: 'Tulsi', hour: 7, minute: 30 }]);
  assert.equal(s.enabled['custom-x'], true);
});

test('removing a bundled reminder tombstones it and clears its flag and time', () => {
  const s = withRemoved(base(), 'mangala');
  assert.deepEqual(s.removed, ['mangala']);
  assert.equal('mangala' in s.enabled, false);
  assert.equal('mangala' in s.times, false);
  // Idempotent: no duplicate tombstone.
  assert.deepEqual(withRemoved(s, 'mangala').removed, ['mangala']);
});

test('removing a custom reminder drops it outright, with no tombstone', () => {
  const s = withRemoved(withAdded(base(), 'custom-x', 'Tulsi', 7, 30), 'custom-x');
  assert.deepEqual(s.custom, []);
  assert.deepEqual(s.removed, []);
  assert.equal('custom-x' in s.enabled, false);
});

test('restoring defaults clears every tombstone and nothing else', () => {
  const s = withDefaultsRestored(withRemoved(base(), 'mangala'));
  assert.deepEqual(s.removed, []);
  assert.equal(s.tone, 'bell');
});
