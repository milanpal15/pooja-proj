/**
 *   node --test src/features/events/lib/events-logic.test.mjs
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
const src = ts.transpileModule(fs.readFileSync(path.join(here, 'events-logic.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
new Function('exports', 'require', 'module', src)(mod.exports, () => ({}), mod);
const L = mod.exports;

const card = (slug, typeSlug, extra = {}) => ({ slug, typeSlug, title: slug, status: 'scheduled', registered: null, spotsLeft: null, milestoneCount: 0, ...extra });

test('blocks: own order, known names only, once each', () => {
  assert.deepEqual(L.visibleBlocks(['venue', 'hologram', 'schedule', 'venue', 'milestones']), ['venue', 'schedule', 'milestones']);
  assert.deepEqual(L.visibleBlocks(undefined), []);
  assert.deepEqual(L.visibleBlocks(['x']), []);
});

test('tasks: unknown kinds are unsupported', () => {
  assert.ok(L.isSupportedTask('counter'));
  assert.ok(L.isSupportedTask('self_mark'));
  assert.ok(!L.isSupportedTask('teleport'));
});

test('time: IST regardless of the phone zone', () => {
  // 2026-10-17 20:00 IST = 14:30Z
  assert.equal(L.longDate('2026-10-17T14:30:00Z'), 'Sat 17 Oct');
  assert.equal(L.clockTime('2026-10-17T14:30:00Z'), '8:00 pm');
  assert.equal(L.clockTime('2026-10-17T18:30:00Z'), '12:00 am');
  assert.equal(L.clockTime('2026-10-17T06:30:00Z'), '12:00 pm');
  assert.equal(L.shortDate('nonsense'), '');
  assert.equal(L.shortDate(null), '');
});

test('whenLine: single, multiday, always', () => {
  assert.equal(L.whenLine({ mode: 'single', startsAt: '2026-10-17T14:30:00Z', endsAt: '2026-10-17T18:30:00Z' }), 'Sat 17 Oct · 8:00 pm – 12:00 am');
  assert.equal(L.whenLine({ mode: 'multiday', startsAt: '2026-10-10T20:00:00Z', endsAt: '2026-10-19T10:00:00Z' }), '11 Oct – 19 Oct');
  assert.equal(L.whenLine({ mode: 'always', startsAt: '2026-10-10T20:00:00Z' }), '');
  assert.equal(L.whenLine(undefined), '');
  assert.equal(L.whenLine({ mode: 'single', startsAt: '2026-10-17T14:30:00Z', endsAt: null }), 'Sat 17 Oct · 8:00 pm');
});

test('countdown', () => {
  const now = Date.parse('2026-10-15T00:00:00Z');
  assert.deepEqual(L.countdown('2026-10-17T03:30:00Z', now), { days: 2, hours: 3, minutes: 30, totalMinutes: 2 * 1440 + 210 });
  assert.equal(L.countdown('2026-10-14T00:00:00Z', now), null);
  assert.equal(L.countdown(null, now), null);
});

test('fill', () => {
  assert.equal(L.fill('{n} of {m} done', { n: 4, m: 9 }), '4 of 9 done');
  assert.equal(L.fill('x {z}', {}), 'x ');
});

test('status label', () => {
  const now = Date.parse('2026-10-15T00:00:00Z');
  assert.equal(L.statusLabel({ status: 'live' }, now).key, 'ev_st_live');
  assert.equal(L.statusLabel({ status: 'ended' }, now).key, 'ev_st_ended');
  assert.equal(L.statusLabel({ status: 'registration_open', full: true }, now).key, 'ev_st_full');
  assert.equal(L.statusLabel({ status: 'registration_open' }, now).key, 'ev_st_open');
  const s = L.statusLabel({ status: 'scheduled', startsAt: '2026-10-17T00:00:00Z' }, now);
  assert.deepEqual([s.key, s.vars.n], ['ev_st_starts_in_days', 2]);
  assert.equal(L.statusLabel({ status: 'scheduled', startsAt: '2026-10-15T05:00:00Z' }, now).key, 'ev_st_starts_in_hours');
  assert.equal(L.statusLabel({ status: 'scheduled', startsAt: '2026-10-15T00:20:00Z' }, now).key, 'ev_st_starts_soon');
  assert.equal(L.statusLabel({ status: 'mystery', startsAt: null }, now).key, 'ev_st_scheduled');
});

test('progress ring maths', () => {
  assert.equal(L.progressRatio({ done: 4, total: 9 }), 4 / 9);
  assert.equal(L.progressRatio({ done: 0, total: 0 }), 0);
  assert.equal(L.progressRatio({ done: 12, total: 9 }), 1);
  assert.equal(L.progressRatio(undefined), 0);
  const [f, rest] = L.ringDash(10, 0.5);
  assert.ok(Math.abs(f - Math.PI * 10) < 1e-9 && Math.abs(f + rest - 20 * Math.PI) < 1e-9);
  assert.deepEqual(L.ringDash(10, 5)[1], 0);
  const top = L.ringEnd(50, 50, 40, 0);
  assert.ok(Math.abs(top.x - 50) < 1e-9 && Math.abs(top.y - 10) < 1e-9);
  const right = L.ringEnd(50, 50, 40, 0.25);
  assert.ok(Math.abs(right.x - 90) < 1e-9 && Math.abs(right.y - 50) < 1e-9);
});

test('theme: own, then type, then default; bad hex ignored', () => {
  assert.deepEqual(L.themeOf({ theme: { color: '#112233', gradient: ['#112233', '#445566'] } }, '#999999'), { color: '#112233', gradient: ['#112233', '#445566'] });
  assert.equal(L.themeOf({}, '#AA0011').color, '#AA0011');
  assert.deepEqual(L.themeOf({}, '#AA0011').gradient[0], '#AA0011');
  assert.equal(L.themeOf({ color: 'red' }, undefined).color, '#7A1C2A');
});

test('list: filters and sections never repeat a card', () => {
  const s = {
    continue: [card('a', 'yatra')],
    thisWeek: [card('a', 'yatra'), card('b', 'garba')],
    upcoming: [card('b', 'garba'), card('c', 'japa', { tags: ['hanuman'] }), card('d', 'vrat')],
    mine: [],
  };
  const all = L.sectionList(s, { type: 'all', tag: 'all' });
  assert.deepEqual(all.continue.map((c) => c.slug), ['a']);
  assert.deepEqual(all.thisWeek.map((c) => c.slug), ['b']);
  assert.deepEqual(all.upcoming.map((c) => c.slug), ['c', 'd']);
  assert.equal(all.total, 4);
  assert.deepEqual(L.sectionList(s, { type: 'japa', tag: 'all' }).upcoming.map((c) => c.slug), ['c']);
  assert.equal(L.sectionList(s, { type: 'all', tag: 'hanuman' }).total, 1);
  assert.equal(L.sectionList(s, { type: 'garba', tag: 'hanuman' }).total, 0);
});

test('milestones: state comes from the server', () => {
  assert.equal(L.milestoneState({ locked: true }), 'locked');
  assert.equal(L.milestoneState({ done: true }), 'done');
  assert.equal(L.milestoneState({ completedAt: '2026-10-11T00:00:00Z' }), 'done');
  assert.equal(L.milestoneState({}), 'open');
  const items = [{ key: 'a', done: true }, { key: 'b' }, { key: 'c', locked: true }];
  assert.deepEqual(L.milestoneSummary(items), { done: 1, total: 3, states: ['done', 'open', 'locked'] });
  assert.equal(L.currentMilestoneIndex(items), 1);
  assert.equal(L.currentMilestoneIndex(items, 'a'), 1);
  assert.equal(L.currentMilestoneIndex([{ key: 'a', done: true }]), -1);
});

test('counter task needs both numbers from the server', () => {
  assert.deepEqual(L.counterOf({ kind: 'counter', config: { target: 108 }, state: { count: 54 } }), { count: 54, target: 108 });
  assert.deepEqual(L.counterOf({ kind: 'counter', config: { target: 108 } }), { count: 0, target: 108 });
  assert.equal(L.counterOf({ kind: 'counter', config: {} }), null);
  assert.equal(L.counterOf({ kind: 'self_mark', config: { target: 3 } }), null);
});

test('rewards summary', () => {
  assert.deepEqual(
    L.rewardSummary([{ kind: 'coins', coins: 51 }, { kind: 'coins', coins: 100 }, { kind: 'badge', badgeSlug: 'nav' }, { kind: 'certificate' }, { kind: 'coins', coins: 0 }]),
    { coins: 151, badgeCount: 1, badgeNames: ['nav'], certificate: true },
  );
  assert.deepEqual(L.rewardSummary(undefined), { coins: 0, badgeCount: 0, badgeNames: [], certificate: false });
});

test('directions', () => {
  assert.equal(L.directionsUrl({ lat: 23.1, lng: 72.5 }), 'https://www.google.com/maps/dir/?api=1&destination=23.1,72.5');
  assert.match(L.directionsUrl({ name: 'Hall', city: 'Surat' }), /query=Hall%2C%20Surat$/);
  assert.equal(L.directionsUrl({}), null);
  assert.equal(L.directionsUrl(undefined), null);
  assert.equal(L.venueLine({ name: 'Hall', city: 'Surat' }), 'Hall, Surat');
});

test('cache parsing', () => {
  const ok = (v) => !!v && typeof v === 'object';
  assert.deepEqual(L.parseCache('{"a":1}', ok), { a: 1 });
  assert.equal(L.parseCache('nope', ok), null);
  assert.equal(L.parseCache(null, ok), null);
  assert.equal(L.parseCache('3', ok), null);
});
