import assert from 'node:assert/strict';
import { test } from 'node:test';

import { compare, compareSets, countChanges, summarySet, changesLabel } from './diff.js';
import { activeEntries, blockKey, countUnder, describeEntry, getPath, indexErrors, mapErrors, normaliseFields } from './errors.js';
import { format, parseDocument, peek } from './json.js';
import {
  DEFAULT_ID, MAX_BLOCKS, addLayout, blankBlock, blankItem, blankLayoutBlocks, canMoveLayout, cleanBlock, copyLayout, dropIndex, duplicateBlock, findLayout, fixedCount, fromInput,
  insertBlock, layoutIdFor, mapBlocks, moveBlock, moveBlockTo, moveLayout, newId, normaliseDoc, orderedLayouts, removeBlock, removeLayout, reorder, selectionAfterRemove, toBody, toInput, warnings,
} from './layout.js';
import { LAYOUTS, previewModel, shownBlocks, visibility } from './preview.js';
import { groupTypes, normaliseRegistry, schemaBody, schemaDefaults, schemaFields, schemaProblems, sourcesOf } from './registry.js';
import { actionTarget } from './actions.js';

const REG = normaliseRegistry({
  blockTypes: [
    { type: 'header', title: 'Header', fixed: true, props: { type: 'object', properties: { showWallet: { type: 'boolean', default: true } } }, data: { modes: [], sources: null } },
    { type: 'search', title: 'Search bar', fixed: true, props: null, data: { modes: [], sources: null } },
    { type: 'shelf', title: 'Shelf', props: { type: 'object', properties: { layout: { type: 'string', enum: ['photo3', 'book2', 'list', 'grid4'], default: 'photo3' } } }, data: { modes: ['inline', 'source'], sources: ['poojas.upcoming', 'knowledge'] } },
    { type: 'slider', title: 'Slider', props: null, data: { modes: ['source', 'inline'], sources: ['hero'] } },
    { type: 'quick_grid', title: 'Quick grid', props: { type: 'object', properties: { columns: { type: 'integer', enum: [3, 4, 5], default: 4 }, tileStyle: { type: 'string', enum: ['icon', 'image', 'pill'], default: 'icon' } } }, data: { modes: ['inline'], sources: null, maxItems: 12 }, summary: '{count} shortcuts · {columns} per row' },
    { type: 'spacer', title: 'Spacer', props: { type: 'object', properties: { height: { type: 'integer', minimum: 4, maximum: 96, default: 16 } } }, data: { modes: [] } },
  ],
  sources: [{ key: 'poojas.upcoming', title: 'Upcoming poojas', params: { type: 'object', properties: { temple: { type: 'string' }, tags: { type: 'array' } } } }, { key: 'knowledge', title: 'Knowledge' }, { key: 'hero', title: 'Hero slides' }],
  actionTypes: ['pooja', 'none'], icons: ['diya'], tones: ['gold'], flags: ['chadhava'],
});
const type = (t) => REG.typeMap[t];
const seq = (...n) => { let i = 0; return () => n[i++ % n.length]; };
const mkBlock = (id, t = 'spacer') => ({ ...blankBlock(type(t), REG, []), id });
const layout = (id, blocks, extra = {}) => ({ id, name: id, enabled: true, audience: [], startsAt: null, endsAt: null, blocks, ...extra });
const topBar = () => [mkBlock('h', 'header'), mkBlock('s', 'search')];

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
  assert.deepEqual(REG.audiences.map((a) => a.key), ['new_user', 'has_booking', 'in_event', 'lapsed'], 'falls back to the closed list');
  assert.equal(REG.typeMap.header.fixed, true);
  assert.equal(REG.typeMap.quick_grid.data.maxItems, 12);
});

