// Home layout v2 (docs/HOME_LAYOUT.md): registry, validation matrix, public view, admin routes, seed + migration.
// Needs a throwaway mongod (TEST_MONGODB_URI).
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { EDITOR, VIEWER, boot } from '../../test-kit.mjs';
import { HomeLayoutDraft, HomeLayoutVersion, HomeSection } from '../../models.js';
import { MAX_VERSIONS } from './layout.model.js';
import { loadDefaultLayout } from './layout.default.js';
import { createVersion } from './layout.store.js';
import { publicLayoutView, resolveAction } from './layout.public.js';
import { seedHomeLayout, shelfFromSection } from './layout.seed.js';
import { BLOCK_TYPES, ICONS, KNOWN_FLAGS, SOURCES, registryView } from './registry.js';
import { validateLayout } from './layout.validate.js';
import * as home from './index.js';
import { seedHome } from './home.seed.js';

const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const REPO = '../../../../../../';
const APP_DEFAULT = here(`${REPO}poojaappclone/src/features/home/constants/default-layout.json`);
const APP_ICONS = here(`${REPO}poojaappclone/src/components/ui/icon.tsx`);
const ENGAGEMENT_DEFAULTS = here(`${REPO}backend/services/engagement/src/defaults.js`);

const HOUR = 3_600_000;
const at = (h) => new Date(Date.now() + h * HOUR).toISOString();

/* A minimal VALID block of each type, and the doc around it. */
const base = (id, type, extra = {}) => ({ id, type, ...extra });
const src = (source, params = {}, extra = {}) => ({ mode: 'source', source, params, ...extra });
const item = (extra = {}) => ({ title: 'T', titleHi: 'ट', icon: 'diya', action: { type: 'pooja', ref: 'x' }, ...extra });
const VALID = {
  header: { props: { showWallet: false } },
  search: { props: { placeholder: 'p', placeholderHi: 'प' } },
  slider: { data: src('hero', {}, { limit: 8 }) },
  quick_grid: { props: { columns: 4 }, data: { mode: 'inline', items: [item()] } },
  shelf: { props: { layout: 'book2' }, data: src('poojas.upcoming', { temple: 'kashi-vishwanath' }) },
  deity_row: { data: src('deities') },
  promo: { props: { kind: 'html', html: '<b>hi</b>' }, data: { mode: 'inline', items: [item({ image: '/uploads/a.png' })] } },
  astrologer: { data: src('astrologers.online') },
  featured_pooja: { data: src('poojas.featured') },
  daily: { data: src('daily.today') },
  panchang: { data: src('panchang.today') },
  rashi_row: { data: src('horoscope.today') },
  temples_near: { data: src('temples.near_me') },
  next_seva: { data: src('bookings.next') },
  listen: { data: src('bhajans.featured') },
  events: { data: src('events.upcoming', { tags: ['garba'] }) },
  share: { props: { message: 'm', messageHi: 'म' } },
  html: { props: { html: '<p>x</p>' } },
  spacer: { props: { height: 24 } },
  fab: { props: { icon: 'music' }, title: 'Listen', action: { type: 'bhajan', ref: '' } },
};
const doc = (...blocks) => ({ schemaVersion: 1, blocks });
const bad = (d) => validateLayout(d).fields ?? null;
const one = (type, patch = {}) => doc({ ...base('b1', type, VALID[type]), ...patch });

/* ───────────────────────────────────────────── registry + parity (no database) ── */
describe('registry', () => {
  test('every block type has a valid example here and the registry lists them all', () => {
    assert.deepEqual(Object.keys(VALID).sort(), Object.keys(BLOCK_TYPES).sort());
    assert.equal(Object.keys(BLOCK_TYPES).length, 20);
    const v = registryView();
    assert.equal(v.blockTypes.length, 20);
    assert.equal(v.sources.length, 17);
    assert.deepEqual(v.sources.map((s) => s.key), ['hero', 'deities', 'poojas.featured', 'poojas.upcoming', 'chadhava.listings', 'temples.near_me', 'temples.saved', 'festivals.upcoming', 'events.upcoming', 'events.mine', 'bookings.next', 'astrologers.online', 'panchang.today', 'horoscope.today', 'bhajans.featured', 'knowledge', 'daily.today']);
    for (const k of ['actionTypes', 'icons', 'tones', 'flags']) assert.ok(v[k].length > 0, k);
    for (const bt of v.blockTypes) {
      for (const k of ['type', 'title', 'description', 'minAppVersion', 'props', 'data', 'icon']) assert.ok(k in bt, `${bt.type}.${k}`);
      assert.equal(bt.minAppVersion, '1.0.0');
      assert.ok(ICONS.includes(bt.icon), `${bt.type} icon`);
      for (const s of bt.data.sources ?? []) assert.ok(SOURCES.some((x) => x.key === s), `${bt.type} source ${s}`);
    }
  });

  test('icon names match the app, flag keys match engagement + the app flag type', async () => {
    if (existsSync(APP_ICONS)) {
      const t = readFileSync(APP_ICONS, 'utf8');
      const block = t.slice(t.indexOf('export type IconName'), t.indexOf(';', t.indexOf('export type IconName')));
      assert.deepEqual([...block.matchAll(/'(\w+)'/g)].map((m) => m[1]).sort(), [...ICONS].sort());
    }
    if (existsSync(ENGAGEMENT_DEFAULTS)) {
      const { DEFAULT_FLAGS } = await import(ENGAGEMENT_DEFAULTS);
      assert.deepEqual(DEFAULT_FLAGS.map((f) => f.key).sort(), KNOWN_FLAGS.filter((k) => k !== 'events').sort());
    }
  });
});

