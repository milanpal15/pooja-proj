import assert from 'node:assert/strict';
import test from 'node:test';

import { KNOWN_AREAS, KNOWN_AREA_KEYS } from '../../../lib/access/areas.js';
import { MODULES } from '../../../lib/nav/registry.js';
import { columnState, diffPerms, escalationList, groupAreas, levelOf, normalize, samePerms, setColumn, setLevel, slugify, toggle, validateRole } from './matrix.js';
import { notableAbilities, previewModules } from './preview.js';

const K = KNOWN_AREA_KEYS;

test('normalise: edit implies view, junk dropped, registry order, no duplicates', () => {
  const n = normalize(['content:edit', 'bogus:view', 'content:view', 'flags:view', 'flags:view', 'content:nope', 'overview:edit'], K);
  assert.deepEqual(n, ['overview:view', 'overview:edit', 'flags:view', 'content:view', 'content:edit'].sort((a, b) => K.indexOf(a.split(':')[0]) - K.indexOf(b.split(':')[0])));
  assert.deepEqual(normalize(null, K), []);
});

test('row states and checkbox rules', () => {
  let p = [];
  p = toggle(p, 'content', 'edit', true, K);
  assert.equal(levelOf(p, 'content'), 'edit');
  assert.deepEqual(p, ['content:view', 'content:edit']);
  p = toggle(p, 'content', 'edit', false, K);
  assert.equal(levelOf(p, 'content'), 'view', 'unticking Edit keeps View');
  p = toggle(p, 'content', 'edit', true, K);
  p = toggle(p, 'content', 'view', false, K);
  assert.equal(levelOf(p, 'content'), 'none', 'unticking View removes Edit too');
  assert.equal(levelOf(setLevel([], 'flags', 'view', K), 'flags'), 'view');
});

test('column and group helpers, with areas the editor may not grant', () => {
  const areas = ['content', 'horoscope', 'panchang'];
  const all = setColumn([], areas, 'edit', true, K);
  assert.equal(columnState(all, areas, 'edit'), 'all');
  assert.equal(columnState(all, areas, 'view'), 'all');
  const skipHoroscope = setColumn([], areas, 'edit', true, K, (a) => a === 'horoscope');
  assert.equal(columnState(skipHoroscope, areas, 'edit'), 'some');
  assert.equal(levelOf(skipHoroscope, 'horoscope'), 'none');
  assert.equal(columnState([], areas, 'view'), 'none');
});

test('areas group in sidebar order whether the server sends keys or labels', () => {
  const byKey = groupAreas(KNOWN_AREAS);
  const byLabel = groupAreas([{ key: 'a', group: 'Releases & control' }, { key: 'b', group: 'People' }, { key: 'c', group: 'Overview' }, { key: 'd', group: 'Mystery' }]);
  assert.equal(byKey[0].label !== undefined, true);
  assert.deepEqual(byLabel.map((g) => g.label), ['Overview', 'People', 'Releases & control', 'Mystery']);
  assert.equal(byKey.flatMap((g) => g.areas).length, KNOWN_AREAS.length, 'no area lost');
});

test('diff and equality', () => {
  assert.deepEqual(diffPerms(['a:view'], ['a:view', 'b:view']), { added: ['b:view'], removed: [] });
  assert.equal(samePerms(['a:view', 'b:view'], ['b:view', 'a:view']), true);
});

test('role field validation', () => {
  assert.deepEqual(validateRole({ key: 'content-lead', name: 'Content lead', description: '' }, { isNew: true }), {});
  assert.ok(validateRole({ key: 'ab', name: 'x', description: '' }, { isNew: true }).key);
  assert.ok(validateRole({ key: 'Has Space', name: 'x', description: '' }, { isNew: true }).key);
  assert.ok(validateRole({ key: 'admin', name: 'x', description: '' }, { isNew: true, takenKeys: ['admin'] }).key);
  assert.ok(validateRole({ key: 'abc', name: '', description: '' }, { isNew: true }).name);
  assert.ok(validateRole({ key: 'abc', name: 'x'.repeat(41), description: '' }).name);
  assert.ok(validateRole({ key: 'abc', name: 'ok', description: 'x'.repeat(161) }).description);
  assert.equal(slugify('  Content Lead! '), 'content-lead');
  assert.deepEqual(escalationList({ body: { permissions: ['push:edit'] } }), ['push:edit']);
  assert.deepEqual(escalationList({}), []);
});

test('preview is built from the module registry', () => {
  const none = previewModules([], MODULES);
  assert.equal(none.count, 0);
  const viewer = previewModules(['overview:view', 'releases:view', 'approvals:view'], MODULES);
  const ids = viewer.sections.flatMap((s) => s.items.map((i) => i.id));
  assert.ok(ids.includes('Overview') && ids.includes('App releases') && ids.includes('Approvals') && ids.includes('Visitors'));
  assert.ok(!ids.includes('Users') && !ids.includes('Audit log'));
  assert.ok(viewer.sections.flatMap((s) => s.items).every((i) => i.mode === 'view'));
  const lead = previewModules(['content:edit', 'audit:view'], MODULES);
  const modeOf = (id) => lead.sections.flatMap((s) => s.items).find((i) => i.id === id)?.mode;
  assert.equal(modeOf('Temples'), 'edit');
  assert.equal(modeOf('Audit log'), 'view');
  assert.equal(modeOf('Bookings'), undefined);
  assert.deepEqual(notableAbilities(['content:edit', 'audit:view']), ['Edit app content, including the Home layout', 'Read the audit log']);
  assert.ok(notableAbilities(['roles:edit'])[0].startsWith('Create roles'));
  assert.deepEqual(notableAbilities([]), []);
  assert.equal(notableAbilities(['devotees:edit']).filter((t) => t.startsWith('See devotee')).length, 1);
});
