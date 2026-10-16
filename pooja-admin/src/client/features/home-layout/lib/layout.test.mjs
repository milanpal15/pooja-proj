import assert from 'node:assert/strict';
import { test } from 'node:test';

import { compare, summary } from './diff.js';
import { activeEntries, bySubpath, countUnder, describeEntry, getPath, mapErrors, normaliseFields } from './errors.js';
import { format, parseDocument, peek } from './json.js';
import { MAX_BLOCKS, blankBlock, blankItem, cleanBlock, duplicateBlock, fromInput, insertBlock, moveBlock, newId, removeBlock, selectionAfterRemove, toBody, toInput, warnings } from './layout.js';
import { LAYOUTS, previewModel, visibility } from './preview.js';
import { groupTypes, normaliseRegistry, schemaBody, schemaDefaults, schemaFields, schemaProblems, sourcesOf } from './registry.js';

const REG = normaliseRegistry({
  blockTypes: [
    { type: 'header', title: 'Header', props: { type: 'object', properties: { showWallet: { type: 'boolean', default: true } } }, data: { modes: [], sources: null } },
    { type: 'shelf', title: 'Shelf', props: { type: 'object', properties: { layout: { type: 'string', enum: ['photo3', 'book2', 'list', 'grid4'], default: 'photo3' } } }, data: { modes: ['inline', 'source'], sources: ['poojas.upcoming', 'knowledge'] } },
    { type: 'slider', title: 'Slider', props: null, data: { modes: ['source', 'inline'], sources: ['hero'] } },
    { type: 'quick_grid', title: 'Quick grid', props: { type: 'object', properties: { columns: { type: 'integer', enum: [3, 4], default: 3 } } }, data: { modes: ['inline'], sources: null } },
    { type: 'spacer', title: 'Spacer', props: { type: 'object', properties: { height: { type: 'integer', minimum: 4, maximum: 96, default: 16 } } }, data: { modes: [] } },
  ],
  sources: [{ key: 'poojas.upcoming', title: 'Upcoming poojas', params: { type: 'object', properties: { temple: { type: 'string' }, tags: { type: 'array' } } } }, { key: 'knowledge', title: 'Knowledge' }, { key: 'hero', title: 'Hero slides' }],
  actionTypes: ['pooja', 'none'], icons: ['diya'], tones: ['gold'], flags: ['chadhava'],
});
const type = (t) => REG.typeMap[t];
const seq = (...n) => { let i = 0; return () => n[i++ % n.length]; };

test('ids are b-xxxx and never collide', () => {
  const id = newId([], seq(0, 0.1, 0.2, 0.3));
  assert.match(id, /^b-[a-z0-9]{4}$/);
  const again = newId([id], seq(0, 0.1, 0.2, 0.3, 0.5, 0.6, 0.7, 0.8));
  assert.notEqual(again, id);
  assert.match(newId(), /^b-[a-z0-9]{4}$/);
});

test('registry: modes, sources, groups', () => {
  assert.deepEqual(REG.typeMap.shelf.data.modes, ['inline', 'source']);
  assert.deepEqual(sourcesOf(type('shelf'), REG).map((s) => s.key), ['poojas.upcoming', 'knowledge']);
  assert.deepEqual(sourcesOf(type('slider'), REG).map((s) => s.key), ['hero']);
  assert.equal(sourcesOf(type('quick_grid'), REG).length, 3, 'null sources = every source');
  assert.deepEqual(groupTypes(REG.types).map((g) => g.label), ['Page chrome and layout', 'Cards and content']);
});