test('schema fields, defaults, body and problems', () => {
  const f = schemaFields(type('spacer').props);
  assert.equal(f[0].type, 'number');
  assert.deepEqual(schemaDefaults(type('shelf').props), { layout: 'photo3' });
  assert.deepEqual(schemaDefaults(type('spacer').props), { height: 16 });
  assert.deepEqual(schemaDefaults(type('quick_grid').props), { columns: 4, tileStyle: 'icon' });
  assert.deepEqual(schemaBody(type('spacer').props, { height: '24' }), { height: 24 });
  assert.deepEqual(schemaProblems(type('spacer').props, { height: 2 }), { height: 'At least 4' });
  assert.deepEqual(schemaProblems(type('spacer').props, { height: 2.5 }), { height: 'Enter a whole number' });
  const params = REG.sourceMap['poojas.upcoming'].params;
  assert.deepEqual(schemaBody(params, { temple: '', tags: 'a, b ,' }), { tags: ['a', 'b'] }, 'blank = unset');
  assert.deepEqual(schemaBody(type('quick_grid').props, { columns: '5', tileStyle: 'pill' }), { columns: 5, tileStyle: 'pill' }, 'enum numbers go as numbers');
  const cols = schemaFields(type('quick_grid').props);
  assert.deepEqual(cols.map((f) => [f.key, f.label, f.segmented]), [['columns', 'Per row', true], ['tileStyle', 'Tile style', true]], 'short enums render as segmented controls');
  assert.deepEqual(cols[1].options.map((o) => o.label), ['Icon + label', 'Image tiles', 'Pills']);
  assert.equal(schemaFields({ icon: { type: 'string', enum: ['a','b','c','d','e','f'] } })[0].segmented, false, 'a long list stays a select');
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
  assert.deepEqual(shelf.audience, []);
  assert.deepEqual(shelf.data, { mode: 'inline', items: [] });
  const slider = blankBlock(type('slider'), REG, taken);
  assert.equal(slider.data.mode, 'source');
  assert.equal(slider.data.source, 'hero');
  assert.equal(blankBlock(type('header'), REG, taken).data, null);
  assert.equal(blankBlock(type('spacer'), REG, taken).props.height, 16);
  assert.notEqual(shelf.id, 'b-aaaa');
  assert.deepEqual(blankItem(), { title: '', titleHi: '', subtitle: '', subtitleHi: '', icon: '', image: '', badge: '', badgeUntil: null, liveBadge: false, enabled: true, flag: '', deitySlug: '', action: null });
});

/* ---------------------------------------------------- sections: order -- */
const ids = (bs) => bs.map((b) => b.id);

test('the fixed top bar: counted from the registry, never moved, passed or removed', () => {
  const bs = [...topBar(), mkBlock('a'), mkBlock('b'), mkBlock('c')];
  assert.equal(fixedCount(bs, REG), 2);
  assert.equal(fixedCount([mkBlock('a'), ...topBar()], REG), 0, 'only a leading run is fixed');
  assert.deepEqual(ids(moveBlock(bs, 'a', -1, 2)), ['h', 's', 'a', 'b', 'c'], 'a section cannot go above the top bar');
  assert.equal(moveBlock(bs, 's', 1, 2), bs, 'a fixed block cannot move');
  assert.equal(moveBlock(bs, 'h', 1, 2), bs);
  assert.deepEqual(ids(moveBlock(bs, 'a', 1, 2)), ['h', 's', 'b', 'a', 'c']);
  assert.deepEqual(ids(moveBlockTo(bs, 'c', 0, 2)), ['h', 's', 'c', 'a', 'b'], 'drag to the very top lands just under the top bar');
  assert.equal(moveBlockTo(bs, 'h', 4, 2), bs);
  assert.deepEqual(ids(insertBlock(bs, mkBlock('x'), 'h', 2)), ['h', 's', 'x', 'a', 'b', 'c'], 'insert never lands inside the top bar');
  assert.deepEqual(ids(insertBlock(bs, mkBlock('x'), null, 2)), ['h', 's', 'a', 'b', 'c', 'x']);
  assert.equal(removeBlock(bs, 'h', 2), bs);
  assert.deepEqual(ids(removeBlock(bs, 'b', 2)), ['h', 's', 'a', 'c']);
  assert.equal(duplicateBlock(bs, 's', [], undefined, 2).id, null, 'the top bar cannot be duplicated');
});

