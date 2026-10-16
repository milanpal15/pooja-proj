import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSections, filterRecords, pushRecent, rankModules } from './palette.js';
import { MODULES, GROUPS } from './registry.js';
import { KNOWN_AREA_KEYS } from '../access/areas.js';
import { buildHash, resolveRoute, splitHash } from './route.js';

const r = (h) => resolveRoute(h, MODULES, GROUPS);

test('registry integrity', () => {
  assert.equal(new Set(MODULES.map((m) => m.id)).size, MODULES.length, 'ids unique');
  assert.equal(new Set(MODULES.map((m) => m.route)).size, MODULES.length, 'routes unique');
  for (const m of MODULES) {
    assert.ok(m.title && m.route.startsWith('/') && m.breadcrumb.length >= 1, m.id);
    assert.ok([].concat(m.area).length > 0, `${m.id} has an area`);
    for (const a of [].concat(m.area)) assert.ok(KNOWN_AREA_KEYS.includes(a), `${m.id}: unknown area ${a}`);
    if (m.group) assert.ok(GROUPS.some((g) => g.key === m.group), m.id);
    assert.equal(m.breadcrumb.at(-1), m.title);
  }
  assert.equal(MODULES.length, 32 + 4, 'the 32 existing tabs plus 4 new modules');
});

test('hash parsing and building', () => {
  assert.deepEqual(splitHash('#/a/b?x=1&y=a%20b'), { path: '/a/b', query: { x: '1', y: 'a b' } });
  assert.equal(buildHash('/people/users', ['a b'], { q: 'x y' }), '#/people/users/a%20b?q=x%20y');
  assert.equal(buildHash('/people/users', [], {}), '#/people/users');
});

test('new routes resolve with a record id', () => {
  const x = r('#/admin/roles/content-lead');
  assert.equal(x.kind, 'module');
  assert.equal(x.module.id, 'Roles & permissions');
  assert.deepEqual(x.rest, ['content-lead']);
  assert.equal(x.legacy, false);
  assert.equal(r('#/PEOPLE/Users').module.id, 'Users');
});

test('every old #Tab link still resolves to its module', () => {
  for (const m of MODULES) {
    const x = r(`#${encodeURIComponent(m.id)}`);
    assert.equal(x.kind, 'module', m.id);
    assert.equal(x.module.id, m.id);
    assert.equal(x.legacy, true);
    assert.equal(x.canonical, `#${m.route}`);
  }
  assert.equal(r('#home layout').module.id, 'Home layout', 'case-insensitive');
});

test('empty hash is Overview; group alone and unknown are handled', () => {
  assert.equal(r('').module.id, 'Overview');
  assert.equal(r('#/').module.id, 'Overview');
  assert.equal(r('#/people').kind, 'group');
  assert.equal(r('#/nope/nothing').kind, 'notfound');
  assert.equal(r('#Nonexistent').kind, 'notfound');
});

test('palette ranking', () => {
  const ids = (q) => rankModules(MODULES, q).map((m) => m.id);
  assert.equal(ids('users')[0], 'Users');
  assert.equal(ids('app rel')[0], 'App releases');
  assert.equal(ids('audit')[0], 'Audit log');
  assert.ok(ids('version').includes('App releases'), 'keywords');
  assert.ok(ids('hl').includes('Home layout'), 'subsequence');
  assert.deepEqual(ids('zzzzqq'), []);
  assert.equal(ids('tem')[0], 'Temples');
});

test('palette sections, records and recents', () => {
  const s = buildSections({ query: '', modules: MODULES, recents: [] });
  assert.equal(s[0].key, 'modules');
  const withRecent = buildSections({ query: '', modules: MODULES, recents: [{ key: 'm:Users', kind: 'module', title: 'Users' }] });
  assert.equal(withRecent[0].key, 'recent');
  const hits = filterRecords([{ name: 'Priya Rao', contact: '••4821' }, { name: 'Asha' }], 'priya', ['name', 'contact']);
  assert.equal(hits.length, 1);
  assert.deepEqual(filterRecords([], '', ['name']), []);
  const q = buildSections({ query: 'priya', modules: MODULES, recents: [], userHits: [{ key: 'u1', title: 'Priya' }] });
  assert.ok(q.some((x) => x.key === 'users'));
  const list = pushRecent(pushRecent([], { key: 'a' }), { key: 'b' });
  assert.deepEqual(pushRecent(list, { key: 'a' }).map((x) => x.key), ['a', 'b']);
});
