/**
 * Bhajan shelf logic: tile kinds, deity chips, filtering, today's pick, favourites.
 *
 *   node --test src/features/bhajan/lib/bhajan-lib.test.mjs
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

function load(file, cache = new Map()) {
  const abs = path.resolve(file);
  if (cache.has(abs)) return cache.get(abs).exports;
  const out = ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  cache.set(abs, mod);
  const req = (spec) => {
    if (!spec.startsWith('.')) throw new Error(`unexpected import ${spec} in ${abs}`);
    return load(path.resolve(path.dirname(abs), `${spec}.ts`), cache);
  };
  new Function('exports', 'require', 'module', out)(mod.exports, req, mod);
  return mod.exports;
}
const { trackKind, kindsPresent } = load(path.join(here, 'kind.ts'));
const { filterTracks, deitiesPresent } = load(path.join(here, 'filter.ts'));
const { todaysPick } = load(path.join(here, 'today.ts'));
const { toggleId, parseIds } = load(path.join(here, 'favourites.ts'));

const tr = (id, title, extra = {}) => ({ id, title, artist: '', len: '', category: 'morning', deity: '', ...extra });

test('kind: own category wins, then the title, else bhajan', () => {
  assert.equal(trackKind(tr('1', 'Hanuman Chalisa')), 'chalisa');
  assert.equal(trackKind(tr('2', 'Om Jai Jagdish Hare Aarti')), 'aarti');
  assert.equal(trackKind(tr('3', 'Gayatri Mantra')), 'mantra');
  assert.equal(trackKind(tr('4', 'Vishnu Sahasranama Stotram')), 'paath');
  assert.equal(trackKind(tr('5', 'Shri Ram Chandra')), 'bhajan');
  assert.equal(trackKind(tr('6', 'Anything', { category: 'Mantra' })), 'mantra');
  assert.equal(trackKind(tr('7', 'Hanuman Chalisa', { category: 'evening' })), 'chalisa');
});

test('empty tiles are hidden', () => {
  assert.deepEqual(kindsPresent([tr('1', 'Hanuman Chalisa'), tr('2', 'Gayatri Mantra')]), ['chalisa', 'mantra']);
  assert.deepEqual(kindsPresent([]), []);
});

test('deity chips only for deities that have tracks', () => {
  assert.deepEqual(deitiesPresent([tr('1', 'a', { deity: 'shiva' }), tr('2', 'b'), tr('3', 'c', { deity: 'shiva' }), tr('4', 'd', { deity: 'durga' })]), ['shiva', 'durga']);
});

test('filter: top 20 caps only the unfiltered shelf', () => {
  const many = Array.from({ length: 30 }, (_, i) => tr(String(i), `Bhajan ${i}`, { deity: 'shiva' }));
  const base = { deity: '', kind: '', favouritesOnly: false, favourites: [] };
  assert.equal(filterTracks(many, base).length, 20);
  assert.equal(filterTracks(many, { ...base, deity: 'shiva' }).length, 30);
});

test('filter: deity, kind and favourites combine', () => {
  const ts_ = [tr('1', 'Shiv Aarti', { deity: 'shiva' }), tr('2', 'Shiv Chalisa', { deity: 'shiva' }), tr('3', 'Durga Aarti', { deity: 'durga' })];
  const f = { deity: '', kind: '', favouritesOnly: false, favourites: ['2', '3'] };
  assert.deepEqual(filterTracks(ts_, { ...f, deity: 'shiva', kind: 'aarti' }).map((t) => t.id), ['1']);
  assert.deepEqual(filterTracks(ts_, { ...f, favouritesOnly: true }).map((t) => t.id), ['2', '3']);
  assert.deepEqual(filterTracks(ts_, { ...f, favouritesOnly: true, deity: 'shiva' }).map((t) => t.id), ['2']);
});

test("today's pick: stable within a day, none when empty, prefers playable", () => {
  assert.equal(todaysPick([], new Date(2026, 9, 8)), undefined);
  const list = [tr('a', 'A'), tr('b', 'B', { url: 'x' }), tr('c', 'C', { url: 'y' })];
  const d1 = todaysPick(list, new Date(2026, 9, 8, 6));
  assert.equal(todaysPick(list, new Date(2026, 9, 8, 22)).id, d1.id);
  assert.ok(d1.url, 'a playable track is chosen when one exists');
  assert.notEqual(todaysPick(list, new Date(2026, 9, 9)).id, d1.id);
  assert.equal(todaysPick([tr('a', 'A')], new Date()).id, 'a');
});

test('favourites: toggle and defensive parse', () => {
  assert.deepEqual(toggleId([], 'a'), ['a']);
  assert.deepEqual(toggleId(['a', 'b'], 'a'), ['b']);
  assert.deepEqual(parseIds('["a","b"]'), ['a', 'b']);
  assert.deepEqual(parseIds('{"a":1}'), []);
  assert.deepEqual(parseIds('not json'), []);
  assert.deepEqual(parseIds(null), []);
  assert.deepEqual(parseIds('["a",3,null]'), ['a']);
});