test('drag and drop: where a dragged row lands', () => {
  const list = ['a', 'b', 'c', 'd'];
  assert.deepEqual(reorder(list, 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(reorder(list, 3, 0), ['d', 'a', 'b', 'c']);
  assert.equal(reorder(list, 1, 1), list);
  assert.equal(reorder(list, 9, 0), list);
  // dropping on the upper half of row `over` = before it; the lower half = after it
  assert.equal(dropIndex(0, 2, false), 1, 'a before c, from above: ends at index 1');
  assert.equal(dropIndex(0, 2, true), 2);
  assert.equal(dropIndex(3, 1, false), 1);
  assert.equal(dropIndex(3, 1, true), 2);
  assert.equal(dropIndex(1, 1, true), 1, 'dropping on itself is a no-op');
  assert.deepEqual(reorder(list, 0, dropIndex(0, 3, true)), ['b', 'c', 'd', 'a']);
  assert.deepEqual(reorder(list, 3, dropIndex(3, 0, false)), ['d', 'a', 'b', 'c']);
});

test('select, insert, remove, duplicate', () => {
  const bs = ['a', 'b', 'c'].map((i) => mkBlock(i));
  assert.deepEqual(ids(moveBlock(bs, 'b', -1)), ['b', 'a', 'c']);
  assert.equal(moveBlock(bs, 'a', -1), bs, 'no-op at the top returns the same array');
  assert.equal(moveBlock(bs, 'c', 1), bs);
  assert.deepEqual(ids(removeBlock(bs, 'b')), ['a', 'c']);
  assert.equal(selectionAfterRemove(bs, 'b'), 'c');
  assert.equal(selectionAfterRemove(bs, 'c'), 'b');
  assert.equal(selectionAfterRemove([mkBlock('a')], 'a'), null);
  const sh = { ...blankBlock(type('shelf'), REG, []), id: 'a', data: { mode: 'inline', items: [{ ...blankItem(), title: 'T' }] } };
  const dup = duplicateBlock([sh, mkBlock('z')], 'a', ['b-gone'], seq(0.5, 0.5, 0.5, 0.5, 0.1, 0.2, 0.3, 0.4));
  assert.equal(dup.blocks.length, 3);
  assert.equal(dup.blocks[1].id, dup.id);
  assert.notEqual(dup.id, 'a');
  dup.blocks[1].data.items[0].title = 'changed';
  assert.equal(sh.data.items[0].title, 'T', 'the copy is deep');
  assert.equal(duplicateBlock([sh], 'nope', []).id, null);
});

/* ----------------------------------------------------------- layouts -- */
test('layouts: ids, tabs order, priority, delete, copy', () => {
  assert.equal(layoutIdFor('Diwali layout', ['default']), 'diwali-layout');
  assert.equal(layoutIdFor('Diwali layout', ['diwali-layout']), 'diwali-layout-2');
  assert.equal(layoutIdFor('Default', []), 'default-2', 'never collides with the fallback');
  assert.equal(layoutIdFor('!!!', []), 'layout');
  const doc = { schemaVersion: 2, layouts: [layout('navratri', []), layout(DEFAULT_ID, topBar()), layout('diwali', []), layout('new', [])] };
  assert.deepEqual(orderedLayouts(doc).map((l) => l.id), ['default', 'navratri', 'diwali', 'new'], 'tabs: the default first, the rest in priority order');
  assert.deepEqual(moveLayout(doc, 'diwali', -1).layouts.map((l) => l.id), ['diwali', 'default', 'navratri', 'new'], 'swaps with the neighbouring non-default layout');
  assert.deepEqual(moveLayout(doc, 'new', -1).layouts.map((l) => l.id), ['navratri', 'default', 'new', 'diwali']);
  assert.equal(moveLayout(doc, 'navratri', -1), doc, 'already first');
  assert.equal(moveLayout(doc, DEFAULT_ID, 1), doc, 'the default never moves');
  assert.deepEqual([canMoveLayout(doc, 'navratri', -1), canMoveLayout(doc, 'navratri', 1), canMoveLayout(doc, 'new', 1), canMoveLayout(doc, DEFAULT_ID, 1)], [false, true, false, false]);
  assert.equal(removeLayout(doc, DEFAULT_ID), doc, 'the default cannot be deleted');
  assert.deepEqual(removeLayout(doc, 'diwali').layouts.map((l) => l.id), ['navratri', 'default', 'new']);
  const copy = copyLayout(doc.layouts[1], { id: 'x', name: 'Copy', enabled: false });
  copy.blocks[0].title = 'changed';
  assert.equal(doc.layouts[1].blocks[0].title, '', 'a copy is deep');
  assert.deepEqual([copy.enabled, copy.audience, copy.startsAt], [false, [], null]);
  assert.deepEqual(ids(blankLayoutBlocks(layout(DEFAULT_ID, [...topBar(), mkBlock('a')]), REG)), ['h', 's'], 'blank = just the fixed top bar');
  assert.equal(addLayout(doc, layout('z', [])).layouts.at(-1).id, 'z');
  assert.equal(findLayout(doc, 'diwali').id, 'diwali');
  assert.deepEqual(ids(mapBlocks(doc, 'diwali', () => [mkBlock('q')]).layouts[2].blocks), ['q']);
});

test('a v1 document is upgraded: wrapped as the default layout', () => {
  const up = normaliseDoc({ schemaVersion: 1, blocks: [mkBlock('a')] });
  assert.deepEqual([up.schemaVersion, up.layouts.length, up.layouts[0].id, up.layouts[0].enabled], [2, 1, 'default', true]);
  assert.equal(normaliseDoc({ layouts: [{ id: 'default', blocks: [] }] }).layouts[0].audience.length, 0);
  assert.equal(normaliseDoc(null).layouts[0].id, 'default');
});

/* ----------------------------------------------------------- sending -- */
test('toBody sends exactly the contract keys', () => {
  const b = { ...mkBlock('b-1'), extra: 1, props: { height: '30', junk: 1 }, action: { type: '', ref: 'x' }, startsAt: '', audience: [' has_booking ', ''] };
  const out = cleanBlock(b, REG);
  assert.equal('extra' in out, false);
  assert.deepEqual(out.props, { height: 30 });
  assert.equal(out.action, null);
  assert.equal(out.startsAt, null);
  assert.deepEqual(out.audience, ['has_booking']);
  const src = { ...blankBlock(type('shelf'), REG, []), id: 'b-2', data: { mode: 'source', source: 'poojas.upcoming', params: { temple: 'kashi', tags: 'a,b' }, limit: '6' } };
  assert.deepEqual(cleanBlock(src, REG).data, { mode: 'source', source: 'poojas.upcoming', params: { temple: 'kashi', tags: ['a', 'b'] }, limit: 6 });
  const inl = { ...blankBlock(type('shelf'), REG, []), id: 'b-3', data: { mode: 'inline', items: [{ title: 'x', badge: 'bogus', stray: 1, enabled: false, badgeUntil: '2026-10-31T00:00:00.000Z', action: { type: 'pooja', ref: ' slug ' } }, { title: 'y' }] } };
  const [it, it2] = cleanBlock(inl, REG).data.items;
  assert.equal(it.badge, '');
  assert.equal('stray' in it, false);
  assert.equal(it.enabled, false);
  assert.equal(it.badgeUntil, '2026-10-31T00:00:00.000Z');
  assert.deepEqual([it2.enabled, it2.badgeUntil], [true, null], 'an item is on unless switched off');
  assert.deepEqual(it.action, { type: 'pooja', ref: 'slug' });
  const body = toBody({ layouts: [layout('default', [b], { name: ' Default ', extra: 1 })] }, REG);
  assert.deepEqual(Object.keys(body), ['schemaVersion', 'layouts']);
  assert.equal(body.schemaVersion, 2);
  assert.deepEqual(Object.keys(body.layouts[0]), ['id', 'name', 'enabled', 'audience', 'startsAt', 'endsAt', 'blocks']);
  assert.equal(body.layouts[0].name, 'Default');
  assert.equal(Object.keys(body.layouts[0].blocks[0]).length, 18);
});

test('warnings: empty layout, missing top bar, empty sections, a layout that shadows the default', () => {
  const d = layout('default', [...topBar(), { ...blankBlock(type('shelf'), REG, []), id: 'e', title: 'My Test Card' }]);
  assert.match(warnings({ layouts: [d] }, REG).join('\n'), /“My Test Card” has nothing in it yet/);
  assert.deepEqual(warnings({ layouts: [layout('default', topBar())] }, REG), []);
  assert.ok(warnings({ layouts: [layout('default', [mkBlock('a')])] }, REG).some((w) => /top bar and search must be the first two/.test(w)));
  assert.ok(warnings({ layouts: [layout('default', [])] }, REG).some((w) => /no sections/.test(w)));
  assert.ok(warnings({ layouts: [layout('x', topBar())] }, REG).some((w) => /no default layout/.test(w)));
  assert.ok(warnings({ layouts: [layout('default', [mkBlock('a'), mkBlock('a')])] }, REG).some((w) => /share the id/.test(w)));
  assert.ok(warnings({ layouts: [layout('default', Array.from({ length: MAX_BLOCKS + 1 }, (_, i) => mkBlock(`b-${i}`)))] }, REG).some((w) => /at most/.test(w)));
  const all = { layouts: [layout('default', topBar()), layout('d', topBar(), { name: 'Diwali' })] };
  assert.ok(warnings(all, REG).some((w) => /“Diwali” has no schedule and no audience/.test(w)));
  assert.equal(warnings({ layouts: [all.layouts[0], { ...all.layouts[1], audience: ['new_user'] }] }, REG).length, 0);
  assert.equal(warnings({ layouts: [all.layouts[0], { ...all.layouts[1], enabled: false }] }, REG).length, 0);
});

test('IST datetime round trip', () => {
  assert.equal(fromInput('2026-10-11T04:00'), '2026-10-10T22:30:00.000Z');
  assert.equal(toInput('2026-10-10T22:30:00.000Z'), '2026-10-11T04:00');
  assert.equal(fromInput(''), null);
  assert.equal(toInput(null), '');
});

/* ------------------------------------------------------------ validation -- */
const DOC = { layouts: [
  layout('default', [{ id: 'b-a', type: 'header', data: null }]),
  layout('navratri', [{ id: 'b-x', type: 'header' }, { id: 'b-y', type: 'shelf', title: 'Poojas', audience: ['nope'], data: { mode: 'source', source: 'nope', items: [{}, {}] } }]),
] };

test('server field errors map onto the exact layout, block and field', () => {
  const { entries, global } = mapErrors({
    'layouts.1.blocks.1.audience.0': 'Unknown audience', 'layouts.1.blocks.1.data.items[1].title': 'Too long', 'layouts.0.blocks.0': 'Bad block',
    'layouts.1.name': 'Name is required', 'layouts.1.audience': 'Too many', layouts: 'Too many layouts', 'layouts.9.name': 'gone', 'layouts.1.blocks.9.title': 'gone block',
  }, DOC);
  const aud = entries.find((x) => x.sub === 'audience.0');
  assert.deepEqual([aud.layoutId, aud.blockId, aud.message, aud.path], ['navratri', 'b-y', 'Unknown audience', 'layouts.1.blocks.1.audience.0']);
  assert.ok(entries.some((x) => x.layoutId === 'navratri' && x.blockId === 'b-y' && x.sub === 'data.items.1.title'));
  assert.ok(entries.some((x) => x.layoutId === 'default' && x.blockId === 'b-a' && x.sub === ''));
  const name = entries.find((x) => x.sub === 'name');
  assert.deepEqual([name.layoutId, name.blockId], ['navratri', null], 'a layout-level error has no block');
  assert.ok(entries.some((x) => x.sub === 'audience' && x.blockId === null));
  assert.ok(entries.some((x) => x.blockId === null && x.sub === 'blocks.9.title'), 'a gone block index stays on its layout');
  assert.deepEqual(global.map((g) => g.path).sort(), ['layouts', 'layouts.9.name']);
  assert.deepEqual(normaliseFields([{ path: 'layouts[1].name', message: 'm' }]), { 'layouts.1.name': 'm' });
  assert.deepEqual(normaliseFields(null), {});
  assert.equal(getPath({ a: { b: [1, 2] } }, 'a.b.1'), 2);
  const idx = indexErrors(entries);
  assert.deepEqual(idx.blocks[blockKey('navratri', 'b-y')]['audience.0'], 'Unknown audience');
  assert.equal(idx.layouts.navratri.name, 'Name is required');
});

test('an error survives a reorder and clears when its field is edited', () => {
  const { entries } = mapErrors({ 'layouts.1.blocks.1.audience.0': 'Unknown audience', 'layouts.1.blocks.1': 'whole block', 'layouts.1.name': 'Bad name' }, DOC);
  const l1 = DOC.layouts[1];
  const reordered = { layouts: [DOC.layouts[1], DOC.layouts[0]] };
  assert.equal(activeEntries(entries, reordered).length, 3, 'moving layouts does not detach the errors');
  const flipped = { layouts: [DOC.layouts[0], { ...l1, blocks: [l1.blocks[1], l1.blocks[0]] }] };
  assert.equal(activeEntries(entries, flipped).length, 3, 'nor does reordering sections');
  const edited = { layouts: [DOC.layouts[0], { ...l1, name: 'Fixed name', blocks: [l1.blocks[0], { ...l1.blocks[1], audience: ['new_user'] }] }] };
  assert.deepEqual(activeEntries(entries, edited).map((x) => x.sub), [''], 'only the whole-block error remains');
  assert.equal(activeEntries(entries, { layouts: [DOC.layouts[0]] }).length, 0, 'a deleted layout takes its errors with it');
  assert.equal(activeEntries(entries, { layouts: [DOC.layouts[0], { ...l1, blocks: [l1.blocks[0]] }] }).filter((x) => x.blockId).length, 0, 'a deleted block takes its errors with it');
  assert.equal(countUnder({ 'data.items.1.title': 'x', 'data.source': 'y' }, 'data.items'), 1);
  assert.equal(describeEntry(entries[0], DOC), 'navratri › Section 2 (Poojas) › audience › 0');
  assert.equal(describeEntry(entries.find((e) => e.sub === 'name'), DOC), 'navratri › Layout settings › name');
});

/* ------------------------------------------------------------------ json -- */
test('import: lenient in, strict out (v2 set)', () => {
  const r = parseDocument(JSON.stringify({ schemaVersion: 2, layouts: [
    { id: 'default', name: 'Default layout', stray: 1, blocks: [{ type: 'header', stray2: 1 }, { id: 'b-x', type: 'spacer', props: { height: 8 } }, { id: 'b-x', type: 'spacer' }, { title: 'no type' }, 7] },
    { id: 'default', blocks: [] }, 'x',
  ] }), seq(0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9));
  assert.equal(r.error, '');
  assert.equal(r.doc.schemaVersion, 2);
  assert.equal(r.doc.layouts.length, 2);
  const [d, second] = r.doc.layouts;
  assert.equal(d.blocks.length, 3);
  assert.equal(new Set(d.blocks.map((b) => b.id)).size, 3);
  assert.deepEqual([d.blocks[0].enabled, d.blocks[0].language, d.blocks[0].audience], [true, 'all', []]);
  assert.equal('stray2' in d.blocks[0], false);
  assert.notEqual(second.id, 'default', 'a repeated layout id is replaced');
  assert.equal(second.id, 'default-layout', 'the name gives the new id');
  assert.ok(r.notes.some((n) => /Dropped fields.*stray/.test(n)));
  assert.ok(r.notes.some((n) => /repeated the id “b-x”/.test(n)));
  assert.ok(r.notes.some((n) => /no type/.test(n)));
  assert.ok(r.notes.some((n) => /not an object/.test(n)));
  assert.ok(r.notes.some((n) => /id “default” was repeated/.test(n)));
});

test('import: a v1 paste or a bare array is wrapped as the default layout', () => {
  const v1 = parseDocument(JSON.stringify({ schemaVersion: 1, blocks: [{ id: 'b-1', type: 'header' }] }));
  assert.deepEqual([v1.doc.schemaVersion, v1.doc.layouts.length, v1.doc.layouts[0].id, v1.doc.layouts[0].blocks.length], [2, 1, 'default', 1]);
  assert.ok(v1.notes.some((n) => /wrapped as the default layout/.test(n)));
  assert.equal(parseDocument('[{"id":"b-1","type":"header"}]').doc.layouts[0].blocks.length, 1);
  assert.equal(parseDocument(JSON.stringify({ draft: { schemaVersion: 2, layouts: [{ id: 'default', name: 'D', blocks: [] }] } })).doc.layouts.length, 1);
  assert.equal(parseDocument(JSON.stringify({ draft: { blocks: [{ id: 'b-1', type: 'header' }] } })).doc.layouts[0].id, 'default');
  assert.match(parseDocument('{nope').error, /^Not valid JSON/);
  assert.match(parseDocument('{"a":1}').error, /Expected an object/);
  assert.match(parseDocument('{"schemaVersion":9,"layouts":[]}').notes[0], /schemaVersion 9/);
  assert.deepEqual(peek('{"layouts":[{"blocks":[{},{}]},{"blocks":[{}]}]}'), { ok: true, layouts: 2, blocks: 3 });
  assert.equal(peek('{"blocks":[{},{}]}').layouts, 1);
  assert.equal(peek('{').ok, false);
});

test('import then export is stable', () => {
  const doc = toBody({ layouts: [layout('default', [...topBar(), { ...blankBlock(type('shelf'), REG, []), id: 'b-s', audience: ['has_booking'] }], { name: 'Default layout' })] }, REG);
  const back = parseDocument(format(doc)).doc;
  assert.equal(JSON.stringify(toBody(back, REG)), JSON.stringify(doc));
});

/* ---------------------------------------------------------------- diff -- */
test('compare blocks by id; moved = the fewest blocks that jump', () => {
  const a = { blocks: [{ id: '1', t: 1 }, { id: '2' }, { id: '3' }] };
  const b = { blocks: [{ id: '1', t: 2 }, { id: '3' }, { id: '4' }] };
  const d = compare(a, b);
  assert.deepEqual([d.added, d.removed, d.changed, d.moved], [['4'], ['2'], ['1'], 0]);
  assert.equal(compare(a, a).same, true);
  const ab = (...i) => ({ blocks: i.map((id) => ({ id })) });
  assert.equal(compare(ab('1', '2', '3', '4'), ab('4', '1', '2', '3')).moved, 1, 'one drag is one move, not four');
  assert.equal(compare(ab('1', '2'), ab('2', '1')).moved, 1);
  assert.equal(compare(ab('1', '2', '3'), ab('1', '2', '3')).moved, 0);
});

test('change counts and summaries between two sets', () => {
  const live = { layouts: [layout('default', [{ id: '1' }, { id: '2' }, { id: '3' }]), layout('n', [{ id: '1' }], { name: 'Navratri' })] };
  assert.equal(countChanges(live, live), 0);
  assert.equal(changesLabel(0), 'Draft matches the live layout');
  assert.equal(changesLabel(1), 'Draft · 1 change not published');
  assert.equal(changesLabel(3), 'Draft · 3 changes not published');
  const draft = { layouts: [
    layout('default', [{ id: '2' }, { id: '3' }, { id: '1' }, { id: '9' }]), // 1 moved + 1 added
    layout('n', [{ id: '1', title: 'x' }], { name: 'Navratri 2026', audience: ['new_user'] }), // renamed + audience = 1 layout change, 1 block changed
    layout('d', [], { name: 'Diwali' }), // a layout added
  ] };
  const d = compareSets(live, draft);
  assert.deepEqual([d.addedLayouts, d.removedLayouts, d.changedLayouts], [['d'], [], ['n']]);
  assert.equal(d.count, 5);
  assert.equal(summarySet(d), '1 layout added · 1 layout re-configured · 1 section added · 1 section changed · 1 moved');
  assert.equal(summarySet(compareSets(live, live)), 'No differences');
  assert.equal(compareSets(live, { layouts: [live.layouts[0]] }).removedLayouts[0], 'n');
  const sched = compareSets({ layouts: [layout('a', [])] }, { layouts: [layout('a', [], { startsAt: '2026-10-11T00:00:00.000Z' })] });
  assert.equal(sched.count, 1, 're-scheduling a layout is one change');
});

/* -------------------------------------------------------------- preview -- */
test('preview draws by data mode and layout, never by type name', () => {
  const NOW = Date.parse('2026-10-15T00:00:00Z');
  const shelf = { ...blankBlock(type('shelf'), REG, []), title: 'Poojas', titleHi: 'पूजा', data: { mode: 'source', source: 'poojas.upcoming', params: {}, limit: 6 } };
  const m = previewModel(shelf, REG, { now: NOW });
  assert.equal(m.kind, 'source');
  assert.equal(m.source, 'Upcoming poojas');
  assert.equal(previewModel(shelf, REG, { now: NOW, lang: 'hi' }).title, 'पूजा');
  const inl = { ...shelf, props: { layout: 'book2' }, data: { mode: 'inline', items: [{ title: 'A', titleHi: '', image: '/uploads/a.png' }, { title: 'B' }] } };
  const mi = previewModel(inl, REG, { now: NOW });
  assert.deepEqual([mi.kind, mi.cols, mi.shape, mi.items.length, mi.items[0].image], ['items', LAYOUTS.book2.cols, 'book', 2, '/uploads/a.png']);
  const grid = previewModel({ ...inl, type: 'quick_grid', props: { columns: 5, tileStyle: 'pill' } }, REG, { now: NOW });
  assert.deepEqual([grid.cols, grid.shape, grid.tileStyle], [5, 'tile', 'pill']);
  assert.equal(previewModel({ ...inl, props: {} }, REG, { now: NOW }).shape, 'card');
  assert.deepEqual(previewModel(mkBlock('s'), REG, { now: NOW }).kind, 'gap');
  assert.equal(previewModel({ id: 'z', type: 'future_thing', props: {}, data: null }, REG).unknownType, true);
});

test('preview: an item switched off is not drawn, and an expired badge disappears but the tile stays', () => {
  const NOW = Date.parse('2026-11-01T00:00:00Z');
  const grid = { ...mkBlock('g', 'quick_grid'), props: { columns: 4 }, data: { mode: 'inline', items: [
    { title: 'A', badge: 'new', badgeUntil: '2026-10-31T18:29:00.000Z' },
    { title: 'B', badge: 'new', badgeUntil: '2026-12-01T00:00:00.000Z' },
    { title: 'C', badge: 'soon' },
    { title: 'D', enabled: false },
  ] } };
  const m = previewModel(grid, REG, { now: NOW });
  assert.deepEqual(m.items.map((i) => i.title), ['A', 'B', 'C']);
  assert.deepEqual(m.items.map((i) => i.badge), ['', 'new', 'soon']);
});

test('shownBlocks: what the persona would see, plus the selected block kept for editing', () => {
  const NOW = Date.parse('2026-10-15T12:00:00Z');
  const bs = [mkBlock('a'), { ...mkBlock('b'), audience: ['has_booking'] }, { ...mkBlock('c'), enabled: false }];
  const none = { lang: 'en', segments: [] };
  assert.deepEqual(shownBlocks(bs, REG, { now: NOW, lang: 'en', persona: none }).map((m) => m.id), ['a']);
  assert.deepEqual(shownBlocks(bs, REG, { now: NOW, lang: 'en', persona: { lang: 'en', segments: ['has_booking'] } }).map((m) => m.id), ['a', 'b']);
  const kept = shownBlocks(bs, REG, { now: NOW, lang: 'en', persona: none }, 'b');
  assert.deepEqual(kept.map((m) => [m.id, m.visibility]), [['a', ''], ['b', 'audience']]);
  assert.equal(kept[1].audienceMiss, true);
  assert.equal(visibility({ ...mkBlock('x'), audience: ['has_booking'] }, { now: NOW }), '', 'no persona = no audience filtering');
});

test('actions read as "Opens · target"', () => {
  assert.equal(actionTarget(null), 'Nothing yet');
  assert.equal(actionTarget({ type: 'pooja', ref: '' }), 'Pooja Seva list');
  assert.equal(actionTarget({ type: 'pooja', ref: 'kashi' }, () => 'Kashi Aarti'), 'Pooja Seva · Kashi Aarti');
  assert.equal(actionTarget({ type: 'route', ref: '/temples' }), '/temples');
  assert.equal(actionTarget({ type: 'link', ref: 'https://example.org/x' }), 'example.org/x');
  assert.equal(actionTarget({ type: 'bhajan', ref: '' }), 'Bhajan tab');
  assert.equal(actionTarget({ type: 'brand_new', ref: '' }), 'brand_new');
});