test('schema fields, defaults, body and problems', () => {
  const f = schemaFields(type('spacer').props);
  assert.equal(f[0].type, 'number');
  assert.deepEqual(schemaDefaults(type('shelf').props), { layout: 'photo3' });
  assert.deepEqual(schemaDefaults(type('spacer').props), { height: 16 });
  assert.deepEqual(schemaBody(type('spacer').props, { height: '24' }), { height: 24 });
  assert.deepEqual(schemaProblems(type('spacer').props, { height: 2 }), { height: 'At least 4' });
  assert.deepEqual(schemaProblems(type('spacer').props, { height: 2.5 }), { height: 'Enter a whole number' });
  const params = REG.sourceMap['poojas.upcoming'].params;
  assert.deepEqual(schemaBody(params, { temple: '', tags: 'a, b ,' }), { tags: ['a', 'b'] }, 'blank = unset');
  assert.deepEqual(schemaBody(type('quick_grid').props, { columns: '4' }), { columns: 4 }, 'enum numbers go as numbers');
  assert.equal(schemaFields({ h: { type: 'html', maxBytes: 20480 } })[0].type, 'textarea');
  assert.equal(schemaFields({ temple: { type: 'string' } })[0].ref, 'temples');
  assert.deepEqual(schemaFields(null), []);
  assert.deepEqual(schemaFields({ a: { type: 'boolean' } }).map((x) => x.key), ['a']);
});

test('a blank block takes defaults from the registry, and data only where the type allows it', () => {
  const taken = ['b-aaaa'];
  const shelf = blankBlock(type('shelf'), REG, taken);
  assert.equal(shelf.type, 'shelf');
  assert.deepEqual(shelf.props, { layout: 'photo3' });
  assert.deepEqual(shelf.data, { mode: 'inline', items: [] });
  const slider = blankBlock(type('slider'), REG, taken);
  assert.equal(slider.data.mode, 'source');
  assert.equal(slider.data.source, 'hero');
  assert.equal(blankBlock(type('header'), REG, taken).data, null);
  assert.equal(blankBlock(type('spacer'), REG, taken).props.height, 16);
  assert.notEqual(shelf.id, 'b-aaaa');
});

test('reorder, insert, remove, duplicate', () => {
  const mk = (id) => ({ ...blankBlock(type('header'), REG, []), id });
  const bs = ['a', 'b', 'c'].map(mk);
  assert.deepEqual(moveBlock(bs, 'b', -1).map((b) => b.id), ['b', 'a', 'c']);
  assert.deepEqual(moveBlock(bs, 'b', 1).map((b) => b.id), ['a', 'c', 'b']);
  assert.equal(moveBlock(bs, 'a', -1), bs, 'no-op at the top returns the same array');
  assert.equal(moveBlock(bs, 'c', 1), bs);
  assert.deepEqual(insertBlock(bs, mk('x'), 'a').map((b) => b.id), ['a', 'x', 'b', 'c']);
  assert.deepEqual(insertBlock(bs, mk('x'), null).map((b) => b.id), ['a', 'b', 'c', 'x']);
  assert.deepEqual(removeBlock(bs, 'b').map((b) => b.id), ['a', 'c']);
  assert.equal(selectionAfterRemove(bs, 'b'), 'c');
  assert.equal(selectionAfterRemove(bs, 'c'), 'b');
  assert.equal(selectionAfterRemove([mk('a')], 'a'), null);
  const sh = { ...blankBlock(type('shelf'), REG, []), id: 'a', data: { mode: 'inline', items: [{ ...blankItem(), title: 'T' }] } };
  const dup = duplicateBlock([sh, mk('z')], 'a', ['b-gone'], seq(0.5, 0.5, 0.5, 0.5, 0.1, 0.2, 0.3, 0.4));
  assert.equal(dup.blocks.length, 3);
  assert.equal(dup.blocks[1].id, dup.id);
  assert.notEqual(dup.id, 'a');
  assert.equal(dup.blocks[1].data.items[0].title, 'T');
  dup.blocks[1].data.items[0].title = 'changed';
  assert.equal(sh.data.items[0].title, 'T', 'the copy is deep');
  assert.equal(duplicateBlock([sh], 'nope', []).id, null);
});

