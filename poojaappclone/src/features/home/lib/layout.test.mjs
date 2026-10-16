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
const { readCache, serialiseCache, layoutCacheKey } = load(path.join(here, 'layout-cache.ts'));

const NOW = Date.parse('2026-10-08T10:00:00Z');
const ctx = (over = {}) => ({ now: NOW, lang: 'en', flags: {}, appVersion: '1.0.0', ...over });
const raw = (over = {}) => ({ id: 'b1', type: 'share', ...over });
const doc = (...blocks) => ({ schemaVersion: 1, blocks });
const ids = (blocks) => blocks.map((b) => b.id);
const visible = (blocks, c) => ids(L.visibleBlocks(L.parseLayout(doc(...blocks)).blocks, c));

/* ───────────────────────────────────────────────────────── parseLayout ── */

test('parseLayout: schemaVersion must be 1 and blocks an array', () => {
  assert.equal(L.parseLayout(null), null);
  assert.equal(L.parseLayout('x'), null);
  assert.equal(L.parseLayout({ schemaVersion: 2, blocks: [] }), null);
  assert.equal(L.parseLayout({ schemaVersion: 1 }), null);
  assert.deepEqual(L.parseLayout({ schemaVersion: 1, blocks: [] }).blocks, []);
});

test('parseLayout: drops malformed and duplicate blocks, normalises the rest', () => {
  const out = L.parseLayout(doc(raw(), raw(), { type: 'share' }, 7, null, raw({ id: 'b2', enabled: false, language: 'fr', props: 'no', data: { mode: 'weird' } })));
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
  const [a, b, c] = L.parseLayout(
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
  const [b] = L.parseLayout(
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
  const [b] = L.parseLayout(doc(raw({ props: { height: 500, columns: 'x', kind: 'html' } }))).blocks;
  assert.equal(L.propNum(b, 'height', 16, 4, 96), 96);
  assert.equal(L.propNum(b, 'columns', 3), 3);
  assert.equal(L.propNum(b, 'nope', 7), 7);
  assert.equal(L.propStr(b, 'kind'), 'html');
  assert.equal(L.propStr(b, 'height'), '');
});

test('inlineItems: flag-hidden removed, Hindi chosen, empty items dropped, action resolved', () => {
  const [b] = L.parseLayout(
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
  const [a, b] = L.parseLayout(
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
  assert.deepEqual(ids(back.layout.blocks), ['b1']);
  assert.equal(readCache(serialiseCache(layout, null)).etag, null);
  assert.equal(readCache(null), null);
  assert.equal(readCache(''), null);
  assert.equal(readCache('{not json'), null);
  assert.equal(readCache('[]'), null);
  assert.equal(readCache(JSON.stringify({ etag: 'x', layout: { schemaVersion: 9, blocks: [] } })), null);
  assert.equal(readCache(JSON.stringify({ etag: 'x', layout: { schemaVersion: 1, blocks: 'no' } })), null);
  assert.equal(layoutCacheKey('hi'), 'home.layout.v2.hi');
});

/* ───────────────────────────────────── parity guard: the bundled default ── */

const defaultPath = path.join(home, 'constants', 'default-layout.json');
const defaultRaw = JSON.parse(fs.readFileSync(defaultPath, 'utf8'));

test('default layout: parses, schemaVersion 1, unique ids', () => {
  assert.equal(defaultRaw.schemaVersion, 1);
  const parsed = L.parseLayout(defaultRaw);
  assert.ok(parsed, 'default-layout.json must parse');
  assert.equal(parsed.blocks.length, defaultRaw.blocks.length, 'no block may be dropped by the parser');
  assert.equal(new Set(ids(parsed.blocks)).size, parsed.blocks.length);
});

test('default layout: every block type is in the registry and every source in the resolver table', () => {
  const registry = fs.readFileSync(path.join(home, 'components', 'blocks', 'index.ts'), 'utf8');
  const resolvers = fs.readFileSync(path.join(home, 'hooks', 'use-sources.ts'), 'utf8');
  const table = resolvers.slice(resolvers.indexOf('export const SOURCES'));

  for (const b of defaultRaw.blocks) {
    assert.ok(metaFor(b.type), `unknown block type "${b.type}" (${b.id})`);
    assert.match(registry, new RegExp(`^\\s+${b.type}: \\w+,`, 'm'), `registry has no component for "${b.type}"`);
    if (b.data?.mode === 'source') {
      assert.ok(isSourceKey(b.data.source), `unknown source "${b.data.source}" (${b.id})`);
      assert.ok(table.includes(`'${b.data.source}':`) || table.includes(`  ${b.data.source}:`), `no resolver for "${b.data.source}"`);
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

test('default layout: every block is visible to a fresh offline app, and every link resolves', () => {
  const parsed = L.parseLayout(defaultRaw);
  const shown = L.visibleBlocks(parsed.blocks, ctx());
  assert.equal(shown.length, parsed.blocks.length);
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
  const hidden = ids(parsed.blocks).filter((id) => !ids(L.visibleBlocks(parsed.blocks, ctx({ flags: { chadhava: false, astrologerCalls: false, bhajan: false } }))).includes(id));
  assert.ok(hidden.every((id) => flagged.includes(id)));
});

test('default layout: the app copy equals the catalog service copy (when the monorepo is present)', () => {
  const backend = path.resolve(home, '..', '..', '..', '..', 'backend', 'services', 'catalog', 'src', 'modules', 'home', 'default-layout.json');
  if (!fs.existsSync(backend)) return;
  assert.ok(fs.readFileSync(backend).equals(fs.readFileSync(defaultPath)), 'default-layout.json copies have drifted — change both together');
});
