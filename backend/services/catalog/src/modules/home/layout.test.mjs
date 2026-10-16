// Home layout v2.1 (docs/HOME_LAYOUT.md sections 1-9): registry, validation matrix, public view, admin routes, seed + migration.
// Needs a throwaway mongod (TEST_MONGODB_URI).
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { EDITOR, VIEWER, boot } from '../../test-kit.mjs';
import { HomeLayoutDraft, HomeLayoutVersion, HomeSection } from '../../models.js';
import { MAX_VERSIONS } from './layout.model.js';
import { loadDefaultLayout } from './layout.default.js';
import { countChanges } from './layout.diff.js';
import { createVersion, latestVersion, loadDraft, migrateStoredLayouts } from './layout.store.js';
import { upgradeDocument } from './layout.upgrade.js';
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
const FIXED_TOP = () => [base('top', 'header', VALID.header), base('find', 'search', VALID.search)];
const layoutOf = (blocks, extra = {}) => ({ id: 'default', name: 'Default layout', blocks, ...extra });
const setOf = (...layouts) => ({ schemaVersion: 2, layouts });
/** The default layout = the fixed top bar + search, then `blocks`; so the first block under test is `layouts.0.blocks.2`. */
const doc = (...blocks) => setOf(layoutOf([...FIXED_TOP(), ...blocks]));
const bad = (d) => validateLayout(d).fields ?? null;
/** One block of `type` under test. Header and search ARE the fixed rows, so they replace them (paths `.blocks.0` / `.blocks.1`). */
const one = (type, patch = {}) => {
  const b = { ...base('b1', type, VALID[type]), ...patch };
  if (type === 'header') return setOf(layoutOf([b, FIXED_TOP()[1]]));
  if (type === 'search') return setOf(layoutOf([FIXED_TOP()[0], b]));
  return doc(b);
};
const first = (type, d = one(type)) => validateLayout(d).doc.layouts[0].blocks[type === 'header' ? 0 : type === 'search' ? 1 : 2];