describe('default layout', () => {
  test('the catalog copy and the app copy are byte-identical', { skip: !existsSync(APP_DEFAULT) && 'app checkout missing' }, () => {
    assert.ok(readFileSync(here('./default-layout.json')).equals(readFileSync(APP_DEFAULT)));
  });

  test('it validates against the registry and normalises to itself (only absent `data` becomes null)', async () => {
    const raw = JSON.parse(readFileSync(here('./default-layout.json'), 'utf8'));
    const out = validateLayout(raw);
    assert.ok(out.doc, JSON.stringify(out.fields));
    assert.equal(out.doc.blocks.length, 16);
    const expected = structuredClone(raw);
    for (const b of expected.blocks) if (b.data === undefined) b.data = null;
    assert.deepEqual(out.doc, expected);
    assert.deepEqual(await loadDefaultLayout(), out.doc);
    assert.deepEqual(raw.blocks.map((b) => b.type), ['header', 'search', 'slider', 'astrologer', 'deity_row', 'daily', 'featured_pooja', 'quick_grid', 'next_seva', 'shelf', 'shelf', 'temples_near', 'rashi_row', 'listen', 'share', 'fab']);
  });
});

/* ──────────────────────────────────────────────── validation matrix (pure) ── */
describe('validation', () => {
  for (const type of Object.keys(VALID)) {
    test(`${type}: a valid block passes and is normalised`, () => {
      const out = validateLayout(one(type));
      assert.ok(out.doc, JSON.stringify(out.fields));
      const b = out.doc.blocks[0];
      assert.deepEqual([b.enabled, b.language, b.flag, b.tone, b.startsAt, b.endsAt, b.action === null || typeof b.action], [true, 'all', '', '', null, null, type === 'fab' ? 'object' : true]);
    });
  }

  test('unknown fields are rejected at every level, with the exact path', () => {
    assert.deepEqual(bad({ schemaVersion: 1, blocks: [], extra: 1 }), { extra: 'Unknown field.' });
    assert.deepEqual(bad(one('header', { nope: 1 })), { 'blocks.0.nope': 'Unknown field.' });
    assert.deepEqual(bad(one('header', { props: { showWallet: true, x: 1 } })), { 'blocks.0.props.x': 'Unknown field.' });
    assert.deepEqual(bad(one('quick_grid', { data: { mode: 'inline', items: [item({ href: '/x' })] } })), { 'blocks.0.data.items.0.href': 'Unknown field.' });
    assert.deepEqual(bad(one('quick_grid', { data: { mode: 'inline', items: [item({ action: { type: 'bhajan', ref: '', x: 1 } })] } })), { 'blocks.0.data.items.0.action.x': 'Unknown field.' });
    assert.deepEqual(bad(one('shelf', { data: { mode: 'source', source: 'knowledge', extra: 1 } })), { 'blocks.0.data.extra': 'Unknown field.' });
    assert.deepEqual(bad(one('shelf', { data: src('poojas.upcoming', { colour: 'red' }) })), { 'blocks.0.data.params.colour': 'Unknown field.' });
  });

  test('document level: schemaVersion, blocks list, limits, unique ids', () => {
    assert.ok(bad({ blocks: [] }).schemaVersion);
    assert.ok(bad({ schemaVersion: 2, blocks: [] }).schemaVersion);
    assert.ok(bad({ schemaVersion: 1 }).blocks);
    assert.ok(bad(null).body);
    assert.ok(bad([]).body);
    assert.ok(!bad(doc()), 'an empty layout is allowed');
    const sixty = Array.from({ length: 60 }, (_, i) => base(`s${i}`, 'spacer'));
    assert.ok(!bad(doc(...sixty)));
    assert.match(bad(doc(...sixty, base('s60', 'spacer'))).blocks, /At most 60/);
    assert.deepEqual(bad(doc(base('a', 'spacer'), base('a', 'spacer'))), { 'blocks.1.id': 'Duplicate id.' });
    assert.ok(bad(doc(base('', 'spacer')))['blocks.0.id']);
    assert.ok(bad(doc(base('has space', 'spacer')))['blocks.0.id']);
    assert.ok(bad(doc({ type: 'spacer' }))['blocks.0.id']);
    assert.ok(bad(doc('nope'))['blocks.0']);
  });

  test('block type: unknown, missing, inherited names', () => {
    assert.ok(bad(doc(base('a', 'carousel')))['blocks.0.type']);
    assert.ok(bad(doc({ id: 'a' }))['blocks.0.type']);
    assert.ok(bad(doc(base('a', 'constructor')))['blocks.0.type']);
    assert.ok(bad(doc(base('a', '__proto__')))['blocks.0.type']);
  });

  test('common fields: language, tone, flag, text, dates, enabled', () => {
    assert.ok(bad(one('spacer', { language: 'fr' }))['blocks.0.language']);
    assert.ok(!bad(one('spacer', { language: 'hi' })));
    assert.ok(bad(one('spacer', { tone: 'pink' }))['blocks.0.tone']);
    assert.ok(!bad(one('spacer', { tone: 'maroon' })));
    assert.ok(bad(one('spacer', { flag: 'has space' }))['blocks.0.flag']);
    assert.ok(!bad(one('spacer', { flag: 'someFutureFlag' })), 'an unknown flag key is allowed (it means shown)');
    assert.ok(bad(one('spacer', { enabled: 'yes' }))['blocks.0.enabled']);
    assert.ok(bad(one('spacer', { title: 'x'.repeat(161) }))['blocks.0.title']);
    assert.ok(!bad(one('spacer', { title: 'x'.repeat(160) })));
    assert.ok(bad(one('spacer', { subtitleHi: 5 }))['blocks.0.subtitleHi']);
    assert.ok(bad(one('spacer', { startsAt: 'tomorrow-ish' }))['blocks.0.startsAt']);
    assert.ok(bad(one('spacer', { startsAt: 5 }))['blocks.0.startsAt']);
    assert.deepEqual(bad(one('spacer', { startsAt: '2026-02-02T00:00:00Z', endsAt: '2026-02-01T00:00:00Z' })), { 'blocks.0.endsAt': 'Must be after startsAt.' });
    const ok = validateLayout(one('spacer', { startsAt: '2026-02-01T05:30:00+05:30', endsAt: '' })).doc.blocks[0];
    assert.deepEqual([ok.startsAt, ok.endsAt], ['2026-02-01T00:00:00.000Z', null]);
    assert.equal(validateLayout(one('spacer', { title: '  padded  ' })).doc.blocks[0].title, 'padded');
  });

  test('actions: types, route and link rules, refs', () => {
    const a = (action) => bad(one('fab', { action }));
    assert.ok(!a(null));
    assert.ok(a('bhajan')['blocks.0.action']);
    assert.ok(a({ type: 'teleport', ref: '' })['blocks.0.action.type']);
    assert.ok(a({ ref: '' })['blocks.0.action.type']);
    assert.ok(!a({ type: 'route', ref: '/poojas?x=1' }));
    assert.ok(a({ type: 'route', ref: 'poojas' })['blocks.0.action.ref']);
    assert.ok(a({ type: 'route', ref: '//evil.com' })['blocks.0.action.ref']);
    assert.ok(a({ type: 'route', ref: '' })['blocks.0.action.ref']);
    assert.ok(!a({ type: 'link', ref: 'https://example.com/a' }));
    assert.ok(a({ type: 'link', ref: 'http://example.com' })['blocks.0.action.ref']);
    assert.ok(a({ type: 'link', ref: 'javascript:alert(1)' })['blocks.0.action.ref']);
    assert.ok(a({ type: 'link', ref: '' })['blocks.0.action.ref']);
    assert.ok(a({ type: 'pooja', ref: 'a b' })['blocks.0.action.ref']);
    assert.ok(a({ type: 'pooja', ref: '../x' })['blocks.0.action.ref']);
    assert.ok(a({ type: 'pooja', ref: 'a.b-c_d' }) === null);
    assert.ok(a({ type: 'event', ref: 'x'.repeat(121) })['blocks.0.action.ref']);
    for (const t of ['pooja', 'chadhava', 'temple', 'bhajan', 'astrologer', 'coins', 'event', 'live', 'panchang', 'horoscope', 'events', 'none']) assert.ok(!a({ type: t, ref: '' }), t);
    assert.deepEqual(validateLayout(one('fab', { action: { type: 'none', ref: 'ignored' } })).doc.blocks[0].action, { type: 'none', ref: '' });
  });

  test('props: types, enums, ranges per block type', () => {
    assert.ok(bad(one('header', { props: { showWallet: 'yes' } }))['blocks.0.props.showWallet']);
    assert.ok(bad(one('search', { props: { placeholder: 5 } }))['blocks.0.props.placeholder']);
    assert.ok(bad(one('search', { props: { placeholder: 'x'.repeat(161) } }))['blocks.0.props.placeholder']);
    assert.ok(bad(one('quick_grid', { props: { columns: 5 } }))['blocks.0.props.columns']);
    assert.ok(bad(one('quick_grid', { props: { columns: '3' } }))['blocks.0.props.columns']);
    assert.ok(!bad(one('quick_grid', { props: { columns: 3 } })));
    assert.ok(bad(one('shelf', { props: { layout: 'masonry' } }))['blocks.0.props.layout']);
    for (const l of ['photo3', 'book2', 'list', 'grid4']) assert.ok(!bad(one('shelf', { props: { layout: l } })));
    assert.ok(bad(one('promo', { props: { kind: 'video' } }))['blocks.0.props.kind']);
    assert.ok(bad(one('spacer', { props: { height: 3 } }))['blocks.0.props.height']);
    assert.ok(bad(one('spacer', { props: { height: 97 } }))['blocks.0.props.height']);
    assert.ok(bad(one('spacer', { props: { height: 12.5 } }))['blocks.0.props.height']);
    assert.ok(!bad(one('spacer', { props: { height: 4 } })) && !bad(one('spacer', { props: { height: 96 } })));
    assert.ok(bad(one('fab', { props: { icon: 'rocket' } }))['blocks.0.props.icon']);
    assert.ok(bad(one('share', { props: { message: 5 } }))['blocks.0.props.message']);
    assert.ok(bad(one('slider', { props: { autoplay: true } }))['blocks.0.props.autoplay']);
    assert.ok(bad(one('header', { props: [] }))['blocks.0.props']);
  });

  test('html props are sanitised on save and capped at 20 KB', () => {
    const dirty = '<p onclick="x()">hi<script>alert(1)</script><a href="javascript:alert(1)">j</a></p>';
    for (const type of ['html', 'promo']) {
      const out = validateLayout(one(type, { props: { html: dirty, htmlHi: '<iframe src="https://e.com"></iframe>ok' } })).doc.blocks[0].props;
      assert.ok(!/script|onclick|javascript:|iframe/i.test(out.html + out.htmlHi), out.html);
      assert.match(out.html, /hi/);
    }
    assert.ok(!bad(one('html', { props: { html: 'a'.repeat(20 * 1024) } })));
    assert.ok(bad(one('html', { props: { html: 'a'.repeat(20 * 1024 + 1) } }))['blocks.0.props.html']);
    assert.ok(bad(one('html', { props: { htmlHi: 'é'.repeat(11 * 1024) } }))['blocks.0.props.htmlHi'], 'the cap is in bytes');
    assert.ok(bad(one('html', { props: { html: 5 } }))['blocks.0.props.html']);
  });

  test('data: types without data must have null; modes and sources are per type', () => {
    for (const type of ['header', 'search', 'share', 'html', 'spacer', 'fab']) {
      assert.ok(!bad(one(type, { data: null })), type);
      assert.ok(bad(one(type, { data: src('hero') }))['blocks.0.data'], `${type} has no data`);
    }
    assert.ok(bad(one('slider', { data: src('deities') }))['blocks.0.data.source']);
    assert.ok(!bad(one('slider', { data: { mode: 'inline', items: [item({ image: 'https://x.test/a.jpg' })] } })));
    assert.ok(bad(one('quick_grid', { data: src('hero') }))['blocks.0.data.mode'], 'quick_grid is inline only');
    assert.ok(bad(one('astrologer', { data: { mode: 'inline', items: [] } }))['blocks.0.data.mode']);
    assert.ok(bad(one('astrologer', { data: src('panchang.today') }))['blocks.0.data.source']);
    assert.ok(bad(one('events', { data: src('knowledge') }))['blocks.0.data.source']);
    assert.ok(!bad(one('events', { data: src('events.mine') })));
    assert.ok(bad(one('shelf', { data: src('hero') }))['blocks.0.data.source']);
    assert.ok(bad(one('shelf', { data: src('not.a.source') }))['blocks.0.data.source']);
    assert.ok(bad(one('shelf', { data: src(5) }))['blocks.0.data.source']);
    assert.ok(bad(one('shelf', { data: { mode: 'live' } }))['blocks.0.data.mode']);
    assert.ok(bad(one('shelf', { data: 'poojas.upcoming' }))['blocks.0.data']);
    for (const s of BLOCK_TYPES.shelf.data.sources) assert.ok(!bad(one('shelf', { data: src(s) })), s);
    assert.ok(!bad(one('deity_row', { data: { mode: 'inline', items: [item({ deitySlug: 'shiva' })] } })));
    assert.ok(bad(one('promo', { data: src('hero') }))['blocks.0.data.mode']);
  });

  test('source params and limit', () => {
    assert.ok(bad(one('shelf', { data: src('poojas.featured', { temple: 'x' }) }))['blocks.0.data.params.temple']);
    assert.ok(bad(one('shelf', { data: src('poojas.upcoming', { temple: 5 }) }))['blocks.0.data.params.temple']);
    assert.ok(bad(one('shelf', { data: src('poojas.upcoming', { temple: 'a b' }) }))['blocks.0.data.params.temple']);
    assert.ok(!bad(one('shelf', { data: src('chadhava.listings', { category: 'flowers' }) })));
    assert.ok(bad(one('events', { data: src('events.upcoming', { tags: 'garba' }) }))['blocks.0.data.params.tags']);
    assert.ok(bad(one('events', { data: src('events.upcoming', { tags: ['ok', 5] }) }))['blocks.0.data.params.tags.1']);
    assert.ok(bad(one('events', { data: src('events.upcoming', { tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }) }))['blocks.0.data.params.tags']);
    assert.ok(bad(one('events', { data: src('events.upcoming', 'x') }))['blocks.0.data.params']);
    for (const limit of [0, 21, 1.5, '6', -1]) assert.ok(bad(one('shelf', { data: src('knowledge', {}, { limit }) }))['blocks.0.data.limit'], String(limit));
    for (const limit of [1, 20]) assert.ok(!bad(one('shelf', { data: src('knowledge', {}, { limit }) })));
    assert.deepEqual(validateLayout(one('shelf', { data: { mode: 'source', source: 'knowledge' } })).doc.blocks[0].data, { mode: 'source', source: 'knowledge', params: {} });
  });

  test('inline items: count, fields, enums, images, icons', () => {
    const items = (n) => Array.from({ length: n }, () => item());
    assert.ok(!bad(one('shelf', { data: { mode: 'inline', items: items(24) } })));
    assert.match(bad(one('shelf', { data: { mode: 'inline', items: items(25) } }))['blocks.0.data.items'], /At most 24/);
    assert.ok(bad(one('promo', { data: { mode: 'inline', items: items(2) } }))['blocks.0.data.items'], 'promo takes one item');
    assert.ok(bad(one('shelf', { data: { mode: 'inline' } }))['blocks.0.data.items']);
    assert.ok(bad(one('shelf', { data: { mode: 'inline', items: ['x'] } }))['blocks.0.data.items.0']);
    const f = (extra) => bad(one('shelf', { data: { mode: 'inline', items: [item(extra)] } }));
    assert.ok(f({ title: 'x'.repeat(161) })['blocks.0.data.items.0.title']);
    assert.ok(f({ icon: 'rocket' })['blocks.0.data.items.0.icon']);
    assert.ok(!f({ icon: '' }));
    assert.ok(f({ badge: 'hot' })['blocks.0.data.items.0.badge']);
    for (const b of ['', 'new', 'soon', 'special']) assert.ok(!f({ badge: b }), b);
    assert.ok(f({ liveBadge: 'yes' })['blocks.0.data.items.0.liveBadge']);
    assert.ok(!f({ liveBadge: true }));
    assert.ok(f({ image: 'http://x.test/a.png' })['blocks.0.data.items.0.image']);
    assert.ok(f({ image: '/other/a.png' })['blocks.0.data.items.0.image']);
    assert.ok(f({ image: 'javascript:alert(1)' })['blocks.0.data.items.0.image']);
    assert.ok(!f({ image: '/uploads/6acf0a7fce86d1f7b8489916.png' }));
    assert.ok(f({ flag: 'no good' })['blocks.0.data.items.0.flag']);
    assert.ok(f({ action: { type: 'route', ref: 'x' } })['blocks.0.data.items.0.action.ref']);
  });

  test('every problem is reported at once, not just the first', () => {
    const f = bad(doc(base('a', 'nope'), base('b', 'shelf', { tone: 'pink', data: src('hero') }), base('b', 'spacer')));
    assert.deepEqual(Object.keys(f).sort(), ['blocks.0.type', 'blocks.1.data.source', 'blocks.1.tone', 'blocks.2.id']);
  });
});

