/**
 * Home layout v2 (docs/HOME_LAYOUT.md): parsing, the block filter, text and link
 * resolution, the cache reader, and the parity guard for the bundled default.
 *
 *   node --test src/features/home/lib/layout.test.mjs
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
const home = path.join(here, '..');

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

const L = load(path.join(here, 'layout.ts'));
const { BLOCK_META, SOURCE_AUTH, SHELF_SOURCES, isSourceKey, metaFor } = load(path.join(here, 'block-meta.ts'));
const A = load(path.join(here, 'audience.ts'));
const { readCache, serialiseCache, layoutCacheKey, legacyLayoutCacheKey } = load(path.join(here, 'layout-cache.ts'));

const NOW = Date.parse('2026-10-08T10:00:00Z');
const ctx = (over = {}) => ({ now: NOW, lang: 'en', flags: {}, appVersion: '1.0.0', ...over });
const raw = (over = {}) => ({ id: 'b1', type: 'share', ...over });
const doc = (...blocks) => ({ schemaVersion: 1, blocks });
const ids = (blocks) => blocks.map((b) => b.id);
// A v1 document (`{blocks}`) parses as the default layout; P gives its blocks the old way.
const P = (d) => {
  const set = L.parseLayout(d);
  return set && { ...set, blocks: set.layouts[0]?.blocks };
};
const visible = (blocks, c) => ids(L.visibleBlocks(P(doc(...blocks)).blocks, c));

/* ───────────────────────────────────────────────────────── parseLayout ── */

test('parseLayout: v2 needs layouts[]; a v1 {blocks} document is wrapped as the default layout', () => {
  assert.equal(L.parseLayout(null), null);
  assert.equal(L.parseLayout('x'), null);
  assert.equal(L.parseLayout({ schemaVersion: 3, layouts: [] }), null);
  assert.equal(L.parseLayout({ schemaVersion: 2 }), null);
  assert.equal(L.parseLayout({ schemaVersion: 2, blocks: [] }), null);
  assert.equal(L.parseLayout({ schemaVersion: 1 }), null);
  const v1 = L.parseLayout({ schemaVersion: 1, version: 4, blocks: [raw()] });
  assert.equal(v1.schemaVersion, 2);
  assert.equal(v1.version, 4);
  assert.equal(v1.layouts.length, 1);
  assert.equal(v1.layouts[0].id, 'default');
  assert.deepEqual(v1.layouts[0].audience, []);
  assert.deepEqual(ids(v1.layouts[0].blocks), ['b1']);
  assert.deepEqual(L.parseLayout({ schemaVersion: 2, layouts: [] }).layouts, []);
});

test('parseLayout: drops malformed and duplicate blocks, normalises the rest', () => {
  const out = P(doc(raw(), raw(), { type: 'share' }, 7, null, raw({ id: 'b2', enabled: false, language: 'fr', props: 'no', data: { mode: 'weird' } })));
  assert.deepEqual(ids(out.blocks), ['b1', 'b2']);
  const b2 = out.blocks[1];
  assert.equal(b2.enabled, false);
  assert.equal(b2.language, 'all');
  assert.deepEqual(b2.props, {});
  assert.equal(b2.data, null);
  assert.equal(out.blocks[0].enabled, true);
  assert.equal(out.blocks[0].title, '');
});

test('parseLayout: data modes and limits', () => {
  const [a, b, c] = P(
    doc(
      raw({ id: 'a', data: { mode: 'source', source: 'poojas.upcoming', params: { temple: 'x' }, limit: 6.9 } }),
      raw({ id: 'b', data: { mode: 'source', source: 'poojas.upcoming', limit: -3 } }),
      raw({ id: 'c', data: { mode: 'inline', items: [{ title: 'T' }, 5, null] } }),
    ),
  ).blocks;
  assert.deepEqual(a.data, { mode: 'source', source: 'poojas.upcoming', params: { temple: 'x' }, limit: 6 });
  assert.equal(b.data.limit, undefined);
  assert.deepEqual(b.data.params, {});
  assert.equal(c.data.items.length, 1);
  assert.equal(c.data.items[0].title, 'T');
  assert.equal(c.data.items[0].liveBadge, false);
});

/* ───────────────────────────────────────────────────── visibleBlocks ── */