/* ───────────────────────────────────────────── registry + parity (no database) ── */
describe('registry', () => {
  test('every block type has a valid example here and the registry lists them all', () => {
    assert.deepEqual(Object.keys(VALID).sort(), Object.keys(BLOCK_TYPES).sort());
    assert.equal(Object.keys(BLOCK_TYPES).length, 20);
    const v = registryView();
    assert.equal(v.blockTypes.length, 20);
    assert.equal(v.sources.length, 18);
    assert.deepEqual(v.sources.map((s) => s.key), ['hero', 'deities', 'poojas.featured', 'poojas.upcoming', 'chadhava.listings', 'temples.near_me', 'temples.saved', 'festivals.upcoming', 'events.upcoming', 'events.mine', 'bookings.next', 'astrologers.online', 'panchang.today', 'horoscope.today', 'bhajans.featured', 'knowledge', 'daily.today', 'live.now']);
    for (const k of ['actionTypes', 'icons', 'tones', 'flags', 'audiences', 'tileStyles']) assert.ok(v[k].length > 0, k);
    for (const bt of v.blockTypes) {
      for (const k of ['type', 'title', 'description', 'minAppVersion', 'props', 'data', 'icon', 'summary', 'fixed']) assert.ok(k in bt, `${bt.type}.${k}`);
      assert.equal(bt.minAppVersion, '1.0.0');
      assert.ok(ICONS.includes(bt.icon), `${bt.type} icon`);
      assert.ok(bt.summary.length > 0 && bt.summary.length < 80, `${bt.type} summary`);
      for (const s of bt.data.sources ?? []) assert.ok(SOURCES.some((x) => x.key === s), `${bt.type} source ${s}`);
    }
  });

  test('v2.1 additions: audiences, tile styles, fixed types, human titles, grid limits, live.now', () => {
    const v = registryView();
    assert.deepEqual(v.audiences, [
      { key: 'new_user', label: 'New users (first 7 days)', description: 'Account created 7 days ago or less.' },
      { key: 'has_booking', label: 'Has a booking', description: 'At least one booking that is not cancelled.' },
      { key: 'in_event', label: 'In an event', description: 'Joined an event that has not finished.' },
      { key: 'lapsed', label: "Hasn't opened in 14 days", description: 'The app was last opened more than 14 days ago.' },
    ]);
    assert.deepEqual(v.tileStyles.map((x) => x.key), ['icon', 'image', 'pill']);
    assert.deepEqual(v.blockTypes.filter((b) => b.fixed).map((b) => b.type), ['header', 'search']);
    const type = (t) => v.blockTypes.find((b) => b.type === t);
    const titles = { slider: 'Promo slider', deity_row: 'Deity stories', daily: 'Daily darshan', panchang: 'Aaj ka Panchang', featured_pooja: 'Festival banner', quick_grid: 'Services grid', next_seva: 'Your next seva', events: 'Your events', temples_near: 'Temples near you', rashi_row: 'Aaj ka Rashifal', astrologer: 'Talk to an astrologer', listen: 'Listen now', share: 'Share with family', shelf: 'Shelf of cards', promo: 'Banner', html: 'Custom HTML' };
    for (const [t, title] of Object.entries(titles)) assert.equal(type(t).title, title, t);
    assert.deepEqual(type('quick_grid').props.columns, { type: 'integer', enum: [3, 4, 5], default: 4 });
    assert.deepEqual(type('quick_grid').props.tileStyle.enum, ['icon', 'image', 'pill']);
    assert.equal(type('quick_grid').data.maxItems, 12);
    assert.ok(type('shelf').data.sources.includes('live.now'));
    assert.equal(v.sources.find((s) => s.key === 'live.now').auth, false);
    assert.equal(v.limits.layouts, 8);
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

  test('it is the v2 document, validates against the registry and normalises to itself (only absent `data` becomes null)', async () => {
    const raw = JSON.parse(readFileSync(here('./default-layout.json'), 'utf8'));
    const out = validateLayout(raw);
    assert.ok(out.doc, JSON.stringify(out.fields));
    assert.equal(raw.schemaVersion, 2);
    assert.equal(raw.layouts.length, 1);
    assert.deepEqual([raw.layouts[0].id, raw.layouts[0].name, raw.layouts[0].enabled, raw.layouts[0].audience, raw.layouts[0].startsAt, raw.layouts[0].endsAt], ['default', 'Default layout', true, [], null, null]);
    assert.equal(out.doc.layouts[0].blocks.length, 18);
    const expected = structuredClone(raw);
    for (const b of expected.layouts[0].blocks) if (b.data === undefined) b.data = null;
    assert.deepEqual(out.doc, expected);
    assert.deepEqual(await loadDefaultLayout(), out.doc);
    const blocks = raw.layouts[0].blocks;
    assert.deepEqual(blocks.map((b) => b.type), ['header', 'search', 'slider', 'astrologer', 'deity_row', 'daily', 'featured_pooja', 'quick_grid', 'next_seva', 'events', 'shelf', 'shelf', 'shelf', 'temples_near', 'rashi_row', 'listen', 'share', 'fab']);
    assert.deepEqual(blocks.map((b) => b.id).slice(8, 13), ['b-09-nextseva', 'b-17-yourevents', 'b-10-shelf', 'b-11-shelf', 'b-18-livenow']);
    const ev = blocks.find((b) => b.id === 'b-17-yourevents');
    assert.deepEqual([ev.audience, ev.data.source], [['in_event'], 'events.mine']);
    assert.equal(blocks.find((b) => b.id === 'b-18-livenow').data.source, 'live.now');
    const grid = blocks.find((b) => b.type === 'quick_grid');
    assert.deepEqual(grid.props, { columns: 4, tileStyle: 'icon' });
    assert.equal(grid.data.items.length, 9);
  });
});

/* ──────────────────────────────────────────────── validation matrix (pure) ── */
describe('validation', () => {
  for (const type of Object.keys(VALID)) {
    test(`${type}: a valid block passes and is normalised`, () => {
      const out = validateLayout(one(type));
      assert.ok(out.doc, JSON.stringify(out.fields));
      const b = out.doc.layouts[0].blocks[type === 'header' ? 0 : type === 'search' ? 1 : 2];
      assert.deepEqual([b.enabled, b.language, b.flag, b.tone, b.startsAt, b.endsAt, b.action === null || typeof b.action], [true, 'all', '', '', null, null, type === 'fab' ? 'object' : true]);
    });
  }

  test('unknown fields are rejected at every level, with the exact path', () => {
    assert.deepEqual(bad({ ...doc(), extra: 1 }), { extra: 'Unknown field.' });
    assert.deepEqual(bad(one('header', { nope: 1 })), { 'layouts.0.blocks.0.nope': 'Unknown field.' });
    assert.deepEqual(bad(one('header', { props: { showWallet: true, x: 1 } })), { 'layouts.0.blocks.0.props.x': 'Unknown field.' });
    assert.deepEqual(bad(one('quick_grid', { data: { mode: 'inline', items: [item({ href: '/x' })] } })), { 'layouts.0.blocks.2.data.items.0.href': 'Unknown field.' });
    assert.deepEqual(bad(one('quick_grid', { data: { mode: 'inline', items: [item({ action: { type: 'bhajan', ref: '', x: 1 } })] } })), { 'layouts.0.blocks.2.data.items.0.action.x': 'Unknown field.' });
    assert.deepEqual(bad(one('shelf', { data: { mode: 'source', source: 'knowledge', extra: 1 } })), { 'layouts.0.blocks.2.data.extra': 'Unknown field.' });
    assert.deepEqual(bad(one('shelf', { data: src('poojas.upcoming', { colour: 'red' }) })), { 'layouts.0.blocks.2.data.params.colour': 'Unknown field.' });
  });

  test('document level: schemaVersion, layouts list, limits, unique ids', () => {
    assert.ok(bad({ layouts: [] }).schemaVersion);
    assert.ok(bad({ schemaVersion: 1, blocks: [] }).schemaVersion, 'v1 is not accepted on the wire');
    assert.ok(bad({ schemaVersion: 1, blocks: [] }).blocks, 'and its `blocks` is an unknown field');
    assert.ok(bad({ schemaVersion: 2 }).layouts);
    assert.ok(bad(null).body);
    assert.ok(bad([]).body);
    assert.ok(!bad(doc()), 'a layout of just the fixed top bar and search is allowed');
    const fiftyEight = Array.from({ length: 58 }, (_, i) => base(`s${i}`, 'spacer'));
    assert.ok(!bad(doc(...fiftyEight)), '60 blocks including the two fixed ones');
    assert.match(bad(doc(...fiftyEight, base('s58', 'spacer')))['layouts.0.blocks'], /At most 60/);
    assert.deepEqual(bad(doc(base('a', 'spacer'), base('a', 'spacer'))), { 'layouts.0.blocks.3.id': 'Duplicate id.' });
    assert.ok(!bad(setOf(layoutOf(FIXED_TOP()), { ...layoutOf(FIXED_TOP()), id: 'diwali', name: 'Diwali' })), 'block ids only need to be unique inside a layout');
    assert.ok(bad(doc(base('', 'spacer')))['layouts.0.blocks.2.id']);
    assert.ok(bad(doc(base('has space', 'spacer')))['layouts.0.blocks.2.id']);
    assert.ok(bad(doc({ type: 'spacer' }))['layouts.0.blocks.2.id']);
    assert.ok(bad(doc('nope'))['layouts.0.blocks.2']);
  });

  const L = (id, extra = {}) => ({ ...layoutOf(FIXED_TOP()), id, name: id.toUpperCase(), ...extra });
  const DEF = () => L('default', { name: 'Default layout' });

  test('layout set: at most 8, exactly one `default`, unique stable ids, names 1-40', () => {
    assert.ok(!bad(setOf(DEF())));
    assert.match(bad(setOf(L('a'), L('b')))['layouts'], /"default"/);
    assert.deepEqual(bad(setOf(DEF(), DEF())), { 'layouts.1.id': 'Duplicate id.' });
    assert.ok(bad({ schemaVersion: 2, layouts: [] }).layouts);
    const seven = Array.from({ length: 7 }, (_, i) => L(`l${i}`));
    assert.ok(!bad(setOf(...seven, DEF())), '8 layouts');
    assert.match(bad(setOf(...seven, L('l7'), DEF())).layouts, /At most 8/);
    assert.ok(bad(setOf(DEF(), L('has space')))['layouts.1.id']);
    assert.ok(bad(setOf(DEF(), L('')))['layouts.1.id']);
    assert.ok(bad(setOf(DEF(), L('a', { name: '' })))['layouts.1.name']);
    assert.ok(bad(setOf(DEF(), L('a', { name: '   ' })))['layouts.1.name']);
    assert.ok(bad(setOf(DEF(), L('a', { name: undefined })))['layouts.1.name']);
    assert.ok(bad(setOf(DEF(), L('a', { name: 'x'.repeat(41) })))['layouts.1.name']);
    assert.ok(!bad(setOf(DEF(), L('a', { name: 'x'.repeat(40) }))));
    assert.equal(validateLayout(setOf(DEF(), L('a', { name: '  Navratri  ' }))).doc.layouts[1].name, 'Navratri');
    assert.deepEqual(bad(setOf(DEF(), L('a', { colour: 'red' }))), { 'layouts.1.colour': 'Unknown field.' });
    assert.ok(bad(setOf('nope'))['layouts.0']);
  });

  test('layout: audience from the closed list, schedule order, normalised defaults', () => {
    assert.ok(bad(setOf(DEF(), L('a', { audience: ['vip'] })))['layouts.1.audience.0']);
    assert.ok(bad(setOf(DEF(), L('a', { audience: 'new_user' })))['layouts.1.audience']);
    assert.ok(bad(setOf(DEF(), L('a', { audience: [5] })))['layouts.1.audience.0']);
    assert.deepEqual(validateLayout(setOf(DEF(), L('a', { audience: ['new_user', 'in_event', 'new_user'] }))).doc.layouts[1].audience, ['new_user', 'in_event']);
    for (const a of ['new_user', 'has_booking', 'in_event', 'lapsed']) assert.ok(!bad(setOf(DEF(), L('a', { audience: [a] }))), a);
    assert.deepEqual(bad(setOf(DEF(), L('a', { startsAt: '2026-10-19T00:00:00Z', endsAt: '2026-10-11T00:00:00Z' }))), { 'layouts.1.endsAt': 'Must be after startsAt.' });
    assert.deepEqual(bad(setOf(DEF(), L('a', { startsAt: '2026-10-11T00:00:00Z', endsAt: '2026-10-11T00:00:00Z' }))), { 'layouts.1.endsAt': 'Must be after startsAt.' });
    assert.ok(bad(setOf(DEF(), L('a', { startsAt: 'soon' })))['layouts.1.startsAt']);
    assert.ok(bad(setOf(DEF(), L('a', { enabled: 1 })))['layouts.1.enabled']);
    const out = validateLayout(setOf(DEF(), { id: 'a', name: 'A', blocks: FIXED_TOP() })).doc.layouts[1];
    assert.deepEqual([out.enabled, out.audience, out.startsAt, out.endsAt], [true, [], null, null]);
    assert.ok(bad(setOf(DEF(), L('a', { blocks: 'x' })))['layouts.1.blocks']);
  });

  test('the default layout: enabled, no audience, no schedule', () => {
    assert.deepEqual(bad(setOf({ ...DEF(), enabled: false })), { 'layouts.0.enabled': 'The default layout is always enabled.' });
    assert.ok(bad(setOf({ ...DEF(), audience: ['new_user'] }))['layouts.0.audience']);
    assert.ok(bad(setOf({ ...DEF(), startsAt: '2026-10-11T00:00:00Z' }))['layouts.0.startsAt']);
    assert.ok(bad(setOf({ ...DEF(), endsAt: '2026-10-11T00:00:00Z' }))['layouts.0.endsAt']);
  });

  test('fixed blocks: an enabled header then search, unfiltered, in EVERY layout', () => {
    const [h, q] = FIXED_TOP();
    const at1 = (blocks) => bad(setOf(DEF(), L('a', { blocks })));
    assert.ok(!at1([h, q]));
    assert.ok(at1([])['layouts.1.blocks.0'], 'missing');
    assert.ok(at1([h])['layouts.1.blocks.1']);
    assert.ok(at1([q, h])['layouts.1.blocks.0.type'], 'order matters');
    assert.ok(at1([base('s', 'spacer'), h, q])['layouts.1.blocks.0.type'], 'moved');
    assert.ok(at1([h, base('s', 'spacer'), q])['layouts.1.blocks.1.type']);
    assert.ok(at1([{ ...h, enabled: false }, q])['layouts.1.blocks.0.enabled']);
    assert.ok(at1([h, { ...q, enabled: false }])['layouts.1.blocks.1.enabled']);
    assert.ok(at1([{ ...h, audience: ['new_user'] }, q])['layouts.1.blocks.0.audience']);
    assert.ok(at1([h, { ...q, audience: ['lapsed'] }])['layouts.1.blocks.1.audience']);
    assert.ok(at1([{ ...h, startsAt: '2026-10-11T00:00:00Z' }, q])['layouts.1.blocks.0.startsAt']);
    assert.ok(at1([h, { ...q, endsAt: '2026-10-11T00:00:00Z' }])['layouts.1.blocks.1.endsAt']);
    assert.ok(at1([{ ...h, language: 'hi' }, q])['layouts.1.blocks.0.language']);
    assert.ok(at1([h, q, { ...h, id: 'h2' }])['layouts.1.blocks.2.type'], 'only once');
    assert.ok(bad(setOf({ ...DEF(), blocks: [q, h] }))['layouts.0.blocks.0.type'], 'the default too');
  });

  test('block audience, item enabled/badgeUntil, grid columns 3|4|5, tileStyle, grid <= 12, live.now', () => {
    assert.ok(bad(one('spacer', { audience: ['vip'] }))['layouts.0.blocks.2.audience.0']);
    assert.deepEqual(bad(doc(base('a', 'spacer'), base('b', 'spacer', { audience: ['has_booking', 'nope'] }))), { 'layouts.0.blocks.3.audience.1': `Must be one of: new_user, has_booking, in_event, lapsed.` });
    assert.deepEqual(first('spacer', one('spacer', { audience: ['in_event'] })).audience, ['in_event']);
    assert.deepEqual(first('spacer').audience, []);
    const grid = (props, items) => one('quick_grid', { props, data: { mode: 'inline', items } });
    for (const c of [3, 4, 5]) assert.ok(!bad(grid({ columns: c }, [item()])), String(c));
    assert.ok(bad(grid({ columns: 6 }, []))['layouts.0.blocks.2.props.columns']);
    assert.ok(bad(grid({ columns: 2 }, []))['layouts.0.blocks.2.props.columns']);
    for (const t of ['icon', 'image', 'pill']) assert.ok(!bad(grid({ tileStyle: t }, [])), t);
    assert.ok(bad(grid({ tileStyle: 'round' }, []))['layouts.0.blocks.2.props.tileStyle']);
    const many = (n) => Array.from({ length: n }, () => item());
    assert.ok(!bad(grid({}, many(12))));
    assert.match(bad(grid({}, many(13)))['layouts.0.blocks.2.data.items'], /At most 12/);
    assert.ok(!bad(one('shelf', { data: { mode: 'inline', items: many(24) } })), 'other types keep 24');
    const it = first('quick_grid', grid({}, [item()])).data.items[0];
    assert.deepEqual([it.enabled, it.badgeUntil], [true, null]);
    const it2 = first('quick_grid', grid({}, [item({ enabled: false, badge: 'new', badgeUntil: '2026-10-31T00:00:00+05:30' })])).data.items[0];
    assert.deepEqual([it2.enabled, it2.badge, it2.badgeUntil], [false, 'new', '2026-10-30T18:30:00.000Z']);
    assert.ok(bad(grid({}, [item({ enabled: 'no' })]))['layouts.0.blocks.2.data.items.0.enabled']);
    assert.ok(bad(grid({}, [item({ badgeUntil: 'later' })]))['layouts.0.blocks.2.data.items.0.badgeUntil']);
    assert.ok(!bad(one('shelf', { data: src('live.now') })));
    assert.ok(bad(one('events', { data: src('live.now') }))['layouts.0.blocks.2.data.source'], 'only shelves');
    assert.ok(bad(one('shelf', { data: src('live.now', { x: 1 }) }))['layouts.0.blocks.2.data.params.x']);
  });

  test('block type: unknown, missing, inherited names', () => {
    assert.ok(bad(doc(base('a', 'carousel')))['layouts.0.blocks.2.type']);
    assert.ok(bad(doc({ id: 'a' }))['layouts.0.blocks.2.type']);
    assert.ok(bad(doc(base('a', 'constructor')))['layouts.0.blocks.2.type']);
    assert.ok(bad(doc(base('a', '__proto__')))['layouts.0.blocks.2.type']);
  });

  test('common fields: language, tone, flag, text, dates, enabled', () => {
    assert.ok(bad(one('spacer', { language: 'fr' }))['layouts.0.blocks.2.language']);
    assert.ok(!bad(one('spacer', { language: 'hi' })));
    assert.ok(bad(one('spacer', { tone: 'pink' }))['layouts.0.blocks.2.tone']);
    assert.ok(!bad(one('spacer', { tone: 'maroon' })));
    assert.ok(bad(one('spacer', { flag: 'has space' }))['layouts.0.blocks.2.flag']);
    assert.ok(!bad(one('spacer', { flag: 'someFutureFlag' })), 'an unknown flag key is allowed (it means shown)');
    assert.ok(bad(one('spacer', { enabled: 'yes' }))['layouts.0.blocks.2.enabled']);
    assert.ok(bad(one('spacer', { title: 'x'.repeat(161) }))['layouts.0.blocks.2.title']);
    assert.ok(!bad(one('spacer', { title: 'x'.repeat(160) })));
    assert.ok(bad(one('spacer', { subtitleHi: 5 }))['layouts.0.blocks.2.subtitleHi']);
    assert.ok(bad(one('spacer', { startsAt: 'tomorrow-ish' }))['layouts.0.blocks.2.startsAt']);
    assert.ok(bad(one('spacer', { startsAt: 5 }))['layouts.0.blocks.2.startsAt']);
    assert.deepEqual(bad(one('spacer', { startsAt: '2026-02-02T00:00:00Z', endsAt: '2026-02-01T00:00:00Z' })), { 'layouts.0.blocks.2.endsAt': 'Must be after startsAt.' });
    const ok = first('spacer', one('spacer', { startsAt: '2026-02-01T05:30:00+05:30', endsAt: '' }));
    assert.deepEqual([ok.startsAt, ok.endsAt], ['2026-02-01T00:00:00.000Z', null]);
    assert.equal(validateLayout(one('spacer', { title: '  padded  ' })).doc.layouts[0].blocks[2].title, 'padded');
  });

  test('actions: types, route and link rules, refs', () => {
    const a = (action) => bad(one('fab', { action }));
    assert.ok(!a(null));
    assert.ok(a('bhajan')['layouts.0.blocks.2.action']);
    assert.ok(a({ type: 'teleport', ref: '' })['layouts.0.blocks.2.action.type']);
    assert.ok(a({ ref: '' })['layouts.0.blocks.2.action.type']);
    assert.ok(!a({ type: 'route', ref: '/poojas?x=1' }));
    assert.ok(a({ type: 'route', ref: 'poojas' })['layouts.0.blocks.2.action.ref']);
    assert.ok(a({ type: 'route', ref: '//evil.com' })['layouts.0.blocks.2.action.ref']);
    assert.ok(a({ type: 'route', ref: '' })['layouts.0.blocks.2.action.ref']);
    assert.ok(!a({ type: 'link', ref: 'https://example.com/a' }));
    assert.ok(a({ type: 'link', ref: 'http://example.com' })['layouts.0.blocks.2.action.ref']);
    assert.ok(a({ type: 'link', ref: 'javascript:alert(1)' })['layouts.0.blocks.2.action.ref']);
    assert.ok(a({ type: 'link', ref: '' })['layouts.0.blocks.2.action.ref']);
    assert.ok(a({ type: 'pooja', ref: 'a b' })['layouts.0.blocks.2.action.ref']);
    assert.ok(a({ type: 'pooja', ref: '../x' })['layouts.0.blocks.2.action.ref']);
    assert.ok(a({ type: 'pooja', ref: 'a.b-c_d' }) === null);
    assert.ok(a({ type: 'event', ref: 'x'.repeat(121) })['layouts.0.blocks.2.action.ref']);
    for (const t of ['pooja', 'chadhava', 'temple', 'bhajan', 'astrologer', 'coins', 'event', 'live', 'panchang', 'horoscope', 'events', 'none']) assert.ok(!a({ type: t, ref: '' }), t);
    assert.deepEqual(validateLayout(one('fab', { action: { type: 'none', ref: 'ignored' } })).doc.layouts[0].blocks[2].action, { type: 'none', ref: '' });
  });

  test('props: types, enums, ranges per block type', () => {
    assert.ok(bad(one('header', { props: { showWallet: 'yes' } }))['layouts.0.blocks.0.props.showWallet']);
    assert.ok(bad(one('search', { props: { placeholder: 5 } }))['layouts.0.blocks.1.props.placeholder']);
    assert.ok(bad(one('search', { props: { placeholder: 'x'.repeat(161) } }))['layouts.0.blocks.1.props.placeholder']);
    assert.ok(bad(one('quick_grid', { props: { columns: 6 } }))['layouts.0.blocks.2.props.columns']);
    assert.ok(bad(one('quick_grid', { props: { columns: '3' } }))['layouts.0.blocks.2.props.columns']);
    assert.ok(!bad(one('quick_grid', { props: { columns: 3 } })));
    assert.ok(bad(one('shelf', { props: { layout: 'masonry' } }))['layouts.0.blocks.2.props.layout']);
    for (const l of ['photo3', 'book2', 'list', 'grid4']) assert.ok(!bad(one('shelf', { props: { layout: l } })));
    assert.ok(bad(one('promo', { props: { kind: 'video' } }))['layouts.0.blocks.2.props.kind']);
    assert.ok(bad(one('spacer', { props: { height: 3 } }))['layouts.0.blocks.2.props.height']);
    assert.ok(bad(one('spacer', { props: { height: 97 } }))['layouts.0.blocks.2.props.height']);
    assert.ok(bad(one('spacer', { props: { height: 12.5 } }))['layouts.0.blocks.2.props.height']);
    assert.ok(!bad(one('spacer', { props: { height: 4 } })) && !bad(one('spacer', { props: { height: 96 } })));
    assert.ok(bad(one('fab', { props: { icon: 'rocket' } }))['layouts.0.blocks.2.props.icon']);
    assert.ok(bad(one('share', { props: { message: 5 } }))['layouts.0.blocks.2.props.message']);
    assert.ok(bad(one('slider', { props: { autoplay: true } }))['layouts.0.blocks.2.props.autoplay']);
    assert.ok(bad(one('header', { props: [] }))['layouts.0.blocks.0.props']);
  });

  test('html props are sanitised on save and capped at 20 KB', () => {
    const dirty = '<p onclick="x()">hi<script>alert(1)</script><a href="javascript:alert(1)">j</a></p>';
    for (const type of ['html', 'promo']) {
      const out = validateLayout(one(type, { props: { html: dirty, htmlHi: '<iframe src="https://e.com"></iframe>ok' } })).doc.layouts[0].blocks[2].props;
      assert.ok(!/script|onclick|javascript:|iframe/i.test(out.html + out.htmlHi), out.html);
      assert.match(out.html, /hi/);
    }
    assert.ok(!bad(one('html', { props: { html: 'a'.repeat(20 * 1024) } })));
    assert.ok(bad(one('html', { props: { html: 'a'.repeat(20 * 1024 + 1) } }))['layouts.0.blocks.2.props.html']);
    assert.ok(bad(one('html', { props: { htmlHi: 'é'.repeat(11 * 1024) } }))['layouts.0.blocks.2.props.htmlHi'], 'the cap is in bytes');
    assert.ok(bad(one('html', { props: { html: 5 } }))['layouts.0.blocks.2.props.html']);
  });

  test('data: types without data must have null; modes and sources are per type', () => {
    for (const type of ['header', 'search', 'share', 'html', 'spacer', 'fab']) {
      const at = type === 'header' ? 0 : type === 'search' ? 1 : 2;
      assert.ok(!bad(one(type, { data: null })), type);
      assert.ok(bad(one(type, { data: src('hero') }))[`layouts.0.blocks.${at}.data`], `${type} has no data`);
    }
    assert.ok(bad(one('slider', { data: src('deities') }))['layouts.0.blocks.2.data.source']);
    assert.ok(!bad(one('slider', { data: { mode: 'inline', items: [item({ image: 'https://x.test/a.jpg' })] } })));
    assert.ok(bad(one('quick_grid', { data: src('hero') }))['layouts.0.blocks.2.data.mode'], 'quick_grid is inline only');
    assert.ok(bad(one('astrologer', { data: { mode: 'inline', items: [] } }))['layouts.0.blocks.2.data.mode']);
    assert.ok(bad(one('astrologer', { data: src('panchang.today') }))['layouts.0.blocks.2.data.source']);
    assert.ok(bad(one('events', { data: src('knowledge') }))['layouts.0.blocks.2.data.source']);
    assert.ok(!bad(one('events', { data: src('events.mine') })));
    assert.ok(bad(one('shelf', { data: src('hero') }))['layouts.0.blocks.2.data.source']);
    assert.ok(bad(one('shelf', { data: src('not.a.source') }))['layouts.0.blocks.2.data.source']);
    assert.ok(bad(one('shelf', { data: src(5) }))['layouts.0.blocks.2.data.source']);
    assert.ok(bad(one('shelf', { data: { mode: 'live' } }))['layouts.0.blocks.2.data.mode']);
    assert.ok(bad(one('shelf', { data: 'poojas.upcoming' }))['layouts.0.blocks.2.data']);
    for (const s of BLOCK_TYPES.shelf.data.sources) assert.ok(!bad(one('shelf', { data: src(s) })), s);
    assert.ok(!bad(one('deity_row', { data: { mode: 'inline', items: [item({ deitySlug: 'shiva' })] } })));
    assert.ok(bad(one('promo', { data: src('hero') }))['layouts.0.blocks.2.data.mode']);
  });

  test('source params and limit', () => {
    assert.ok(bad(one('shelf', { data: src('poojas.featured', { temple: 'x' }) }))['layouts.0.blocks.2.data.params.temple']);
    assert.ok(bad(one('shelf', { data: src('poojas.upcoming', { temple: 5 }) }))['layouts.0.blocks.2.data.params.temple']);
    assert.ok(bad(one('shelf', { data: src('poojas.upcoming', { temple: 'a b' }) }))['layouts.0.blocks.2.data.params.temple']);
    assert.ok(!bad(one('shelf', { data: src('chadhava.listings', { category: 'flowers' }) })));
    assert.ok(bad(one('events', { data: src('events.upcoming', { tags: 'garba' }) }))['layouts.0.blocks.2.data.params.tags']);
    assert.ok(bad(one('events', { data: src('events.upcoming', { tags: ['ok', 5] }) }))['layouts.0.blocks.2.data.params.tags.1']);
    assert.ok(bad(one('events', { data: src('events.upcoming', { tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }) }))['layouts.0.blocks.2.data.params.tags']);
    assert.ok(bad(one('events', { data: src('events.upcoming', 'x') }))['layouts.0.blocks.2.data.params']);
    for (const limit of [0, 21, 1.5, '6', -1]) assert.ok(bad(one('shelf', { data: src('knowledge', {}, { limit }) }))['layouts.0.blocks.2.data.limit'], String(limit));
    for (const limit of [1, 20]) assert.ok(!bad(one('shelf', { data: src('knowledge', {}, { limit }) })));
    assert.deepEqual(validateLayout(one('shelf', { data: { mode: 'source', source: 'knowledge' } })).doc.layouts[0].blocks[2].data, { mode: 'source', source: 'knowledge', params: {} });
  });

  test('inline items: count, fields, enums, images, icons', () => {
    const items = (n) => Array.from({ length: n }, () => item());
    assert.ok(!bad(one('shelf', { data: { mode: 'inline', items: items(24) } })));
    assert.match(bad(one('shelf', { data: { mode: 'inline', items: items(25) } }))['layouts.0.blocks.2.data.items'], /At most 24/);
    assert.ok(bad(one('promo', { data: { mode: 'inline', items: items(2) } }))['layouts.0.blocks.2.data.items'], 'promo takes one item');
    assert.ok(bad(one('shelf', { data: { mode: 'inline' } }))['layouts.0.blocks.2.data.items']);
    assert.ok(bad(one('shelf', { data: { mode: 'inline', items: ['x'] } }))['layouts.0.blocks.2.data.items.0']);
    const f = (extra) => bad(one('shelf', { data: { mode: 'inline', items: [item(extra)] } }));
    assert.ok(f({ title: 'x'.repeat(161) })['layouts.0.blocks.2.data.items.0.title']);
    assert.ok(f({ icon: 'rocket' })['layouts.0.blocks.2.data.items.0.icon']);
    assert.ok(!f({ icon: '' }));
    assert.ok(f({ badge: 'hot' })['layouts.0.blocks.2.data.items.0.badge']);
    for (const b of ['', 'new', 'soon', 'special']) assert.ok(!f({ badge: b }), b);
    assert.ok(f({ liveBadge: 'yes' })['layouts.0.blocks.2.data.items.0.liveBadge']);
    assert.ok(!f({ liveBadge: true }));
    assert.ok(f({ image: 'http://x.test/a.png' })['layouts.0.blocks.2.data.items.0.image']);
    assert.ok(f({ image: '/other/a.png' })['layouts.0.blocks.2.data.items.0.image']);
    assert.ok(f({ image: 'javascript:alert(1)' })['layouts.0.blocks.2.data.items.0.image']);
    assert.ok(!f({ image: '/uploads/6acf0a7fce86d1f7b8489916.png' }));
    assert.ok(f({ flag: 'no good' })['layouts.0.blocks.2.data.items.0.flag']);
    assert.ok(f({ action: { type: 'route', ref: 'x' } })['layouts.0.blocks.2.data.items.0.action.ref']);
  });

  test('every problem is reported at once, not just the first', () => {
    const f = bad(doc(base('a', 'nope'), base('b', 'shelf', { tone: 'pink', data: src('hero') }), base('b', 'spacer')));
    assert.deepEqual(Object.keys(f).sort(), ['layouts.0.blocks.2.type', 'layouts.0.blocks.3.data.source', 'layouts.0.blocks.3.tone', 'layouts.0.blocks.4.id']);
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
  const NOW = new Date('2026-10-14T00:00:00Z');
  const mk = (id, extra = {}) => ({ ...validateLayout(doc(base(id, 'spacer'))).doc.layouts[0].blocks[2], ...extra });
  const TOP = validateLayout(doc()).doc.layouts[0].blocks;
  const lay = (id, extra = {}, blocks = [mk(`${id}-b`)]) => ({ ...validateLayout(doc()).doc.layouts[0], id, name: id.toUpperCase(), ...extra, blocks: [...TOP, ...blocks] });
  const live = (...layouts) => ({ version: 3, schemaVersion: 2, publishedAt: new Date('2026-01-01T00:00:00Z'), layouts });
  const idsOf = (v) => v.layouts.map((l) => l.id);

  test('layouts: enabled + schedule only, priority order, default always present and last', () => {
    const l = live(
      lay('default', { name: 'Default layout' }),
      lay('navratri', { startsAt: '2026-10-11T00:00:00.000Z', endsAt: '2026-10-19T00:00:00.000Z', audience: ['has_booking'] }),
      lay('diwali', { startsAt: '2026-10-29T00:00:00.000Z' }),
      lay('off', { enabled: false }),
      lay('newbies', { audience: ['new_user'] }),
      lay('past', { endsAt: '2026-10-01T00:00:00.000Z' }),
    );
    const v = publicLayoutView(l, { now: NOW });
    assert.deepEqual(idsOf(v), ['navratri', 'newbies', 'default'], 'array order is priority; default moved last');
    assert.deepEqual([v.version, v.schemaVersion, v.publishedAt], [3, 2, '2026-01-01T00:00:00.000Z']);
    assert.deepEqual(Object.keys(v.layouts[0]), ['id', 'name', 'audience', 'startsAt', 'endsAt', 'blocks']);
    assert.deepEqual(v.layouts[0].audience, ['has_booking'], 'audiences are passed through for the device');
    assert.deepEqual(idsOf(publicLayoutView(l, { now: new Date('2026-10-30T00:00:00Z') })), ['diwali', 'newbies', 'default']);
    assert.deepEqual(idsOf(publicLayoutView(live(lay('default')), { now: NOW })), ['default']);
    assert.deepEqual(idsOf(publicLayoutView(live(lay('a'), lay('default')), { now: NOW })), ['a', 'default']);
  });

  test('blocks: enabled, window and language filtered, NOT audience; no lang = no language filtering', () => {
    const l = live(lay('default', {}, [
      mk('on'), mk('off', { enabled: false }),
      mk('future', { startsAt: '2026-11-01T00:00:00.000Z' }), mk('past', { endsAt: '2026-10-01T00:00:00.000Z' }), mk('now', { startsAt: '2026-10-01T00:00:00.000Z', endsAt: '2026-11-01T00:00:00.000Z' }),
      mk('hi', { language: 'hi' }), mk('en', { language: 'en' }), mk('vip', { audience: ['new_user'] }),
    ]));
    const ids = (lang) => publicLayoutView(l, { lang, now: NOW }).layouts[0].blocks.map((b) => b.id).slice(2);
    assert.deepEqual(ids('en'), ['on', 'now', 'en', 'vip']);
    assert.deepEqual(ids('hi'), ['on', 'now', 'hi', 'vip']);
    assert.deepEqual(ids(undefined), ['on', 'now', 'hi', 'en', 'vip']);
    assert.deepEqual(ids('fr'), ['on', 'now', 'hi', 'en', 'vip']);
  });

  test('actions and items carry an href; disabled items are removed; stored html is cleaned again', () => {
    const stored = {
      ...mk('b'), type: 'promo', action: { type: 'pooja', ref: 'abhishek' }, props: { kind: 'html', html: '<p onclick="x()">hi<script>x</script></p>', htmlHi: '' },
      data: { mode: 'inline', items: [{ ...item(), action: { type: 'event', ref: 'garba' } }, { ...item(), action: null }, { ...item({ title: 'hidden' }), enabled: false, action: { type: 'bhajan', ref: '' } }] },
    };
    const out = publicLayoutView(live(lay('default', {}, [stored]))).layouts[0].blocks[2];
    assert.deepEqual(out.action, { type: 'pooja', ref: 'abhishek', href: '/pooja/abhishek' });
    assert.deepEqual(out.data.items.map((i) => i.href), ['/events/garba', ''], 'the enabled:false item is gone');
    assert.deepEqual(out.data.items[0].action, { type: 'event', ref: 'garba', href: '/events/garba' });
    assert.equal(out.data.items[1].action, null);
    assert.ok(!/script|onclick/.test(out.props.html), out.props.html);
  });

  test('a stored v1 row is upgraded before it is served', () => {
    const v1 = { version: 1, schemaVersion: 1, publishedAt: new Date('2026-01-01T00:00:00Z'), blocks: [{ ...mk('x') }] };
    const v = publicLayoutView(v1);
    assert.deepEqual([v.schemaVersion, idsOf(v)], [2, ['default']]);
    assert.deepEqual(v.layouts[0].blocks.map((b) => b.type), ['header', 'search', 'spacer']);
  });
});

/* ───────────────────────────────────────── the "N changes" count (pure) ── */
describe('countChanges', () => {
  const base1 = async () => structuredClone(await loadDefaultLayout());
  const n = (d, l) => countChanges(d, l);

  test('equal sets are 0; every kind of difference is counted by id', async () => {
    const live = await base1();
    assert.equal(n(structuredClone(live), live), 0);
    const d = structuredClone(live);
    d.layouts[0].blocks.splice(2, 1); // remove slider
    assert.equal(n(d, live), 1, 'a removed block');
    const d2 = structuredClone(live);
    d2.layouts[0].blocks.push({ ...structuredClone(d2.layouts[0].blocks[5]), id: 'new-one' });
    assert.equal(n(d2, live), 1, 'an added block');
    const d3 = structuredClone(live);
    const [moved] = d3.layouts[0].blocks.splice(10, 1);
    d3.layouts[0].blocks.splice(3, 0, moved);
    assert.equal(n(d3, live), 1, 'one drag is one move, however far');
    const d4 = structuredClone(live);
    d4.layouts[0].blocks[7].props.columns = 5;
    d4.layouts[0].blocks[8].enabled = false;
    assert.equal(n(d4, live), 2, 'changed blocks');
    const d5 = structuredClone(live);
    d5.layouts[0].blocks[7].data.items[0].enabled = false;
    assert.equal(n(d5, live), 1, 'an item change is a block change');
  });

  test('layouts: added, removed, renamed, re-scheduled, re-audienced, toggled, moved', async () => {
    const live = await base1();
    const extra = (id) => ({ ...structuredClone(live.layouts[0]), id, name: id, audience: [], startsAt: null, endsAt: null });
    live.layouts.unshift(extra('a'), extra('b'));
    const d = () => structuredClone(live);
    let x = d(); x.layouts.push(extra('c'));
    assert.equal(n(x, live), 1, 'added (its blocks are not counted again)');
    x = d(); x.layouts.splice(0, 1);
    assert.equal(n(x, live), 1, 'removed');
    x = d(); x.layouts[0].name = 'A2';
    assert.equal(n(x, live), 1, 'renamed');
    x = d(); x.layouts[0].startsAt = '2026-10-11T00:00:00.000Z'; x.layouts[0].endsAt = '2026-10-19T00:00:00.000Z';
    assert.equal(n(x, live), 1, 're-scheduled');
    x = d(); x.layouts[0].audience = ['new_user'];
    assert.equal(n(x, live), 1, 're-audienced');
    x = d(); x.layouts[0].enabled = false;
    assert.equal(n(x, live), 1, 'toggled');
    x = d(); x.layouts.reverse();
    assert.ok(n(x, live) >= 1, 'priority changed');
    x = d(); x.layouts[0].blocks.splice(4, 1); x.layouts[1].blocks.splice(4, 1);
    assert.equal(n(x, live), 2, 'blocks counted per layout');
  });
});

/* ───────────────────────────────────────────────────────── upgrade v1 -> v2 ── */
// REAL v1 documents as v1 stored them (the v1 default-layout.json, git 3c0dd50, and a v1 draft with an operator's edits).
const V1_DEFAULT = JSON.parse(readFileSync(here('./fixtures/v1-default-layout.json'), 'utf8'));
const V1_EDITED = JSON.parse(readFileSync(here('./fixtures/v1-edited-layout.json'), 'utf8'));

describe('upgrade v1 -> v2', () => {
  test('a v1 default becomes the default layout of a v2 set, block for block', () => {
    const up = upgradeDocument(V1_DEFAULT);
    assert.equal(up.schemaVersion, 2);
    assert.equal(up.layouts.length, 1);
    const l = up.layouts[0];
    assert.deepEqual([l.id, l.name, l.enabled, l.audience, l.startsAt, l.endsAt], ['default', 'Default layout', true, [], null, null]);
    assert.deepEqual(l.blocks.map((b) => b.id), V1_DEFAULT.blocks.map((b) => b.id));
    assert.ok(validateLayout(up).doc, 'valid v2');
    assert.deepEqual(up, validateLayout(up).doc, 'already normalised');
    assert.ok(l.blocks.every((b) => Array.isArray(b.audience)));
    const grid = l.blocks.find((b) => b.type === 'quick_grid');
    assert.ok(grid.data.items.every((i) => i.enabled === true && i.badgeUntil === null));
    assert.deepEqual(grid.data.items.map((i) => i.title), V1_DEFAULT.blocks.find((b) => b.type === 'quick_grid').data.items.map((i) => i.title));
  });

  test('is idempotent, and leaves a v2 document alone', () => {
    const once = upgradeDocument(V1_DEFAULT);
    assert.deepEqual(upgradeDocument(once), once);
    assert.equal(upgradeDocument(once), once);
    assert.deepEqual(upgradeDocument(upgradeDocument(V1_EDITED)), upgradeDocument(V1_EDITED));
  });

  test('a v1 document that breaks the new fixed-row rule is repaired, not refused', () => {
    // V1_EDITED: no search at all, the header 4th and disabled, a 14-tile grid, a Hindi-only block.
    const l = upgradeDocument(V1_EDITED).layouts[0];
    assert.deepEqual(l.blocks.slice(0, 2).map((b) => [b.type, b.enabled, b.language, b.audience]), [['header', true, 'all', []], ['search', true, 'all', []]]);
    assert.equal(l.blocks.filter((b) => b.type === 'header' || b.type === 'search').length, 2);
    assert.equal(l.blocks.find((b) => b.type === 'quick_grid').data.items.length, 12);
    assert.ok(l.blocks.some((b) => b.language === 'hi'), 'other blocks keep their settings');
    assert.ok(validateLayout(upgradeDocument(V1_EDITED)).doc);
  });

  test('garbage in, a readable default set out', () => {
    for (const raw of [null, {}, { blocks: 'x' }, { schemaVersion: 1, blocks: [] }, { blocks: [null, 5, { id: 'a', type: 'spacer' }] }]) {
      const up = upgradeDocument(raw);
      assert.equal(up.layouts[0].id, 'default');
      assert.deepEqual(up.layouts[0].blocks.slice(0, 2).map((b) => b.type), ['header', 'search']);
    }
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
    assert.deepEqual([vs[0].version, vs[0].schemaVersion, vs[0].blockCount, vs[0].layoutCount, vs[0].publishedBy], [1, 2, 18, 1, 'system']);
    assert.deepEqual(vs[0].layouts, (await loadDefaultLayout()).layouts);
    const d = await HomeLayoutDraft.findOne().lean();
    assert.deepEqual(d.layouts, vs[0].layouts);
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
    const blocks = vs[0].layouts[0].blocks;
    const shelves = blocks.filter((b) => b.id.startsWith('m-'));
    assert.deepEqual(shelves.map((b) => b.id), ['m-pitru-paksha', 'm-books', 'm-knowledge', 'm-weird'], 'order = HomeSection.order; disabled and empty ones are left out');
    assert.ok(blocks.findIndex((b) => b.id === 'm-weird') + 1 === blocks.findIndex((b) => b.type === 'listen'), 'inserted just before listen');
    const by = Object.fromEntries(shelves.map((b) => [b.id, b]));
    assert.deepEqual([by['m-books'].type, by['m-books'].tone, by['m-books'].props, by['m-books'].title], ['shelf', 'gold', { layout: 'book2' }, 'Pooja & Paath Books']);
    assert.deepEqual(by['m-books'].data.items.map((i) => i.title), ['Aarti', 'Chalisa', 'Katha', 'Paath']);
    assert.deepEqual(by['m-books'].data.items[0].action, { type: 'route', ref: '/bhajan' });
    assert.deepEqual(by['m-knowledge'].data.items.map((i) => i.deitySlug), ['vishnu', 'shiva', 'ganesh']);
    assert.deepEqual([by['m-pitru-paksha'].startsAt, by['m-pitru-paksha'].endsAt], ['2026-09-25T18:30:00.000Z', '2026-10-10T18:29:59.000Z']);
    assert.deepEqual([by['m-pitru-paksha'].action, by['m-pitru-paksha'].actionLabel], [{ type: 'route', ref: '/festivals' }, 'See all dates']);
    assert.deepEqual([by['m-weird'].action, by['m-weird'].data.items.map((i) => [i.icon, i.badge, i.action])], [{ type: 'link', ref: 'https://x.test/y' }, [['', '', null], ['', '', { type: 'route', ref: '/poojas' }]]]);
    assert.ok(validateLayout({ schemaVersion: 2, layouts: vs[0].layouts }).doc, 'the migrated document validates');
    assert.equal((await HomeLayoutDraft.findOne().lean()).layouts[0].blocks.length, blocks.length);
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

  test('boot upgrades a stored v1 draft and every v1 version (real fixtures) to v2, once; reads upgrade even before that', async () => {
    await HomeLayoutVersion.deleteMany({});
    await HomeLayoutDraft.deleteMany({});
    const t = new Date('2026-03-01T00:00:00Z');
    await HomeLayoutVersion.collection.insertMany([
      { version: 1, schemaVersion: 1, blocks: V1_DEFAULT.blocks, publishedBy: 'system', note: 'Initial layout', blockCount: V1_DEFAULT.blocks.length, publishedAt: t },
      { version: 2, schemaVersion: 1, blocks: V1_EDITED.blocks, publishedBy: 'ed', note: 'edited', blockCount: V1_EDITED.blocks.length, publishedAt: t },
    ]);
    await HomeLayoutDraft.collection.insertOne({ key: 'main', schemaVersion: 1, blocks: V1_EDITED.blocks, updatedBy: 'ed', createdAt: t, updatedAt: t });
    // a read through the store upgrades in memory while the rows are still v1
    assert.equal((await latestVersion()).schemaVersion, 2);
    assert.equal((await loadDraft()).layouts[0].id, 'default');
    assert.equal((await HomeLayoutVersion.findOne({ version: 2 }).lean()).layouts, undefined, 'still v1 on disk');
    await seedHomeLayout();
    for (const row of [...(await HomeLayoutVersion.find().lean()), await HomeLayoutDraft.findOne().lean()]) {
      assert.equal(row.schemaVersion, 2);
      assert.equal('blocks' in row, false, 'the v1 field is gone');
      assert.equal(row.layouts.length, 1);
      assert.ok(validateLayout({ schemaVersion: 2, layouts: row.layouts }).doc);
    }
    const v1 = await HomeLayoutVersion.findOne({ version: 1 }).lean();
    assert.deepEqual([v1.blockCount, v1.layoutCount, v1.note, v1.publishedBy], [V1_DEFAULT.blocks.length, 1, 'Initial layout', 'system']);
    assert.deepEqual(v1.layouts[0].blocks.map((b) => b.id), V1_DEFAULT.blocks.map((b) => b.id));
    assert.equal(await HomeLayoutVersion.countDocuments(), 2, 'no version was added or lost');
    // idempotent
    const snap = JSON.stringify([await HomeLayoutVersion.find().sort({ version: 1 }).lean(), await HomeLayoutDraft.findOne().lean()]);
    assert.equal(await migrateStoredLayouts(), 0);
    await seedHomeLayout();
    assert.equal(JSON.stringify([await HomeLayoutVersion.find().sort({ version: 1 }).lean(), await HomeLayoutDraft.findOne().lean()]), snap);
  });
});

/* ──────────────────────────────────────────────────────────────── HTTP ── */
describe('HTTP', () => {
  let h;
  before(async () => { h = await boot('home_layout_http'); await home.seed(); });
  after(() => h.stop());

  const get = (lang) => h.call('GET', `/public/home${lang ? `?lang=${lang}` : ''}`, { uid: 'dev1' });
  const draftOf = async () => (await h.call('GET', '/admin/home-layout')).body.draft;
  const put = (body) => h.call('PUT', '/admin/home-layout/draft', { body });
  const publish = (note = '') => h.call('POST', '/admin/home-layout/publish', { body: { note } });
  const extra = async (id, patch = {}) => {
    const d = await loadDefaultLayout();
    return { ...structuredClone(d.layouts[0]), id, name: id, audience: [], startsAt: null, endsAt: null, ...patch };
  };

  test('GET /public/home: the seeded default, ETag + Cache-Control, 304 on a matching If-None-Match', async () => {
    const r = await get();
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.version, r.body.schemaVersion], [1, 2]);
    assert.deepEqual(r.body.layouts.map((l) => l.id), ['default']);
    assert.equal(r.body.layouts[0].blocks.length, 18);
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
    const blocks = r.body.layouts[0].blocks;
    const grid = blocks.find((b) => b.type === 'quick_grid');
    assert.deepEqual(grid.data.items.map((i) => i.href), ['/poojas', '/chadhava', '/darshan', '/temples', '/panchang', '/horoscope', '/bhajan', '/events', '/bhajan']);
    assert.deepEqual(blocks.find((b) => b.type === 'fab').action, { type: 'bhajan', ref: '', href: '/bhajan' });
    assert.equal(blocks.find((b) => b.type === 'header').action, null);
    assert.deepEqual(blocks.find((b) => b.id === 'b-18-livenow').action, { type: 'live', ref: '', href: '/darshan' });
    assert.deepEqual(blocks.find((b) => b.id === 'b-17-yourevents').audience, ['in_event']);
  });

  test('a draft edit is invisible to devotees until published; changes counts the differences', async () => {
    const d = await draftOf();
    d.layouts[0].blocks.splice(3, 1); // drop `astrologer`
    const r = await put({ schemaVersion: 2, layouts: d.layouts });
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.dirty, r.body.changes], [true, 1]);
    assert.equal(r.body.draft.updatedBy, 'tester');
    assert.equal((await get()).body.layouts[0].blocks.length, 18);
    const s = (await h.call('GET', '/admin/home-layout')).body;
    assert.deepEqual([s.dirty, s.changes, s.published.version, s.history.length, s.draft.layouts[0].blocks.length, s.published.layoutCount], [true, 1, 1, 1, 17, 1]);
    d.layouts.push(await extra('navratri', { name: 'Navratri', startsAt: at(-1), endsAt: at(24) }));
    assert.equal((await put({ schemaVersion: 2, layouts: d.layouts })).body.changes, 2);
  });

  test('POST discard: draft = the published set, changes 0; reset-default; the published set is untouched', async () => {
    const r = await h.call('POST', '/admin/home-layout/discard', { body: {} });
    assert.equal(r.status, 200);
    assert.equal(r.body.draft.layouts.length, 1);
    assert.equal(r.body.draft.layouts[0].blocks.length, 18);
    assert.equal(r.body.draft.updatedBy, 'tester');
    const s = (await h.call('GET', '/admin/home-layout')).body;
    assert.deepEqual([s.dirty, s.changes], [false, 0]);
    assert.equal((await get()).body.version, 1);
  });

  test('PUT draft and POST validate: 400 bad_layout with per-field paths; validate saves nothing', async () => {
    const before = await draftOf();
    const top = FIXED_TOP();
    const body = { schemaVersion: 2, layouts: [{ id: 'default', name: 'D', blocks: [...top, { id: 'x', type: 'shelf', audience: ['vip'], data: { mode: 'source', source: 'hero' } }, { id: 'x', type: 'spacer', props: { height: 1 } }] }] };
    for (const [m, p] of [['PUT', '/admin/home-layout/draft'], ['POST', '/admin/home-layout/validate']]) {
      const r = await h.call(m, p, { body });
      assert.equal(r.status, 400, p);
      assert.equal(r.body.code, 'bad_layout');
      assert.deepEqual(Object.keys(r.body.fields).sort(), ['layouts.0.blocks.2.audience.0', 'layouts.0.blocks.2.data.source', 'layouts.0.blocks.3.id', 'layouts.0.blocks.3.props.height']);
    }
    assert.deepEqual(await draftOf(), before);
    const ok = await h.call('POST', '/admin/home-layout/validate', { body: { schemaVersion: 2, layouts: before.layouts } });
    assert.deepEqual([ok.status, ok.body], [200, { ok: true }]);
    assert.equal((await put({ schemaVersion: 1, blocks: before.layouts[0].blocks })).status, 400, 'no v1 on the wire');
    assert.equal((await h.call('PUT', '/admin/home-layout/draft', { raw: '{nope' })).status, 400);
  });

  test('publish: version++ with note and operator; devotees now see it; history lists it; ETag changes', async () => {
    const d = await draftOf();
    d.layouts[0].blocks.splice(3, 1);
    await put({ schemaVersion: 2, layouts: d.layouts });
    const before = await get();
    const r = await publish('drop astrologer');
    assert.deepEqual([r.status, r.body], [200, { version: 2 }]);
    const after = await get();
    assert.equal(after.body.version, 2);
    assert.equal(after.body.layouts[0].blocks.length, 17);
    assert.notEqual(after.headers.get('etag'), before.headers.get('etag'));
    const s = (await h.call('GET', '/admin/home-layout')).body;
    assert.deepEqual([s.dirty, s.changes, s.published.version, s.published.note, s.published.publishedBy, s.published.blockCount], [false, 0, 2, 'drop astrologer', 'tester', 17]);
    assert.deepEqual(s.history.map((x) => [x.version, x.layoutCount]), [[2, 1], [1, 1]]);
    assert.ok(!('layouts' in s.history[0]) && !('blocks' in s.history[0]));
    assert.equal((await h.call('POST', '/admin/home-layout/publish', { body: { note: 5 } })).status, 400);
  });

  test('layout sets over HTTP: only live layouts are public, priority order, default last; an unpublished draft is not', async () => {
    const d = await draftOf();
    d.layouts.unshift(
      await extra('navratri', { name: 'Navratri', startsAt: at(-2), endsAt: at(24), audience: ['has_booking'] }),
      await extra('diwali', { name: 'Diwali', startsAt: at(48) }),
      await extra('old', { name: 'Old', endsAt: at(-5) }),
      await extra('paused', { name: 'Paused', enabled: false }),
      await extra('newbies', { name: 'New users', audience: ['new_user'] }),
    );
    assert.equal((await put({ schemaVersion: 2, layouts: d.layouts })).status, 200);
    assert.deepEqual((await get()).body.layouts.map((l) => l.id), ['default']);
    assert.equal((await publish('sets')).body.version, 3);
    const v = (await get()).body;
    assert.deepEqual(v.layouts.map((l) => l.id), ['navratri', 'newbies', 'default']);
    assert.deepEqual(v.layouts.map((l) => l.name), ['Navratri', 'New users', 'Default layout']);
    assert.deepEqual(v.layouts[0].audience, ['has_booking']);
    assert.deepEqual(Object.keys(v.layouts[0]), ['id', 'name', 'audience', 'startsAt', 'endsAt', 'blocks']);
    // audience filtering is the device's job: the events block with audience:['in_event'] is still in the payload
    assert.ok(v.layouts[2].blocks.some((b) => b.id === 'b-17-yourevents'));
    const s = (await h.call('GET', '/admin/home-layout')).body;
    assert.deepEqual([s.published.blockCount, s.published.layoutCount], [5 * 18 + 17, 6]);
  });

  test('items with enabled:false are removed publicly (and nowhere else)', async () => {
    const d = await draftOf();
    const grid = d.layouts.at(-1).blocks.find((b) => b.type === 'quick_grid');
    grid.data.items[1].enabled = false;
    grid.data.items[3].badge = 'new';
    grid.data.items[3].badgeUntil = '2026-10-31T00:00:00.000Z';
    await put({ schemaVersion: 2, layouts: d.layouts });
    assert.equal((await draftOf()).layouts.at(-1).blocks.find((b) => b.type === 'quick_grid').data.items.length, 9, 'the draft keeps hidden items');
    await publish('hide a tile');
    const g = (await get()).body.layouts.at(-1).blocks.find((b) => b.type === 'quick_grid');
    assert.equal(g.data.items.length, 8);
    assert.ok(!g.data.items.some((i) => i.title === 'Chadhava'));
    const stamped = g.data.items.find((i) => i.badgeUntil);
    assert.deepEqual([stamped.badge, stamped.badgeUntil], ['new', '2026-10-31T00:00:00.000Z'], 'badgeUntil is passed to the device');
  });

  test('language filtering through the public route (inside every layout)', async () => {
    const d = await draftOf();
    const last = d.layouts.at(-1);
    last.blocks.push({ ...base('only-hi', 'spacer', { language: 'hi' }) }, { ...base('only-en', 'spacer', { language: 'en' }) }, { ...base('later', 'spacer', { startsAt: at(48) }) }, { ...base('over', 'spacer', { endsAt: at(-48) }) }, { ...base('off', 'spacer', { enabled: false }) });
    assert.equal((await put({ schemaVersion: 2, layouts: d.layouts })).status, 200);
    const pub = await publish();
    assert.equal(pub.body.version, 5);
    const ids = async (lang) => (await get(lang)).body.layouts.at(-1).blocks.map((b) => b.id).filter((id) => ['only-hi', 'only-en', 'later', 'over', 'off'].includes(id));
    assert.deepEqual(await ids('en'), ['only-en']);
    assert.deepEqual(await ids('hi'), ['only-hi']);
    assert.deepEqual(await ids(), ['only-hi', 'only-en']);
    assert.deepEqual(await ids('xx'), ['only-hi', 'only-en']);
    assert.notEqual((await get('en')).headers.get('etag'), (await get('hi')).headers.get('etag'));
  });

  test('rollback copies a whole set into the DRAFT only; versions/:n returns the stored document', async () => {
    const r = await h.call('POST', '/admin/home-layout/rollback', { body: { version: 1 } });
    assert.equal(r.status, 200);
    assert.equal(r.body.draft.layouts.length, 1);
    assert.equal(r.body.draft.layouts[0].blocks.length, 18);
    assert.equal(r.body.draft.updatedBy, 'tester');
    assert.equal((await get()).body.version, 5, 'live is untouched');
    const s = (await h.call('GET', '/admin/home-layout')).body;
    assert.deepEqual([s.dirty, s.published.version], [true, 5]);
    assert.ok(s.changes > 1);
    const v1 = await h.call('GET', '/admin/home-layout/versions/1');
    assert.deepEqual([v1.status, v1.body.version, v1.body.schemaVersion, v1.body.layouts.length, v1.body.blockCount, v1.body.layoutCount, v1.body.note], [200, 1, 2, 1, 18, 1, 'Initial layout']);
    assert.deepEqual(v1.body.layouts, r.body.draft.layouts);
    const v3 = await h.call('GET', '/admin/home-layout/versions/3');
    assert.deepEqual(v3.body.layouts.map((l) => l.id), ['navratri', 'diwali', 'old', 'paused', 'newbies', 'default'], 'the whole set, including layouts that are not live now');
    for (const n of ['99', '0', 'abc', '1.5']) assert.equal((await h.call('GET', `/admin/home-layout/versions/${n}`)).status, 404, n);
    assert.equal((await h.call('POST', '/admin/home-layout/rollback', { body: { version: 99 } })).status, 404);
    for (const version of [undefined, '1', 0, 1.5]) assert.equal((await h.call('POST', '/admin/home-layout/rollback', { body: { version } })).status, 400, String(version));
    const back = await h.call('POST', '/admin/home-layout/discard', { body: {} });
    assert.equal(back.body.draft.layouts.length, 6, 'discard returns to the live set');
  });

  test('reset-default makes the set {layouts:[default]} with the built-in default and publishes nothing', async () => {
    const r = await h.call('POST', '/admin/home-layout/reset-default', { body: {} });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.draft.layouts, (await loadDefaultLayout()).layouts);
    assert.deepEqual(r.body.draft.layouts.map((l) => l.id), ['default']);
    assert.equal((await get()).body.version, 5);
    assert.equal((await h.call('GET', '/admin/home-layout')).body.dirty, true);
  });

  test('history is trimmed to 50 full versions, the live one is never trimmed, the list shows the last 20', async () => {
    for (let i = 0; i < 55; i += 1) await createVersion(setOf(layoutOf(FIXED_TOP())), { by: 'bulk', note: `n${i}` });
    const versions = await HomeLayoutVersion.find().sort({ version: 1 }).lean();
    assert.equal(versions.length, MAX_VERSIONS);
    assert.equal(versions.at(-1).version, 60);
    assert.equal(versions[0].version, 11);
    assert.equal(versions[0].layouts[0].blocks.length, 2, 'full documents are kept');
    const s = (await h.call('GET', '/admin/home-layout')).body;
    assert.equal(s.history.length, 20);
    assert.deepEqual([s.history[0].version, s.history[19].version, s.published.version], [60, 41, 60]);
    assert.equal((await h.call('GET', '/admin/home-layout/versions/10')).status, 404, 'trimmed');
    assert.equal((await get()).body.version, 60);
  });

  test('registry route returns the shared registry', async () => {
    const r = await h.call('GET', '/admin/home-layout/registry');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, JSON.parse(JSON.stringify(registryView())));
  });

  test('the area gate is re-checked here: viewer reads, editor writes, a devotee BFF cannot reach it', async () => {
    const reads = [['GET', '/admin/home-layout'], ['GET', '/admin/home-layout/registry'], ['GET', '/admin/home-layout/versions/60']];
    for (const [m, p] of reads) {
      assert.equal((await h.call(m, p, { perms: VIEWER })).status, 200, `viewer ${p}`);
      assert.equal((await h.call(m, p, { perms: EDITOR })).status, 200, `editor ${p}`);
    }
    const body = setOf(layoutOf(FIXED_TOP()));
    for (const [m, p, b] of [['PUT', '/admin/home-layout/draft', body], ['POST', '/admin/home-layout/validate', body], ['POST', '/admin/home-layout/publish', {}], ['POST', '/admin/home-layout/rollback', { version: 60 }], ['POST', '/admin/home-layout/discard', {}], ['POST', '/admin/home-layout/reset-default', {}]]) {
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

  test('a large set (well over 256 KB) is accepted', async () => {
    const big = Array.from({ length: 58 }, (_, i) => base(`big${i}`, 'shelf', { props: { layout: 'list' }, data: { mode: 'inline', items: Array.from({ length: 24 }, () => item({ title: 'x'.repeat(160), subtitle: 'y'.repeat(160) })) } }));
    const body = setOf(layoutOf([...FIXED_TOP(), ...big]));
    assert.ok(JSON.stringify(body).length > 300_000);
    assert.equal((await put(body)).status, 200);
  });
});