/* ───────────────────────────────────────────────── action -> href resolution ── */
describe('href resolution', () => {
  test('every action type resolves to the contract’s route', () => {
    const r = (type, ref = '') => resolveAction({ type, ref });
    assert.equal(r('pooja', 'abhishek'), '/pooja/abhishek');
    assert.equal(r('chadhava', 'flowers'), '/chadhava/flowers');
    assert.equal(r('temple', 'kashi'), '/poojas?temple=kashi');
    assert.equal(r('bhajan'), '/bhajan');
    assert.equal(r('astrologer'), '/astrologers');
    assert.equal(r('coins'), '/wallet');
    assert.equal(r('event', 'garba'), '/events/garba');
    assert.equal(r('events'), '/events');
    assert.equal(r('live'), '/darshan');
    assert.equal(r('live', 'kashi'), '/darshan/kashi');
    assert.equal(r('panchang'), '/panchang');
    assert.equal(r('horoscope'), '/horoscope');
    assert.equal(r('route', '/temples'), '/temples');
    assert.equal(r('route', '//evil'), '');
    assert.equal(r('link', 'https://x.test/a'), 'https://x.test/a');
    assert.equal(r('link', 'http://x.test/a'), '');
    assert.equal(r('none'), '');
    assert.equal(resolveAction(null), '');
    // an empty ref opens the list screen
    assert.deepEqual([r('pooja'), r('temple'), r('chadhava'), r('event')], ['/poojas', '/temples', '/chadhava', '/events']);
    assert.equal(r('pooja', 'a b/c'), '/pooja/a%20b%2Fc');
  });
});

