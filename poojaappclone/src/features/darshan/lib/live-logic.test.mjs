/**
 *   node --test src/features/darshan/lib/live-logic.test.mjs
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
const src = ts.transpileModule(fs.readFileSync(path.join(here, 'live-logic.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
new Function('exports', 'require', 'module', src)(mod.exports, () => ({}), mod);
const L = mod.exports;

const s = (slug, name, place, cat, state) => ({ slug, templeName: name, place, categorySlug: cat, state });
const all = [
  s('kashi', 'Kashi Vishwanath', 'Varanasi', 'jyotirlinga', 'live'),
  s('somnath', 'Somnath', 'Gujarat', 'jyotirlinga', 'upcoming'),
  s('vaishno', 'Maa Vaishno Devi', 'Katra', 'shakti', 'offline'),
];

test('filter: all, live, category, search', () => {
  assert.equal(L.filterStreams(all, 'all').length, 3);
  assert.deepEqual(L.filterStreams(all, 'live').map((x) => x.slug), ['kashi']);
  assert.deepEqual(L.filterStreams(all, 'jyotirlinga').map((x) => x.slug), ['kashi', 'somnath']);
  assert.deepEqual(L.filterStreams(all, 'all', ' KATRA ').map((x) => x.slug), ['vaishno']);
  assert.deepEqual(L.filterStreams(all, 'shakti', 'kashi'), []);
});

test('times: 12-hour display', () => {
  assert.deepEqual(L.clock12('00:05'), { clock: '12:05', meridiem: 'am' });
  assert.deepEqual(L.clock12('12:00'), { clock: '12:00', meridiem: 'pm' });
  assert.deepEqual(L.clock12('18:45'), { clock: '6:45', meridiem: 'pm' });
  assert.equal(L.time12('04:02'), '4:02 am');
  assert.equal(L.toMinutes('24:00'), null);
  assert.equal(L.toMinutes('nope'), null);
});

test('reminder fires 10 minutes before, wrapping midnight', () => {
  assert.deepEqual(L.reminderClock('12:00'), { hour: 11, minute: 50 });
  assert.deepEqual(L.reminderClock('04:00'), { hour: 3, minute: 50 });
  assert.deepEqual(L.reminderClock('00:05'), { hour: 23, minute: 55 });
  assert.deepEqual(L.reminderClock('10:30', 15), { hour: 10, minute: 15 });
  assert.equal(L.reminderClock('bad'), null);
});

test('reminder map: add, remove, keys are per stream + aarti', () => {
  const k1 = L.aartiKey('kashi', '12:00', 'Bhog');
  const k2 = L.aartiKey('somnath', '12:00', 'Bhog');
  assert.notEqual(k1, k2);
  let m = L.withReminder({}, k1, 'n1');
  m = L.withReminder(m, k2, 'n2');
  assert.deepEqual(L.withoutReminder(m, k1), { [k2]: 'n2' });
  assert.deepEqual(m, { [k1]: 'n1', [k2]: 'n2' }); // not mutated
});

test('parseReminders survives junk', () => {
  assert.deepEqual(L.parseReminders(null), {});
  assert.deepEqual(L.parseReminders('{oops'), {});
  assert.deepEqual(L.parseReminders('[1]'), {});
  assert.deepEqual(L.parseReminders('{"a":"x","b":3,"c":""}'), { a: 'x' });
});

test('tones are stable per slug; counts never invented', () => {
  assert.deepEqual(L.toneFor('kashi'), L.toneFor('kashi'));
  assert.equal(L.compactCount(null), null);
  assert.equal(L.compactCount(undefined), null);
  assert.equal(L.compactCount(-3), null);
  assert.equal(L.compactCount(0), '0');
  assert.equal(L.compactCount(950), '950');
  assert.equal(L.compactCount(1200), '1.2K');
  assert.equal(L.compactCount(15400), '15K');
  assert.equal(L.compactCount(2_500_000), '2.5M');
});