test('toBody sends exactly the contract keys', () => {
  const b = { ...blankBlock(type('spacer'), REG, []), id: 'b-1', extra: 1, props: { height: '30', junk: 1 }, action: { type: '', ref: 'x' }, startsAt: '' };
  const out = cleanBlock(b, REG);
  assert.equal('extra' in out, false);
  assert.deepEqual(out.props, { height: 30 });
  assert.equal(out.action, null);
  assert.equal(out.startsAt, null);
  const src = { ...blankBlock(type('shelf'), REG, []), id: 'b-2', data: { mode: 'source', source: 'poojas.upcoming', params: { temple: 'kashi', tags: 'a,b' }, limit: '6' } };
  assert.deepEqual(cleanBlock(src, REG).data, { mode: 'source', source: 'poojas.upcoming', params: { temple: 'kashi', tags: ['a', 'b'] }, limit: 6 });
  const noLimit = { ...src, data: { ...src.data, limit: '' } };
  assert.equal('limit' in cleanBlock(noLimit, REG).data, false);
  const inl = { ...blankBlock(type('shelf'), REG, []), id: 'b-3', data: { mode: 'inline', items: [{ title: 'x', badge: 'bogus', stray: 1, action: { type: 'pooja', ref: ' slug ' } }] } };
  const it = cleanBlock(inl, REG).data.items[0];
  assert.equal(it.badge, '');
  assert.equal('stray' in it, false);
  assert.deepEqual(it.action, { type: 'pooja', ref: 'slug' });
  assert.deepEqual(Object.keys(toBody({ blocks: [b] }, REG).blocks[0]).length, 17);
});

test('warnings: an inline block with no cards will not be shown by the app', () => {
  const h = { id: 'h', type: 'header', enabled: true };
  const empty = { id: 's', type: 'shelf', enabled: true, title: 'My Test Card', data: { mode: 'inline', items: [] } };
  assert.match(warnings({ blocks: [h, empty] }).join('\n'), /“My Test Card” has no cards yet/);
  assert.deepEqual(warnings({ blocks: [h, { ...empty, enabled: false }] }), []);
  assert.deepEqual(warnings({ blocks: [h, { ...empty, data: { mode: 'inline', items: [{ title: 'x' }] } }] }), []);
  assert.deepEqual(warnings({ blocks: [h, { ...empty, data: { mode: 'source', source: 'poojas.upcoming' } }] }), []);
});

test('warnings: no header, empty, duplicate ids', () => {
  const h = blankBlock(type('header'), REG, []);
  assert.deepEqual(warnings({ blocks: [h] }), []);
  assert.equal(warnings({ blocks: [{ ...h, enabled: false }] }).length, 1);
  assert.equal(warnings({ blocks: [blankBlock(type('spacer'), REG, [])] }).length, 1);
  assert.equal(warnings({ blocks: [] }).length, 2);
  assert.ok(warnings({ blocks: [h, { ...h }] }).some((w) => /share the id/.test(w)));
  assert.ok(warnings({ blocks: Array.from({ length: MAX_BLOCKS + 1 }, (_, i) => ({ ...h, id: `b-${i}` })) }).some((w) => /at most/.test(w)));
});

test('IST datetime round trip', () => {
  assert.equal(fromInput('2026-10-11T04:00'), '2026-10-10T22:30:00.000Z');
  assert.equal(toInput('2026-10-10T22:30:00.000Z'), '2026-10-11T04:00');
  assert.equal(fromInput(''), null);
  assert.equal(toInput(null), '');
});

/* ------------------------------------------------------------ validation -- */
const BLOCKS = [{ id: 'b-a', type: 'header', data: null }, { id: 'b-b', type: 'shelf', title: 'Poojas', data: { mode: 'source', source: 'nope', items: [{}, {}] } }];