/* ───────────────────────────────────────────────── public view (pure) ── */
describe('public view', () => {
  const live = (blocks) => ({ version: 3, schemaVersion: 1, publishedAt: new Date('2026-01-01T00:00:00Z'), blocks });
  const mk = (id, extra = {}) => ({ ...validateLayout(doc(base(id, 'spacer'))).doc.blocks[0], ...extra });

  test('filters enabled, window and language; no lang = no language filtering', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const l = live([
      mk('on'), mk('off', { enabled: false }),
      mk('future', { startsAt: '2026-07-01T00:00:00.000Z' }), mk('past', { endsAt: '2026-05-01T00:00:00.000Z' }), mk('now', { startsAt: '2026-05-01T00:00:00.000Z', endsAt: '2026-07-01T00:00:00.000Z' }),
      mk('hi', { language: 'hi' }), mk('en', { language: 'en' }),
    ]);
    const ids = (lang) => publicLayoutView(l, { lang, now }).blocks.map((b) => b.id);
    assert.deepEqual(ids('en'), ['on', 'now', 'en']);
    assert.deepEqual(ids('hi'), ['on', 'now', 'hi']);
    assert.deepEqual(ids(undefined), ['on', 'now', 'hi', 'en']);
    assert.deepEqual(ids('fr'), ['on', 'now', 'hi', 'en']);
    const v = publicLayoutView(l, { now });
    assert.deepEqual([v.version, v.schemaVersion, v.publishedAt], [3, 1, '2026-01-01T00:00:00.000Z']);
  });

  test('actions and items carry an href; stored html is cleaned again', () => {
    const stored = {
      ...mk('b'), type: 'promo', action: { type: 'pooja', ref: 'abhishek' }, props: { kind: 'html', html: '<p onclick="x()">hi<script>x</script></p>', htmlHi: '' },
      data: { mode: 'inline', items: [{ ...item(), action: { type: 'event', ref: 'garba' } }, { ...item(), action: null }] },
    };
    const out = publicLayoutView(live([stored])).blocks[0];
    assert.deepEqual(out.action, { type: 'pooja', ref: 'abhishek', href: '/pooja/abhishek' });
    assert.deepEqual(out.data.items.map((i) => i.href), ['/events/garba', '']);
    assert.deepEqual(out.data.items[0].action, { type: 'event', ref: 'garba', href: '/events/garba' });
    assert.equal(out.data.items[1].action, null);
    assert.ok(!/script|onclick/.test(out.props.html), out.props.html);
  });
});

