/**
 * Search matching, ranking, recents, suggestions and the per-source adapters.
 *
 *   node --test src/features/search/lib/search-lib.test.mjs
 *
 * Transpiles the .ts with the project's TypeScript, like i18n.test.mjs.
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

const { normalize, tokenize } = load(path.join(here, 'normalize.ts'));
const { scoreItem, rank } = load(path.join(here, 'match.ts'));
const { addRecent, removeRecent, parseRecents } = load(path.join(here, 'recents.ts'));
const { buildSuggestions } = load(path.join(here, 'suggest.ts'));
const E = load(path.join(here, 'entries.ts'));

test('normalize: case, accents, punctuation, spaces, null', () => {
  assert.equal(normalize('  Kāshi   VISHWANATH! '), 'kashi vishwanath');
  assert.equal(normalize('Café–Résumé'), 'cafe resume');
  assert.equal(normalize(null), '');
  assert.equal(normalize(undefined), '');
  assert.equal(normalize(42), '');
  assert.equal(normalize('   '), '');
});

test('normalize keeps Devanagari vowel signs and composes the nukta', () => {
  assert.equal(normalize('शिव'), 'शिव');
  assert.notEqual(normalize('शिव'), normalize('शव'));
  assert.equal(normalize('क़'), normalize('क़'));
  assert.equal(normalize('श्री   गणेश'), 'श्री गणेश');
});

test('tokenize: words, dedupe, blank', () => {
  assert.deepEqual(tokenize(' Maha  maha Aarti '), ['maha', 'aarti']);
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize(null), []);
});

test('scoreItem: AND across tokens, any field', () => {
  const f = { primary: ['Rudrabhishek Pooja', 'रुद्राभिषेक पूजा'], secondary: ['Kashi Vishwanath', 'Varanasi'] };
  assert.ok(scoreItem(f, 'rudra') > 0);
  assert.ok(scoreItem(f, 'pooja kashi') > 0);
  assert.equal(scoreItem(f, 'pooja delhi'), 0);
  assert.equal(scoreItem(f, ''), 0);
});

test('scoreItem: Devanagari input matches Hindi fields; Latin does not match them', () => {
  const f = { primary: ['Ganesh Aarti', 'गणेश आरती'], secondary: [] };
  assert.ok(scoreItem(f, 'गणेश') > 0);
  assert.ok(scoreItem(f, 'आर') > 0);
  assert.equal(scoreItem(f, 'हनुमान'), 0);
});

test('scoreItem: title prefix > title word-prefix > title contains > description', () => {
  const prefix = scoreItem({ primary: ['Shiv Chalisa'] }, 'shiv');
  const word = scoreItem({ primary: ['Om Shiv Chalisa'] }, 'shiv');
  const contains = scoreItem({ primary: ['Maheshiv'] }, 'shiv');
  const meta = scoreItem({ primary: ['Other'], secondary: ['Shiv temple'] }, 'shiv');
  assert.ok(prefix > word && word > contains && contains > meta && meta > 0);
});

test('rank: ordered by score, stable for ties, no crash on null fields', () => {
  const items = [
    { id: 'a', t: 'Temple of Shiv' },
    { id: 'b', t: 'Shiv Aarti' },
    { id: 'c', t: null },
    { id: 'd', t: 'Shiv Chalisa' },
    { id: 'e', t: 'Nothing' },
  ];
  const out = rank(items, 'shiv', (i) => ({ primary: [i.t, undefined, null] }));
  assert.deepEqual(out.map((i) => i.id), ['b', 'd', 'a']);
  assert.deepEqual(rank(items, '  ', (i) => ({ primary: [i.t] })), []);
  assert.deepEqual(rank([], 'x', () => ({ primary: [] })), []);
});

test('rank: whole-query prefix beats scattered words', () => {
  const items = [{ t: 'Pooja for Maha Shivratri' }, { t: 'Maha Shivratri Pooja' }];
  const out = rank(items, 'maha shivratri', (i) => ({ primary: [i.t] }));
  assert.equal(out[0].t, 'Maha Shivratri Pooja');
});

test('recents: newest first, dedupe ignoring case, cap 8, ignore blank', () => {
  let l = [];
  for (const q of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']) l = addRecent(l, q);
  assert.equal(l.length, 8);
  assert.equal(l[0], 'i');
  assert.ok(!l.includes('a'));
  l = addRecent(l, ' D ');
  assert.equal(l[0], 'D');
  assert.equal(l.filter((x) => x.toLowerCase() === 'd').length, 1);
  assert.deepEqual(addRecent(['x'], '   '), ['x']);
  assert.deepEqual(removeRecent(['x', 'y'], 'x'), ['y']);
});

test('parseRecents tolerates garbage', () => {
  assert.deepEqual(parseRecents(null), []);
  assert.deepEqual(parseRecents('{oops'), []);
  assert.deepEqual(parseRecents('{"a":1}'), []);
  assert.deepEqual(parseRecents('["a", 3, "", "b"]'), ['a', 'b']);
});

test('buildSuggestions: real names only, deduped, capped', () => {
  assert.deepEqual(buildSuggestions({ deities: [], temples: [], aartis: [] }), []);
  const s = buildSuggestions({
    deities: [{ name: 'Shiva' }, { name: 'Ganesh' }, { name: null }],
    temples: [{ name: 'Kashi Vishwanath' }, { name: 'shiva' }],
    aartis: [{ title: 'Om Jai Jagdish' }],
  });
  assert.deepEqual(s, ['Shiva', 'Ganesh', 'Kashi Vishwanath', 'Om Jai Jagdish']);
  assert.equal(buildSuggestions({ deities: Array.from({ length: 30 }, (_, i) => ({ name: `d${i}` })), temples: [], aartis: [] }, 3).length, 3);
});

test('poojaEntries + topEntries: matches temple name, caps at 5, counts all', () => {
  const cards = Array.from({ length: 7 }, (_, i) => ({ slug: `p${i}`, title: `Pooja ${i}`, titleHi: null, templeName: 'Kashi Vishwanath', place: 'Varanasi' }));
  cards.push({ slug: 'z', title: 'Other', templeName: 'Somnath' });
  const entries = E.poojaEntries(cards, false);
  const { hits, total } = E.topEntries(entries, 'kashi', 5);
  assert.equal(hits.length, 5);
  assert.equal(total, 7);
  assert.equal(hits[0].href, '/pooja/p0');
  assert.equal(hits[0].subtitle, 'Kashi Vishwanath · Varanasi');
});

test('topEntries: server extras are kept after ranked rows, no duplicates', () => {
  const base = E.poojaEntries([{ slug: 'a', title: 'Shani Pooja' }], false);
  const server = E.poojaEntries([{ slug: 'a', title: 'Shani Pooja' }, { slug: 'b', title: 'Sade Sati', tagline: '' }], false);
  const { hits, total } = E.topEntries(base, 'shani', 5, server);
  assert.deepEqual(hits.map((h) => h.key), ['a', 'b']);
  assert.equal(total, 2);
});

test('temple, aarti, deity, festival, event, chadhava entries', () => {
  const name = (s) => ({ shiva: 'Shiva', ganesh: 'Ganesh' })[s] ?? s;
  const temples = E.templeEntries([{ slug: 'kv', name: 'Kashi Vishwanath', location: 'Varanasi', deitySlug: 'shiva' }, { slug: 'x' }], name);
  assert.equal(E.topEntries(temples, 'shiva').hits[0].title, 'Kashi Vishwanath');
  assert.equal(temples[0].href, '/temples?search=Kashi%20Vishwanath');
  assert.equal(E.topEntries(temples, 'varanasi').total, 1);

  const aartis = E.aartiEntries([{ _id: '1', title: 'Om Jai Jagdish', artist: 'Anuradha', deitySlug: 'ganesh' }, { _id: '2' }], name);
  assert.equal(E.topEntries(aartis, 'anuradha').hits[0].key, '1');
  assert.equal(E.topEntries(aartis, 'ganesh').hits[0].key, '1');

  const deities = E.deityEntries([{ slug: 'shiva', name: 'Shiva', title: 'Mahadev' }], [{ deitySlug: 'shiva', epithet: 'Destroyer of evil', epithetHi: 'संहारक' }], true);
  assert.equal(E.topEntries(deities, 'destroyer').total, 1);
  assert.equal(E.topEntries(deities, 'संहारक').total, 1);
  assert.equal(deities[0].href, '/pooja?deity=shiva');
  assert.equal(deities[0].fresh, true);

  const fest = E.festivalEntries([{ id: 'f', name: 'Maha Shivratri', nameHi: 'महाशिवरात्रि', date: '2027-03-06', deity: 'shiva' }], name, true);
  assert.equal(E.topEntries(fest, 'महाशिव').hits[0].title, 'महाशिवरात्रि');
  assert.equal(fest[0].subtitle, '6 मार्च · Shiva');
  assert.equal(E.dayLabel('garbage', false), 'garbage');

  const events = E.eventEntries([{ slug: 'e1', title: 'Navratri Challenge', tags: ['devi'] }, { slug: 'e1', title: 'dup' }], false, (s) => `/events/${s}`);
  assert.equal(events.length, 1);
  assert.equal(E.topEntries(events, 'devi').hits[0].href, '/events/e1');

  const chad = E.chadhavaEntries([{ slug: 'c', title: 'Flower offering', templeName: 'Somnath', summary: null }], false);
  assert.equal(E.topEntries(chad, 'somnath').hits[0].href, '/chadhava/c');
  assert.deepEqual(E.poojaEntries(null, false), []);
});