test('server field errors map onto the exact block and field', () => {
  const { entries, global } = mapErrors({ 'blocks.1.data.source': 'Unknown source', 'blocks.1.data.items[1].title': 'Too long', 'blocks.0': 'Bad block', blocks: 'Too many', 'blocks.9.title': 'gone' }, BLOCKS);
  assert.equal(entries.length, 3);
  const e = entries.find((x) => x.sub === 'data.source');
  assert.deepEqual([e.blockId, e.message], ['b-b', 'Unknown source']);
  assert.ok(entries.some((x) => x.sub === 'data.items.1.title'));
  assert.ok(entries.some((x) => x.blockId === 'b-a' && x.sub === ''));
  assert.deepEqual(global.map((g) => g.path).sort(), ['blocks', 'blocks.9.title']);
  assert.deepEqual(normaliseFields([{ path: 'blocks[0].title', message: 'm' }]), { 'blocks.0.title': 'm' });
  assert.deepEqual(normaliseFields(null), {});
  assert.equal(getPath({ a: { b: [1, 2] } }, 'a.b.1'), 2);
});

test('an error survives a reorder and clears when its field is edited', () => {
  const { entries } = mapErrors({ 'blocks.1.data.source': 'Unknown source', 'blocks.1': 'whole block' }, BLOCKS);
  const reordered = [BLOCKS[1], BLOCKS[0]];
  assert.equal(activeEntries(entries, reordered).length, 2);
  const edited = [BLOCKS[0], { ...BLOCKS[1], data: { ...BLOCKS[1].data, source: 'poojas.upcoming' } }];
  const left = activeEntries(entries, edited);
  assert.deepEqual(left.map((x) => x.sub), ['']);
  assert.equal(activeEntries(entries, [BLOCKS[0]]).length, 0, 'a deleted block takes its errors with it');
  assert.deepEqual(bySubpath(entries)['b-b'], { 'data.source': 'Unknown source', '': 'whole block' });
  assert.equal(countUnder({ 'data.items.1.title': 'x', 'data.source': 'y' }, 'data.items'), 1);
  assert.match(describeEntry(entries[0], BLOCKS), /^Block 2 \(Poojas\) › data › source$/);
});

/* ------------------------------------------------------------------ json -- */
test('import: lenient in, strict out', () => {
  const r = parseDocument(JSON.stringify({ schemaVersion: 1, blocks: [{ type: 'header', stray: 1 }, { id: 'b-x', type: 'spacer', props: { height: 8 } }, { id: 'b-x', type: 'spacer' }, { title: 'no type' }, 7] }), seq(0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9));
  assert.equal(r.error, '');
  assert.equal(r.doc.blocks.length, 3);
  const ids = r.doc.blocks.map((b) => b.id);
  assert.equal(new Set(ids).size, 3);
  assert.ok(ids.every((i) => /^b-/.test(i)));
  assert.equal(r.doc.blocks[0].enabled, true);
  assert.equal(r.doc.blocks[0].language, 'all');
  assert.equal('stray' in r.doc.blocks[0], false);
  assert.ok(r.notes.some((n) => /Dropped fields.*stray/.test(n)));
  assert.ok(r.notes.some((n) => /repeated the id/.test(n)));
  assert.ok(r.notes.some((n) => /no type/.test(n)));
  assert.ok(r.notes.some((n) => /not an object/.test(n)));
});

test('import: bare arrays and wrappers; errors are sentences', () => {
  assert.equal(parseDocument('[{"id":"b-1","type":"header"}]').doc.blocks.length, 1);
  assert.equal(parseDocument(JSON.stringify({ draft: { blocks: [{ id: 'b-1', type: 'header' }] } })).doc.blocks.length, 1);
  assert.match(parseDocument('{nope').error, /^Not valid JSON/);
  assert.match(parseDocument('{"a":1}').error, /Expected an object/);
  assert.match(parseDocument('{"schemaVersion":9,"blocks":[]}').notes[0], /schemaVersion 9/);
  assert.equal(peek('{"blocks":[{},{}]}').blocks, 2);
  assert.equal(peek('{').ok, false);
  const doc = { schemaVersion: 1, blocks: [{ id: 'b-1', type: 'header' }] };
  assert.equal(JSON.parse(format(doc)).blocks[0].id, 'b-1');
});

test('import then export is stable', () => {
  const doc = toBody({ blocks: [blankBlock(type('shelf'), REG, [])] }, REG);
  const back = parseDocument(format(doc)).doc;
  assert.equal(JSON.stringify(toBody(back, REG)), JSON.stringify(doc));
});