/* ───────────────────────────────────────────────────────── seed + migration ── */
describe('seed and migration', () => {
  let h;
  before(async () => { h = await boot('home_layout_seed'); });
  after(() => h.stop());

  test('a fresh database seeds the default as version 1 (draft = published), and re-seeding changes nothing', async () => {
    await home.seed();
    await home.seed();
    const vs = await HomeLayoutVersion.find().lean();
    assert.equal(vs.length, 1);
    assert.deepEqual([vs[0].version, vs[0].blockCount, vs[0].publishedBy], [1, 16, 'system']);
    assert.deepEqual(vs[0].blocks, (await loadDefaultLayout()).blocks);
    const d = await HomeLayoutDraft.findOne().lean();
    assert.deepEqual(d.blocks, vs[0].blocks);
    // and the legacy sections are still seeded, and still what /api/content serves
    assert.equal(await HomeSection.countDocuments(), 12);
    const content = await h.call('GET', '/public/content', { uid: 'u1' });
    assert.equal(content.body.home.sections.length > 0, true);
  });

  test('an existing database’s enabled custom/knowledge sections become shelves before `listen`, once', async () => {
    await HomeLayoutVersion.deleteMany({});
    await HomeLayoutDraft.deleteMany({});
    await HomeSection.deleteMany({});
    await seedHome();
    await HomeSection.updateOne({ key: 'ancestors' }, { enabled: false });
    await HomeSection.create({ key: 'empty-one', source: 'custom', title: 'No items', items: [] });
    await HomeSection.collection.insertOne({ key: 'weird', source: 'custom', order: 999, enabled: true, createdAt: new Date(), title: 'Weird', tone: 'gold', layout: 'list', footerLabel: 'More', footerHref: 'https://x.test/y', items: [{ title: 'A', icon: 'not-an-icon', badge: 'bogus', href: 'bhakti://x' }, { title: 'B', href: '/poojas' }] });
    await seedHomeLayout();
    await seedHomeLayout();
    const vs = await HomeLayoutVersion.find().lean();
    assert.equal(vs.length, 1);
    const shelves = vs[0].blocks.filter((b) => b.id.startsWith('m-'));
    assert.deepEqual(shelves.map((b) => b.id), ['m-pitru-paksha', 'm-books', 'm-knowledge', 'm-weird'], 'order = HomeSection.order; disabled and empty ones are left out');
    assert.ok(vs[0].blocks.findIndex((b) => b.id === 'm-weird') + 1 === vs[0].blocks.findIndex((b) => b.type === 'listen'), 'inserted just before listen');
    const by = Object.fromEntries(shelves.map((b) => [b.id, b]));
    assert.deepEqual([by['m-books'].type, by['m-books'].tone, by['m-books'].props, by['m-books'].title], ['shelf', 'gold', { layout: 'book2' }, 'Pooja & Paath Books']);
    assert.deepEqual(by['m-books'].data.items.map((i) => i.title), ['Aarti', 'Chalisa', 'Katha', 'Paath']);
    assert.deepEqual(by['m-books'].data.items[0].action, { type: 'route', ref: '/bhajan' });
    assert.deepEqual(by['m-knowledge'].data.items.map((i) => i.deitySlug), ['vishnu', 'shiva', 'ganesh']);
    assert.deepEqual([by['m-pitru-paksha'].startsAt, by['m-pitru-paksha'].endsAt], ['2026-09-25T18:30:00.000Z', '2026-10-10T18:29:59.000Z']);
    assert.deepEqual([by['m-pitru-paksha'].action, by['m-pitru-paksha'].actionLabel], [{ type: 'route', ref: '/festivals' }, 'See all dates']);
    assert.deepEqual([by['m-weird'].action, by['m-weird'].data.items.map((i) => [i.icon, i.badge, i.action])], [{ type: 'link', ref: 'https://x.test/y' }, [['', '', null], ['', '', { type: 'route', ref: '/poojas' }]]]);
    assert.ok(validateLayout({ schemaVersion: 1, blocks: vs[0].blocks }).doc, 'the migrated document validates');
    assert.equal((await HomeLayoutDraft.findOne().lean()).blocks.length, vs[0].blocks.length);
    // the legacy rows are untouched (/api/content home.sections is unchanged)
    assert.equal(await HomeSection.countDocuments(), 14);
  });

  test('shelfFromSection skips a section with nothing to show', () => {
    assert.equal(shelfFromSection({ key: 'x', items: [] }), null);
    assert.equal(shelfFromSection({ key: 'x' }), null);
  });

  test('a missing draft is recreated from the live version without touching versions', async () => {
    await HomeLayoutDraft.deleteMany({});
    await seedHomeLayout();
    assert.equal(await HomeLayoutVersion.countDocuments(), 1);
    assert.equal(await HomeLayoutDraft.countDocuments(), 1);
  });
});