test('visibleBlocks: enabled, window, language', () => {
  const blocks = [
    raw({ id: 'on' }),
    raw({ id: 'off', enabled: false }),
    raw({ id: 'future', startsAt: '2026-11-01T00:00:00Z' }),
    raw({ id: 'expired', endsAt: '2026-10-01T00:00:00Z' }),
    raw({ id: 'now', startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-10-09T00:00:00Z' }),
    raw({ id: 'hi', language: 'hi' }),
    raw({ id: 'en', language: 'en' }),
  ];
  assert.deepEqual(visible(blocks, ctx()), ['on', 'now', 'en']);
  assert.deepEqual(visible(blocks, ctx({ lang: 'hi' })), ['on', 'now', 'hi']);
});

test('visibleBlocks: a flag hides a block only when KNOWN false', () => {
  const blocks = [raw({ id: 'f', flag: 'events' })];
  assert.deepEqual(visible(blocks, ctx({ flags: { events: false } })), []);
  assert.deepEqual(visible(blocks, ctx({ flags: { events: true } })), ['f']);
  assert.deepEqual(visible(blocks, ctx({ flags: {} })), ['f']);
});

test('visibleBlocks: unknown type skipped; app older than the type requires skipped', () => {
  const blocks = [raw({ id: 'k' }), raw({ id: 'future-type', type: 'hologram' }), raw({ id: 'proto', type: '__proto__' })];
  assert.deepEqual(visible(blocks, ctx()), ['k']);
  assert.deepEqual(visible(blocks, ctx({ appVersion: '0.9.9' })), []);
  assert.deepEqual(visible(blocks, ctx({ appVersion: '1.0.0' })), ['k']);
  assert.deepEqual(visible(blocks, ctx({ appVersion: '2.3.1' })), ['k']);
});

test('compareVersions', () => {
  assert.ok(L.compareVersions('1.2.10', '1.2.9') > 0);
  assert.ok(L.compareVersions('1.0', '1.0.0') === 0);
  assert.ok(L.compareVersions('0.9.9', '1.0.0') < 0);
  assert.ok(L.compareVersions('x', '1.0.0') < 0);
});

/* ───────────────────────────────────────────────────────── texts/items ── */

test('blockText / propText: Hindi only when reading Hindi and written', () => {
  const [b] = P(
    doc(raw({ title: 'Hello', titleHi: 'नमस्ते', subtitle: 'Sub', subtitleHi: '  ', props: { placeholder: 'Find', placeholderHi: 'खोजें' } })),
  ).blocks;
  assert.equal(L.blockText(b, 'title', false), 'Hello');
  assert.equal(L.blockText(b, 'title', true), 'नमस्ते');
  assert.equal(L.blockText(b, 'subtitle', true), 'Sub');
  assert.equal(L.propText(b, 'placeholder', true), 'खोजें');
  assert.equal(L.propText(b, 'placeholder', false), 'Find');
  assert.equal(L.propText(b, 'missing', true), '');
});

test('propNum clamps; propStr reads strings', () => {
  const [b] = P(doc(raw({ props: { height: 500, columns: 'x', kind: 'html' } }))).blocks;
  assert.equal(L.propNum(b, 'height', 16, 4, 96), 96);
  assert.equal(L.propNum(b, 'columns', 3), 3);
  assert.equal(L.propNum(b, 'nope', 7), 7);
  assert.equal(L.propStr(b, 'kind'), 'html');
  assert.equal(L.propStr(b, 'height'), '');
});

test('inlineItems: flag-hidden removed, Hindi chosen, empty items dropped, action resolved', () => {
  const [b] = P(
    doc(
      raw({
        id: 'g',
        type: 'quick_grid',
        data: {
          mode: 'inline',
          items: [
            { title: 'Live', titleHi: 'लाइव', flag: 'liveDarshan', action: { type: 'live', ref: '' } },
            { title: 'Chadhava', titleHi: '', action: { type: 'chadhava', ref: '' }, href: '/chadhava?x=1' },
            { title: '', image: '' },
            { title: 'Deity', deitySlug: 'shiva' },
          ],
        },
      }),
    ),
  ).blocks;
  const en = L.inlineItems(b, { liveDarshan: false }, false);
  assert.deepEqual(en.map((i) => i.title), ['Chadhava', 'Deity']);
  assert.equal(en[0].href, '/chadhava?x=1', 'a server href wins');
  const hi = L.inlineItems(b, {}, true);
  assert.deepEqual(hi.map((i) => i.title), ['लाइव', 'Chadhava', 'Deity']);
  assert.equal(hi[0].href, '/darshan');
  assert.equal(L.inlineItems({ ...b, data: null }, {}, false).length, 0);
});

test('actionHref: the contract table; unsafe values resolve to nothing', () => {
  const h = (type, ref = '', href) => L.actionHref({ type, ref }, href);
  assert.equal(h('pooja', 'a b'), '/pooja/a%20b');
  assert.equal(h('pooja'), '/poojas');
  assert.equal(h('chadhava', 'x'), '/chadhava/x');
  assert.equal(h('chadhava'), '/chadhava');
  assert.equal(h('temple', 'kashi'), '/poojas?temple=kashi');
  assert.equal(h('bhajan'), '/bhajan');
  assert.equal(h('astrologer'), '/astrologers');
  assert.equal(h('coins'), '/wallet');
  assert.equal(h('event', 'e1'), '/events/e1');
  assert.equal(h('events'), '/events');
  assert.equal(h('live'), '/darshan');
  assert.equal(h('live', 'ganga'), '/darshan/ganga');
  assert.equal(h('panchang'), '/panchang');
  assert.equal(h('horoscope'), '/horoscope');
  assert.equal(h('route', '/alarm'), '/alarm');
  assert.equal(h('route', '//evil.test'), '');
  assert.equal(h('route', 'alarm'), '');
  assert.equal(h('link', 'https://a.test'), 'https://a.test');
  assert.equal(h('link', 'http://a.test'), '');
  assert.equal(h('link', 'javascript:alert(1)'), '');
  assert.equal(h('none'), '');
  assert.equal(h('mystery'), '');
  assert.equal(L.actionHref(null), '');
  assert.equal(L.actionHref(null, '/x'), '/x');
});

test('sourceOf: the bound source if allowed, else the type default; params and limit', () => {
  const [a, b] = P(
    doc(
      raw({ id: 'a', data: { mode: 'source', source: 'events.upcoming', params: { tags: ['t1', 5] }, limit: 3 } }),
      raw({ id: 'b', data: { mode: 'source', source: 'bogus' } }),
    ),
  ).blocks;
  const allowed = ['events.mine', 'events.upcoming'];
  assert.equal(L.sourceOf(a, allowed), 'events.upcoming');
  assert.equal(L.sourceOf(b, allowed), 'events.mine');
  assert.equal(L.sourceOf({ ...a, data: null }, allowed), 'events.mine');
  assert.equal(L.sourceLimit(a), 3);
  assert.deepEqual(L.paramList(L.sourceParams(a), 'tags'), ['t1']);
  assert.deepEqual(L.paramList({ tags: 'x' }, 'tags'), ['x']);
  assert.deepEqual(L.paramList({}, 'tags'), []);
});

/* ───────────────────────────────────────────────────────────── cache ── */

test('readCache: round trip; anything invalid is null (so the default applies and no ETag is sent)', () => {
  const layout = L.parseLayout(doc(raw()));
  const back = readCache(serialiseCache(layout, 'W/"abc"'));
  assert.equal(back.etag, 'W/"abc"');
  assert.deepEqual(ids(back.layout.layouts[0].blocks), ['b1']);
  assert.equal(readCache(serialiseCache(layout, null)).etag, null);
  assert.equal(readCache(null), null);
  assert.equal(readCache(''), null);
  assert.equal(readCache('{not json'), null);
  assert.equal(readCache('[]'), null);
  assert.equal(readCache(JSON.stringify({ etag: 'x', layout: { schemaVersion: 9, layouts: [] } })), null);
  assert.equal(readCache(JSON.stringify({ etag: 'x', layout: { schemaVersion: 1, blocks: 'no' } })), null);
  assert.equal(readCache(JSON.stringify({ etag: 'x', layout: { schemaVersion: 2, layouts: 'no' } })), null);
  // The previous build's cache entry (a v1 document) is upgraded on read.
  assert.deepEqual(ids(readCache(JSON.stringify({ etag: 'e', layout: doc(raw()) })).layout.layouts[0].blocks), ['b1']);
  assert.equal(legacyLayoutCacheKey('en'), 'home.layout.v2.en');
  assert.equal(layoutCacheKey('hi'), 'home.layout.v3.hi');
});

/* ───────────────────────────────────── parity guard: the bundled default ── */

const defaultPath = path.join(home, 'constants', 'default-layout.json');
const defaultRaw = JSON.parse(fs.readFileSync(defaultPath, 'utf8'));
// The bundled file is the v2 set once the backend has written it; until then it is the v1 document.
const defaultBlocksRaw = defaultRaw.layouts ? defaultRaw.layouts.find((l) => l.id === 'default').blocks : defaultRaw.blocks;
const defaultSet = L.parseLayout(defaultRaw);
const defaultBlocks = defaultSet.layouts.find((l) => l.id === 'default').blocks;

test('default layout: parses to a set with a default layout, schemaVersion 2, unique ids, header+search first', () => {
  assert.ok(defaultSet, 'default-layout.json must parse');
  assert.equal(defaultSet.schemaVersion, 2);
  assert.ok(defaultRaw.schemaVersion === 2 || process.env.ALLOW_V1_DEFAULT, 'the bundled default must be the v2 document ({schemaVersion:2, layouts})');
  const def = defaultSet.layouts.find((l) => l.id === 'default');
  assert.ok(def && def.enabled && def.audience.length === 0 && !def.startsAt && !def.endsAt);
  assert.equal(defaultBlocks.length, defaultBlocksRaw.length, 'no block may be dropped by the parser');
  assert.equal(new Set(ids(defaultBlocks)).size, defaultBlocks.length);
  assert.deepEqual(defaultBlocks.slice(0, 2).map((b) => b.type), ['header', 'search']);
  assert.ok(defaultBlocks[0].enabled && defaultBlocks[1].enabled);
});

test('default layout: every block type is in the registry and every source in the resolver table', () => {
  const registry = fs.readFileSync(path.join(home, 'components', 'blocks', 'index.ts'), 'utf8');
  const resolvers = fs.readFileSync(path.join(home, 'hooks', 'use-sources.ts'), 'utf8');
  const table = resolvers.slice(resolvers.indexOf('export const SOURCES'));

  for (const l of defaultSet.layouts) {
    for (const tag of l.audience) assert.ok(A.isSegment(tag), `unknown layout audience "${tag}"`);
    for (const b of l.blocks) {
      assert.ok(metaFor(b.type), `unknown block type "${b.type}" (${b.id})`);
      assert.match(registry, new RegExp(`^\\s+${b.type}: \\w+,`, 'm'), `registry has no component for "${b.type}"`);
      for (const tag of b.audience) assert.ok(A.isSegment(tag), `unknown audience "${tag}" (${b.id})`);
      if (b.data?.mode === 'source') {
        assert.ok(isSourceKey(b.data.source), `unknown source "${b.data.source}" (${b.id})`);
        assert.ok(table.includes(`'${b.data.source}':`) || table.includes(`  ${b.data.source}:`), `no resolver for "${b.data.source}"`);
      }
    }
  }
});

test('registry and resolver table cover every declared type and source, nothing more', () => {
  const registry = fs.readFileSync(path.join(home, 'components', 'blocks', 'index.ts'), 'utf8');
  const keys = [...registry.slice(registry.indexOf('export const BLOCKS')).matchAll(/^\s+(\w+): \w+,/gm)].map((m) => m[1]);
  assert.deepEqual([...keys].sort(), Object.keys(BLOCK_META).sort());

  const resolvers = fs.readFileSync(path.join(home, 'hooks', 'use-sources.ts'), 'utf8');
  const table = resolvers.slice(resolvers.indexOf('export const SOURCES'), resolvers.indexOf('/** Resolve one source'));
  const sources = [...table.matchAll(/^\s+'?([\w.]+)'?: use\w+,/gm)].map((m) => m[1]);
  assert.deepEqual([...sources].sort(), Object.keys(SOURCE_AUTH).sort());
  for (const s of SHELF_SOURCES) assert.ok(isSourceKey(s));
});

test('default layout: every un-gated block is visible to a fresh offline app, and every link resolves', () => {
  const parsed = { blocks: defaultBlocks };
  const ungated = parsed.blocks.filter((b) => b.audience.length === 0);
  assert.equal(L.visibleBlocks(parsed.blocks, ctx()).length, ungated.length);
  // With every segment true, nothing is hidden by audience.
  assert.equal(L.visibleBlocks(parsed.blocks, ctx({ segments: A.SEGMENTS })).length, parsed.blocks.length);
  for (const b of parsed.blocks) {
    if (b.action && b.action.type !== 'none') assert.ok(L.blockHref(b), `block ${b.id}: action ${b.action.type} resolves to nothing`);
    if (b.data?.mode === 'inline') {
      for (const it of b.data.items) {
        if (it.action && it.action.type !== 'none') assert.ok(L.actionHref(it.action, it.href), `block ${b.id}: item "${it.title}" resolves to nothing`);
      }
    }
  }
  // A flag known off hides exactly the flagged blocks.
  const flagged = parsed.blocks.filter((b) => b.flag).map((b) => b.id);
  assert.ok(flagged.length > 0);
  const hidden = ids(parsed.blocks).filter((id) => !ids(L.visibleBlocks(parsed.blocks, ctx({ segments: A.SEGMENTS, flags: { chadhava: false, astrologerCalls: false, bhajan: false } }))).includes(id));
  assert.ok(hidden.every((id) => flagged.includes(id)));
});

test('default layout: the app copy equals the catalog service copy (when the monorepo is present)', () => {
  const backend = path.resolve(home, '..', '..', '..', '..', 'backend', 'services', 'catalog', 'src', 'modules', 'home', 'default-layout.json');
  if (!fs.existsSync(backend)) return;
  assert.ok(fs.readFileSync(backend).equals(fs.readFileSync(defaultPath)), 'default-layout.json copies have drifted — change both together');
});

test('default layout: includes the events.mine block gated on in_event (once the v2 file is in place)', () => {
  if (defaultRaw.schemaVersion !== 2) return;
  const ev = defaultBlocks.find((b) => b.type === 'events');
  assert.ok(ev, 'the default has an events block');
  assert.deepEqual(ev.audience, ['in_event']);
  assert.equal(ev.data.source, 'events.mine');
});

/* ─────────────────────────────────────── v2.1: layouts, audience, items ── */

const lay = (id, over = {}) => ({ id, name: id, enabled: true, audience: [], startsAt: null, endsAt: null, blocks: [raw({ id: `${id}-b` })], ...over });
const set = (...layouts) => ({ schemaVersion: 2, layouts });
const FALLBACK = { id: 'default', name: 'bundled', enabled: true, audience: [], startsAt: null, endsAt: null, blocks: [] };
const pick = (s, segments = [], now = NOW) => L.selectLayout(L.parseLayout(s), { now, segments }, FALLBACK).id;

test('parseLayout v2: layouts keep audience and schedule; malformed/duplicate layouts dropped; capped at 8', () => {
  const out = L.parseLayout(set(lay('a', { audience: ['new_user', 7, ''], startsAt: '2026-10-11T00:00:00Z', endsAt: '' }), lay('a'), { id: 'x' }, 5, lay('d')));
  assert.deepEqual(out.layouts.map((l) => l.id), ['a', 'd']);
  assert.deepEqual(out.layouts[0].audience, ['new_user']);
  assert.equal(out.layouts[0].startsAt, '2026-10-11T00:00:00Z');
  assert.equal(out.layouts[0].endsAt, null);
  const many = L.parseLayout(set(...Array.from({ length: 12 }, (_, i) => lay(`l${i}`))));
  assert.equal(many.layouts.length, 8);
});

test('parseLayout: block audience, item enabled/badgeUntil', () => {
  const [b] = P(doc(raw({ audience: ['has_booking', null], data: { mode: 'inline', items: [{ title: 'A', badge: 'new', badgeUntil: '2026-10-31T00:00:00Z' }, { title: 'B', enabled: false }] } }))).blocks;
  assert.deepEqual(b.audience, ['has_booking']);
  assert.equal(b.data.items[0].enabled, true);
  assert.equal(b.data.items[0].badgeUntil, '2026-10-31T00:00:00Z');
  assert.equal(b.data.items[1].enabled, false);
  assert.equal(b.data.items[1].badgeUntil, null);
  assert.deepEqual(P(doc(raw())).blocks[0].audience, []);
});

test('selectLayout: first match in array order wins (priority)', () => {
  const s = set(lay('diwali', { audience: ['new_user'] }), lay('navratri'), lay('default'));
  assert.equal(pick(s, ['new_user']), 'diwali');
  assert.equal(pick(s, []), 'navratri'); // diwali needs new_user, navratri is for everyone
  assert.equal(pick(set(lay('navratri'), lay('diwali', { audience: ['new_user'] }), lay('default')), ['new_user']), 'navratri');
});

test('selectLayout: disabled and out-of-schedule layouts are skipped (re-checked on the device)', () => {
  const s = set(lay('off', { enabled: false }), lay('future', { startsAt: '2026-10-29T00:00:00Z' }), lay('past', { endsAt: '2026-10-01T00:00:00Z' }), lay('now', { startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-10-19T00:00:00Z' }), lay('default'));
  assert.equal(pick(s), 'now');
  assert.equal(pick(s, [], Date.parse('2026-10-20T00:00:00Z')), 'default');
  assert.equal(pick(s, [], Date.parse('2026-10-30T00:00:00Z')), 'future');
});

test('selectLayout: no match -> the layout with id default -> the bundled one', () => {
  assert.equal(pick(set(lay('g', { audience: ['lapsed'] }), lay('default', { audience: ['lapsed'] }))), 'default'); // default by id even if mis-targeted
  assert.equal(pick(set(lay('g', { audience: ['lapsed'] }))), 'default'); // bundled fallback id
  assert.equal(L.selectLayout(L.parseLayout(set(lay('g', { audience: ['lapsed'] }))), { now: NOW, segments: [] }, FALLBACK).name, 'bundled');
  assert.equal(L.selectLayout(null, { now: NOW, segments: [] }, FALLBACK), FALLBACK);
  assert.equal(L.selectLayout(L.parseLayout(set()), { now: NOW, segments: new Set() }, FALLBACK), FALLBACK);
});

test('selectLayout: an unknown audience tag never matches; a known one beside it still can', () => {
  assert.equal(pick(set(lay('future', { audience: ['vip'] }), lay('default')), ['new_user']), 'default');
  assert.equal(pick(set(lay('mix', { audience: ['vip', 'new_user'] }), lay('default')), ['new_user']), 'mix');
  assert.equal(pick(set(lay('mix', { audience: ['vip'] }), lay('default')), ['vip']), 'default');
});

test('matchesAudience: empty = everyone, ANY-of, Set or array, unknown = no', () => {
  assert.equal(A.matchesAudience([], []), true);
  assert.equal(A.matchesAudience(undefined, new Set()), true);
  assert.equal(A.matchesAudience(['in_event'], new Set()), false);
  assert.equal(A.matchesAudience(['in_event', 'lapsed'], new Set(['lapsed'])), true);
  assert.equal(A.matchesAudience(['in_event'], ['in_event']), true);
  assert.equal(A.matchesAudience(['mystery'], new Set(['mystery'])), false);
});

test('visibleBlocks: block audience gates; blocks without audience are unaffected', () => {
  const blocks = [raw({ id: 'a' }), raw({ id: 'b', audience: ['in_event'] }), raw({ id: 'c', audience: ['nope'] })];
  assert.deepEqual(visible(blocks, ctx()), ['a']);
  assert.deepEqual(visible(blocks, ctx({ segments: new Set(['in_event']) })), ['a', 'b']);
  assert.deepEqual(visible(blocks, ctx({ segments: ['nope'] })), ['a']);
});

test('segment new_user: created at most 7 days ago; unknown = not new', () => {
  const day = 86_400_000;
  assert.equal(A.isNewUser(new Date(NOW - 2 * day).toISOString(), NOW), true);
  assert.equal(A.isNewUser(new Date(NOW - 7 * day).toISOString(), NOW), true); // boundary inclusive
  assert.equal(A.isNewUser(new Date(NOW - 7 * day - 1).toISOString(), NOW), false);
  assert.equal(A.isNewUser(new Date(NOW + 3600_000).toISOString(), NOW), true); // small clock skew
  assert.equal(A.isNewUser(new Date(NOW + 3 * day).toISOString(), NOW), false);
  for (const bad of [null, undefined, '', 'yesterday', {}, NaN]) assert.equal(A.isNewUser(bad, NOW), false);
});

test('segment lapsed: last open more than 14 days ago; never/unreadable = not lapsed', () => {
  const day = 86_400_000;
  assert.equal(A.isLapsed(new Date(NOW - 15 * day).toISOString(), NOW), true);
  assert.equal(A.isLapsed(new Date(NOW - 14 * day).toISOString(), NOW), false); // exactly 14 days is not "more than"
  assert.equal(A.isLapsed(new Date(NOW - 14 * day - 1).toISOString(), NOW), true);
  assert.equal(A.isLapsed(new Date(NOW - day).toISOString(), NOW), false);
  assert.equal(A.isLapsed(NOW - 30 * day, NOW), true);
  for (const bad of [null, undefined, '', 'garbage']) assert.equal(A.isLapsed(bad, NOW), false);
});

test('segment has_booking / in_event: any non-cancelled booking, any unfinished event; unknown data = no', () => {
  assert.equal(A.hasActiveBooking([{ status: 'cancelled' }]), false);
  assert.equal(A.hasActiveBooking([{ status: 'cancelled' }, { status: 'performed' }]), true);
  assert.equal(A.hasActiveBooking([{ status: 'booked' }]), true);
  for (const bad of [null, undefined, [], 'x']) assert.equal(A.hasActiveBooking(bad), false);
  assert.equal(A.inActiveEvent([{ status: 'ended' }]), false);
  assert.equal(A.inActiveEvent([{ status: 'ended' }, { status: 'live' }]), true);
  assert.equal(A.inActiveEvent([{ status: 'registration_open' }]), true);
  for (const bad of [null, undefined, [], {}]) assert.equal(A.inActiveEvent(bad), false);
});

test('audienceTagsIn: every tag any layout or block names', () => {
  const s = L.parseLayout(set(lay('a', { audience: ['new_user'], blocks: [raw({ audience: ['in_event'] })] }), lay('default')));
  assert.deepEqual([...L.audienceTagsIn(s)].sort(), ['in_event', 'new_user']);
  assert.equal(L.audienceTagsIn(null).size, 0);
});

test('items: enabled:false is never drawn; badge disappears after badgeUntil but the item stays', () => {
  const block = P(
    doc(
      raw({
        data: {
          mode: 'inline',
          items: [
            { title: 'Shown', badge: 'new', badgeUntil: '2026-10-31T00:00:00Z' },
            { title: 'Hidden', enabled: false },
            { title: 'Expired', badge: 'special', badgeUntil: '2026-10-01T00:00:00Z' },
            { title: 'Forever', badge: 'soon' },
          ],
        },
      }),
    ),
  ).blocks[0];
  const items = L.inlineItems(block, {}, false, NOW);
  assert.deepEqual(items.map((i) => i.title), ['Shown', 'Expired', 'Forever']);
  assert.deepEqual(items.map((i) => i.badge), ['new', '', 'soon']);
  assert.equal(L.badgeFor({ badge: 'new', badgeUntil: 'garbage' }, NOW), 'new');
  assert.equal(L.badgeFor({ badge: '', badgeUntil: null }, NOW), '');
});

test('quick_grid props: columns 3|4|5 (default 4), tileStyle icon|image|pill (default icon)', () => {
  const b = (props) => P(doc(raw({ type: 'quick_grid', props }))).blocks[0];
  assert.equal(L.columnsOf(b({})), 4);
  assert.equal(L.columnsOf(b({ columns: 3 })), 3);
  assert.equal(L.columnsOf(b({ columns: 5 })), 5);
  for (const bad of [2, 6, '5', null, 4.5]) assert.equal(L.columnsOf(b({ columns: bad })), 4);
  assert.equal(L.tileStyleOf(b({})), 'icon');
  assert.equal(L.tileStyleOf(b({ tileStyle: 'image' })), 'image');
  assert.equal(L.tileStyleOf(b({ tileStyle: 'pill' })), 'pill');
  assert.equal(L.tileStyleOf(b({ tileStyle: 'hex' })), 'icon');
});

test('live.now is a known, public shelf source', () => {
  assert.ok(isSourceKey('live.now'));
  assert.equal(SOURCE_AUTH['live.now'], false);
  assert.ok(SHELF_SOURCES.includes('live.now'));
});