/* ---------------------------------------------------------------- diff -- */
test('compare versions by block id', () => {
  const a = { blocks: [{ id: '1', t: 1 }, { id: '2' }, { id: '3' }] };
  const b = { blocks: [{ id: '1', t: 2 }, { id: '3' }, { id: '4' }] };
  const d = compare(a, b);
  assert.deepEqual([d.added, d.removed, d.changed, d.reordered], [['4'], ['2'], ['1'], false]);
  assert.equal(summary(d), '1 added · 1 removed · 1 changed');
  assert.equal(compare(a, a).same, true);
  assert.equal(summary(compare(a, a)), 'No differences');
  assert.equal(compare({ blocks: [{ id: '1' }, { id: '2' }] }, { blocks: [{ id: '2' }, { id: '1' }] }).reordered, true);
});

/* -------------------------------------------------------------- preview -- */
test('preview draws by data mode and layout, never by type name', () => {
  const NOW = Date.parse('2026-10-15T00:00:00Z');
  const shelf = { ...blankBlock(type('shelf'), REG, []), title: 'Poojas', titleHi: 'पूजा', data: { mode: 'source', source: 'poojas.upcoming', params: {}, limit: 6 } };
  const m = previewModel(shelf, REG, { now: NOW });
  assert.equal(m.kind, 'source');
  assert.equal(m.source, 'Upcoming poojas');
  assert.equal(m.title, 'Poojas');
  assert.equal(previewModel(shelf, REG, { now: NOW, lang: 'hi' }).title, 'पूजा');
  const inl = { ...shelf, props: { layout: 'book2' }, data: { mode: 'inline', items: [{ title: 'A', titleHi: '', image: '/uploads/a.png' }, { title: 'B' }] } };
  const mi = previewModel(inl, REG, { now: NOW });
  assert.deepEqual([mi.kind, mi.cols, mi.shape, mi.items.length, mi.items[0].image], ['items', LAYOUTS.book2.cols, 'book', 2, '/uploads/a.png']);
  const grid = previewModel({ ...inl, type: 'quick_grid', props: { columns: 4 } }, REG, { now: NOW });
  assert.deepEqual([grid.cols, grid.shape], [4, 'tile']);
  assert.equal(previewModel({ ...inl, props: {} }, REG, { now: NOW }).shape, 'card');
  assert.deepEqual(previewModel(blankBlock(type('spacer'), REG, []), REG, { now: NOW }).kind, 'gap');
  const h = previewModel(blankBlock(type('header'), REG, []), REG, { now: NOW });
  assert.deepEqual([h.kind, h.typeTitle], ['plain', 'Header']);
  assert.equal(previewModel({ id: 'z', type: 'future_thing', props: {}, data: null }, REG).unknownType, true);
});

test('preview states: disabled, scheduled, ended, other language', () => {
  const NOW = Date.parse('2026-10-15T12:00:00Z');
  const b = blankBlock(type('header'), REG, []);
  assert.equal(visibility(b, { now: NOW }), '');
  assert.equal(visibility({ ...b, enabled: false }, { now: NOW }), 'disabled');
  assert.equal(visibility({ ...b, startsAt: '2026-10-16T00:00:00Z' }, { now: NOW }), 'scheduled');
  assert.equal(visibility({ ...b, endsAt: '2026-10-14T00:00:00Z' }, { now: NOW }), 'ended');
  assert.equal(visibility({ ...b, startsAt: '2026-10-14T00:00:00Z', endsAt: '2026-10-16T00:00:00Z' }, { now: NOW }), '');
  assert.equal(visibility({ ...b, language: 'hi' }, { now: NOW, lang: 'en' }), 'language');
  assert.equal(visibility({ ...b, language: 'hi' }, { now: NOW, lang: 'hi' }), '');
  assert.equal(visibility({ ...b, language: 'hi' }, { now: NOW, lang: 'all' }), '');
});