/* ──────────────────────────────────────────────────────────────── HTTP ── */
describe('HTTP', () => {
  let h;
  before(async () => { h = await boot('home_layout_http'); await home.seed(); });
  after(() => h.stop());

  const get = (lang) => h.call('GET', `/public/home${lang ? `?lang=${lang}` : ''}`, { uid: 'dev1' });
  const draftOf = async () => (await h.call('GET', '/admin/home-layout')).body.draft;

  test('GET /public/home: the seeded default, ETag + Cache-Control, 304 on a matching If-None-Match', async () => {
    const r = await get();
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.version, r.body.schemaVersion], [1, 1]);
    assert.equal(r.body.blocks.length, 16);
    assert.match(r.body.publishedAt, /^\d{4}-\d\d-\d\dT/);
    assert.equal(r.headers.get('cache-control'), 'public, max-age=60');
    const etag = r.headers.get('etag');
    assert.match(etag, /^W\/"[0-9a-f]{20}"$/);
    const again = await h.call('GET', '/public/home', { uid: 'dev1', headers: { 'if-none-match': etag } });
    assert.equal(again.status, 304);
    assert.equal(again.body, null);
    assert.equal(again.headers.get('etag'), etag);
    const other = await h.call('GET', '/public/home', { uid: 'dev1', headers: { 'if-none-match': 'W/"nope"' } });
    assert.equal(other.status, 200);
    // hrefs are resolved
    const grid = r.body.blocks.find((b) => b.type === 'quick_grid');
    assert.deepEqual(grid.data.items.map((i) => i.href), ['/poojas', '/chadhava', '/darshan', '/temples', '/panchang', '/horoscope', '/bhajan', '/events', '/bhajan']);
    assert.deepEqual(r.body.blocks.find((b) => b.type === 'fab').action, { type: 'bhajan', ref: '', href: '/bhajan' });
    assert.equal(r.body.blocks.find((b) => b.type === 'header').action, null);
  });

  test('a draft edit is invisible to devotees until published', async () => {
    const d = await draftOf();
    d.blocks.splice(1, 1); // drop `search`
    const put = await h.call('PUT', '/admin/home-layout/draft', { body: { schemaVersion: 1, blocks: d.blocks } });
    assert.equal(put.status, 200);
    assert.equal(put.body.dirty, true);
    assert.equal(put.body.draft.updatedBy, 'tester');
    assert.equal((await get()).body.blocks.length, 16);
    const s = (await h.call('GET', '/admin/home-layout')).body;
    assert.deepEqual([s.dirty, s.published.version, s.history.length, s.draft.blocks.length], [true, 1, 1, 15]);
  });

  test('PUT draft and POST validate: 400 bad_layout with per-field paths; validate saves nothing', async () => {
    const before = await draftOf();
    const body = { schemaVersion: 1, blocks: [{ id: 'x', type: 'shelf', data: { mode: 'source', source: 'hero' } }, { id: 'x', type: 'spacer', props: { height: 1 } }] };
    for (const [m, p] of [['PUT', '/admin/home-layout/draft'], ['POST', '/admin/home-layout/validate']]) {
      const r = await h.call(m, p, { body });
      assert.equal(r.status, 400, p);
      assert.equal(r.body.code, 'bad_layout');
      assert.deepEqual(Object.keys(r.body.fields).sort(), ['blocks.0.data.source', 'blocks.1.id', 'blocks.1.props.height']);
    }
    assert.deepEqual(await draftOf(), before);
    const ok = await h.call('POST', '/admin/home-layout/validate', { body: { schemaVersion: 1, blocks: before.blocks } });
    assert.deepEqual([ok.status, ok.body], [200, { ok: true }]);
    assert.equal((await h.call('PUT', '/admin/home-layout/draft', { raw: '{nope' })).status, 400);
  });

  test('publish: version++ with note and operator; devotees now see it; history lists it; unchanged ETag changes', async () => {
    const before = await get();
    const r = await h.call('POST', '/admin/home-layout/publish', { body: { note: 'drop search' } });
    assert.deepEqual([r.status, r.body], [200, { version: 2 }]);
    const after = await get();
    assert.equal(after.body.version, 2);
    assert.equal(after.body.blocks.length, 15);
    assert.notEqual(after.headers.get('etag'), before.headers.get('etag'));
    const s = (await h.call('GET', '/admin/home-layout')).body;
    assert.deepEqual([s.dirty, s.published.version, s.published.note, s.published.publishedBy, s.published.blockCount], [false, 2, 'drop search', 'tester', 15]);
    assert.deepEqual(s.history.map((x) => x.version), [2, 1]);
    assert.ok(!('blocks' in s.history[0]));
    const bad = await h.call('POST', '/admin/home-layout/publish', { body: { note: 5 } });
    assert.equal(bad.status, 400);
  });

  test('language filtering through the public route', async () => {
    const d = await draftOf();
    d.blocks.push({ ...base('only-hi', 'spacer', { language: 'hi' }) }, { ...base('only-en', 'spacer', { language: 'en' }) }, { ...base('later', 'spacer', { startsAt: at(48) }) }, { ...base('over', 'spacer', { endsAt: at(-48) }) }, { ...base('off', 'spacer', { enabled: false }) });
    assert.equal((await h.call('PUT', '/admin/home-layout/draft', { body: { schemaVersion: 1, blocks: d.blocks } })).status, 200);
    assert.equal((await h.call('POST', '/admin/home-layout/publish', { body: {} })).body.version, 3);
    const ids = async (lang) => (await get(lang)).body.blocks.map((b) => b.id).filter((id) => ['only-hi', 'only-en', 'later', 'over', 'off'].includes(id));
    assert.deepEqual(await ids('en'), ['only-en']);
    assert.deepEqual(await ids('hi'), ['only-hi']);
    assert.deepEqual(await ids(), ['only-hi', 'only-en']);
    assert.deepEqual(await ids('xx'), ['only-hi', 'only-en']);
    // different bodies, different ETags: a cache keyed on the URL stays correct
    assert.notEqual((await get('en')).headers.get('etag'), (await get('hi')).headers.get('etag'));
  });

  test('rollback copies a version into the DRAFT only; versions/:n returns the stored document', async () => {
    const r = await h.call('POST', '/admin/home-layout/rollback', { body: { version: 1 } });
    assert.equal(r.status, 200);
    assert.equal(r.body.draft.blocks.length, 16);
    assert.equal(r.body.draft.updatedBy, 'tester');
    assert.equal((await get()).body.version, 3, 'live is untouched');
    const s = (await h.call('GET', '/admin/home-layout')).body;
    assert.deepEqual([s.dirty, s.published.version], [true, 3]);
    const v1 = await h.call('GET', '/admin/home-layout/versions/1');
    assert.deepEqual([v1.status, v1.body.version, v1.body.blocks.length, v1.body.blockCount, v1.body.note], [200, 1, 16, 16, 'Initial layout']);
    assert.deepEqual(v1.body.blocks, r.body.draft.blocks);
    for (const n of ['99', '0', 'abc', '1.5']) assert.equal((await h.call('GET', `/admin/home-layout/versions/${n}`)).status, 404, n);
    assert.equal((await h.call('POST', '/admin/home-layout/rollback', { body: { version: 99 } })).status, 404);
    for (const version of [undefined, '1', 0, 1.5]) assert.equal((await h.call('POST', '/admin/home-layout/rollback', { body: { version } })).status, 400, String(version));
  });

  test('reset-default sets the draft to the built-in default and publishes nothing', async () => {
    const d = await draftOf();
    await h.call('PUT', '/admin/home-layout/draft', { body: { schemaVersion: 1, blocks: [] } });
    const r = await h.call('POST', '/admin/home-layout/reset-default', { body: {} });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.draft.blocks, (await loadDefaultLayout()).blocks);
    assert.equal(d.blocks.length, 16);
    assert.equal((await get()).body.version, 3);
  });

  test('history is trimmed to 50 full versions, the live one is never trimmed, the list shows the last 20', async () => {
    for (let i = 0; i < 55; i += 1) await createVersion({ schemaVersion: 1, blocks: [base(`h${i}`, 'spacer')] }, { by: 'bulk', note: `n${i}` });
    const versions = await HomeLayoutVersion.find().sort({ version: 1 }).lean();
    assert.equal(versions.length, MAX_VERSIONS);
    assert.equal(versions.at(-1).version, 58);
    assert.equal(versions[0].version, 9);
    assert.equal(versions[0].blocks.length, 1, 'full documents are kept');
    const s = (await h.call('GET', '/admin/home-layout')).body;
    assert.equal(s.history.length, 20);
    assert.deepEqual([s.history[0].version, s.history[19].version, s.published.version], [58, 39, 58]);
    assert.equal((await h.call('GET', '/admin/home-layout/versions/8')).status, 404, 'trimmed');
    assert.equal((await get()).body.version, 58);
  });

  test('registry route returns the shared registry', async () => {
    const r = await h.call('GET', '/admin/home-layout/registry');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, JSON.parse(JSON.stringify(registryView())));
  });

  test('the area gate is re-checked here: viewer reads, editor writes, a devotee BFF cannot reach it', async () => {
    const reads = [['GET', '/admin/home-layout'], ['GET', '/admin/home-layout/registry'], ['GET', '/admin/home-layout/versions/58']];
    for (const [m, p] of reads) {
      assert.equal((await h.call(m, p, { perms: VIEWER })).status, 200, `viewer ${p}`);
      assert.equal((await h.call(m, p, { perms: EDITOR })).status, 200, `editor ${p}`);
    }
    const body = { schemaVersion: 1, blocks: [] };
    for (const [m, p, b] of [['PUT', '/admin/home-layout/draft', body], ['POST', '/admin/home-layout/validate', body], ['POST', '/admin/home-layout/publish', {}], ['POST', '/admin/home-layout/rollback', { version: 58 }], ['POST', '/admin/home-layout/reset-default', {}]]) {
      const v = await h.call(m, p, { perms: VIEWER, body: b });
      assert.equal(v.status, 403, `viewer ${m} ${p}`);
      assert.equal(v.body.needs, 'content:edit');
      assert.equal((await h.call(m, p, { perms: EDITOR, body: b })).status < 300, true, `editor ${m} ${p}`);
      assert.equal((await h.call(m, p, { perms: [], body: b })).status, 403);
      assert.equal((await h.call(m, p, { tok: null, body: b })).status, 401);
      assert.equal((await h.call(m, p, { uid: 'dev', body: b })).status, 403, 'mobile-bff is the wrong issuer');
    }
    assert.equal((await h.call('GET', '/public/home', { tok: null })).status, 401, 'the internal route still needs a service token');
    assert.equal((await h.call('GET', '/public/home', { iss: 'admin-bff' })).status, 200, 'the admin BFF may preview it');
  });

  test('a large layout (well over 256 KB) is accepted', async () => {
    const big = Array.from({ length: 60 }, (_, i) => base(`big${i}`, 'shelf', { props: { layout: 'list' }, data: { mode: 'inline', items: Array.from({ length: 24 }, () => item({ title: 'x'.repeat(160), subtitle: 'y'.repeat(160) })) } }));
    const body = { schemaVersion: 1, blocks: big };
    assert.ok(JSON.stringify(body).length > 300_000);
    assert.equal((await h.call('PUT', '/admin/home-layout/draft', { body })).status, 200);
  });
});
