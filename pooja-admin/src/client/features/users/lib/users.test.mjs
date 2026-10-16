import assert from 'node:assert/strict';
import test from 'node:test';

import { childFor, childModules, MODULES } from '../../../lib/nav/registry.js';
import { rankModules } from '../../../lib/nav/palette.js';
import { buildHash, resolveRoute } from '../../../lib/nav/route.js';
import { GROUPS } from '../../../lib/nav/registry.js';
import { blankBlockForm, counter, isDirty, phoneModel, serverFields, toBlockBody, untilLabel, validateBlock } from './block.js';
import { blankDeviceForm, toDeviceBody, validateDeviceBlock } from './devices.js';
import { deleteMatches, deletePhrase, isUnavailable, tabCount, tabLabel, tabState, unavailableTabs } from './detail.js';
import { csvDataRows, exportFilename, exportPlan, selectionExportOk, EXPORT_CAP } from './export.js';
import { activityItems, rowPatch, statusOf, versionLabel } from './format.js';
import { DEFAULT_SORT, NO_FILTERS, activeFilterCount, buildExportQuery, buildListQuery, countLabel, dateRangeError, emptyPage, filterParams, lastActiveRange, mergePage } from './query.js';
import { parseUsersRoute, userHash } from './route.js';
import { normaliseTag, parseTags, planAdd } from './tags.js';
import { COLUMNS, DEFAULT_COLUMNS, makeView, sanitizeColumns, sanitizeViews, storableFilters, upsertView } from './views.js';

const NOW = new Date('2026-10-16T10:00:00.000Z');

/* ------------------------------------------------------------ filters -> query -- */
test('filters become the server query; blanks and defaults are left out', () => {
  assert.deepEqual(filterParams(NO_FILTERS, NOW), {});
  const q = buildListQuery({ ...NO_FILTERS, q: '  priya ', status: 'blocked', tag: ' VIP ', role: 'astrologer', versionCode: '013', lastActive: '7d' }, { sort: 'name', dir: 'asc' }, { limit: 50, cursor: 'c1' }, NOW);
  assert.equal(q.q, 'priya');
  assert.equal(q.status, 'blocked');
  assert.equal(q.tag, 'vip');
  assert.equal(q.role, 'astrologer');
  assert.equal(q.versionCode, '13');
  assert.equal(q.lastActiveAfter, '2026-10-09T10:00:00.000Z');
  assert.equal(q.sort, 'name');
  assert.equal(q.dir, 'asc');
  assert.equal(q.limit, 50);
  assert.equal(q.cursor, 'c1');
  assert.equal('createdFrom' in q, false);
  assert.deepEqual(buildListQuery(NO_FILTERS, undefined, {}, NOW), { sort: 'lastActive', dir: 'desc', limit: 50, cursor: undefined });
});

test('a build number that is not digits is ignored', () => {
  assert.equal('versionCode' in filterParams({ versionCode: 'abc' }, NOW), false);
  assert.equal('versionCode' in filterParams({ versionCode: '1.3' }, NOW), false);
});

test('last-active presets and created range', () => {
  assert.deepEqual(lastActiveRange('inactive30', NOW), { lastActiveBefore: '2026-09-16T10:00:00.000Z' });
  assert.deepEqual(lastActiveRange('inactive90', NOW), { lastActiveBefore: '2026-07-18T10:00:00.000Z' });
  assert.deepEqual(lastActiveRange('', NOW), {});
  assert.ok(lastActiveRange('today', NOW).lastActiveAfter);
  const p = filterParams({ createdFrom: '2026-10-01', createdTo: '2026-10-05' }, NOW);
  assert.ok(new Date(p.createdFrom) < new Date(p.createdTo));
  assert.equal(dateRangeError({ createdFrom: '2026-10-05', createdTo: '2026-10-01' }) !== '', true);
  assert.equal(dateRangeError({ createdFrom: '2026-10-01', createdTo: '2026-10-05' }), '');
});

test('export query never carries a limit or cursor', () => {
  const q = buildExportQuery({ ...NO_FILTERS, status: 'blocked' }, DEFAULT_SORT, NOW);
  assert.equal(q.status, 'blocked');
  assert.equal('limit' in q, false);
  assert.equal('cursor' in q, false);
});

test('active filter count ignores the search box and the "all" status', () => {
  assert.equal(activeFilterCount({ ...NO_FILTERS, q: 'x' }), 0);
  assert.equal(activeFilterCount({ ...NO_FILTERS, status: 'all' }), 0);
  assert.equal(activeFilterCount({ ...NO_FILTERS, status: 'blocked', tag: 'vip' }), 2);
});

/* ------------------------------------------------------------------- cursor -- */
test('cursor paging appends, de-duplicates, and starts over on a new search', () => {
  let s = mergePage(emptyPage(), { users: [{ id: 'a' }, { id: 'b' }], next: 'c1', total: null }, { replace: true });
  assert.equal(s.next, 'c1');
  s = mergePage(s, { users: [{ id: 'b' }, { id: 'c' }], next: null, total: null });
  assert.deepEqual(s.rows.map((r) => r.id), ['a', 'b', 'c']);
  assert.equal(s.next, null);
  s = mergePage(s, { users: [{ id: 'z' }], next: 'c9', total: 1200 }, { replace: true });
  assert.deepEqual(s.rows.map((r) => r.id), ['z']);
  assert.equal(s.total, 1200);
});

test('count label says "many" when the server did not count', () => {
  assert.equal(countLabel({ rows: new Array(50), next: 'c', total: null }), 'Showing 50 of many');
  assert.equal(countLabel({ rows: new Array(50), next: 'c', total: 1203 }), 'Showing 50 of 1,203');
  assert.equal(countLabel({ rows: new Array(7), next: null, total: null }), '7 users');
  assert.equal(countLabel({ rows: new Array(1), next: null, total: null }), '1 user');
});

/* --------------------------------------------------------------------- tags -- */
test('tag normalisation', () => {
  assert.equal(normaliseTag('  VIP  '), 'vip');
  assert.equal(normaliseTag('Beta Tester'), 'beta-tester');
  assert.equal(normaliseTag('--a__b--'), 'a-b');
  assert.equal(normaliseTag('héllo!'), 'hllo');
  assert.equal(normaliseTag('x'.repeat(40)).length, 24);
  assert.equal(normaliseTag('abc-' + 'x'.repeat(30)).endsWith('-'), false);
  assert.equal(normaliseTag(null), '');
  assert.deepEqual(parseTags('VIP, beta tester,, vip\nrefund'), ['vip', 'beta-tester', 'refund']);
});

test('adding tags respects the per-user limit and skips tags already there', () => {
  assert.deepEqual(planAdd(['a'], ['a', 'b']), { add: ['b'], error: '' });
  const ten = Array.from({ length: 10 }, (_, i) => `t${i}`);
  assert.match(planAdd(ten, ['new']).error, /at most 10/);
  assert.deepEqual(planAdd(ten, ['t1']), { add: [], error: '' });
});

/* --------------------------------------------------------------- saved views -- */
test('saved views never keep the search text, names or contacts', () => {
  const v = makeView('  Blocked   this week ', { ...NO_FILTERS, q: 'Priya Rao +919812304821', status: 'blocked' }, { sort: 'createdAt', dir: 'desc' }, ['name', 'tags', 'bogus']);
  assert.equal(v.name, 'Blocked this week');
  assert.equal('q' in v.filters, false);
  assert.equal(JSON.stringify(v).includes('Priya'), false);
  assert.equal(JSON.stringify(v).includes('9198'), false);
  assert.deepEqual(v.columns, ['name', 'tags']);
  // a view written by an older/odd client with a q in it is cleaned on read
  const read = sanitizeViews([{ name: 'x', filters: { q: 'secret@example.com', status: 'active' } }, null, { name: '' }, 'junk']);
  assert.equal(read.length, 1);
  assert.equal(JSON.stringify(read).includes('secret'), false);
  assert.equal(makeView('   ', NO_FILTERS, DEFAULT_SORT, null), null);
  assert.deepEqual(sanitizeViews('nope'), []);
});

test('views are replaced by name and capped', () => {
  const a = makeView('a', NO_FILTERS, DEFAULT_SORT, null);
  let list = upsertView([], a);
  list = upsertView(list, { ...a, filters: { ...a.filters, status: 'blocked' } });
  assert.equal(list.length, 1);
  assert.equal(list[0].filters.status, 'blocked');
  for (let i = 0; i < 20; i++) list = upsertView(list, makeView(`v${i}`, NO_FILTERS, DEFAULT_SORT, null));
  assert.equal(list.length, 12);
});

test('columns: name is locked, unknown ids drop, order follows the table', () => {
  assert.deepEqual(sanitizeColumns(['tags', 'name', 'zzz', 'contact']), ['name', 'contact', 'tags']);
  assert.deepEqual(sanitizeColumns(null), DEFAULT_COLUMNS);
  assert.deepEqual(sanitizeColumns([]), ['name']);
  assert.ok(COLUMNS.find((c) => c.id === 'name').locked);
  assert.equal(storableFilters({ ...NO_FILTERS, versionCode: 'x' }).versionCode, '');
});

/* -------------------------------------------------------------------- block -- */
const GOOD = { reason: 'Abuse of astrologers', message: 'Your account is blocked.', messageHi: '', mode: 'forever', until: '', alsoDevices: false };

test('block form validation', () => {
  assert.deepEqual(validateBlock(GOOD, NOW), {});
  assert.ok(validateBlock({ ...GOOD, reason: '  ' }, NOW).reason);
  assert.ok(validateBlock({ ...GOOD, message: '' }, NOW).message);
  assert.ok(validateBlock({ ...GOOD, message: 'x'.repeat(301) }, NOW).message);
  assert.ok(validateBlock({ ...GOOD, messageHi: 'क'.repeat(301) }, NOW).messageHi);
  assert.deepEqual(validateBlock({ ...GOOD, messageHi: 'क'.repeat(300) }, NOW), {});
  assert.ok(validateBlock({ ...GOOD, mode: 'until', until: '' }, NOW).until);
  assert.match(validateBlock({ ...GOOD, mode: 'until', until: '2020-01-01T10:00' }, NOW).until, /future/);
  assert.deepEqual(validateBlock({ ...GOOD, mode: 'until', until: '2030-01-01T10:00' }, NOW), {});
});

test('block request body', () => {
  assert.deepEqual(toBlockBody({ ...GOOD, reason: ' r ', message: ' m ' }), { reason: 'r', message: 'm', until: null, alsoBlockDevices: false });
  const b = toBlockBody({ ...GOOD, messageHi: ' नमस्ते ', alsoDevices: true, mode: 'until', until: '2030-01-01T10:00' });
  assert.equal(b.messageHi, 'नमस्ते');
  assert.equal(b.alsoBlockDevices, true);
  assert.match(b.until, /^2030-01-01T/);
});

test('re-blocking starts from the current block', () => {
  const f = blankBlockForm({ block: { active: true, reason: 'r', message: 'm', messageHi: 'h', until: '2030-01-01T10:00:00.000Z' } });
  assert.equal(f.message, 'm');
  assert.equal(f.mode, 'until');
  assert.ok(f.until);
  assert.equal(isDirty(f, f), false);
  assert.equal(isDirty({ ...f, reason: 'other' }, f), true);
  assert.equal(blankBlockForm({ block: { active: false, reason: 'old' } }).reason, '');
});

test('counter counts characters, not bytes', () => {
  assert.equal(counter('नमस्ते').used, 6);
  assert.equal(counter('x'.repeat(301)).over, true);
  assert.equal(counter('').label, '0 / 300');
});

test('server field errors map onto the form', () => {
  assert.deepEqual(serverFields({ body: { fields: { message: 'Required', until: true } } }), { message: 'Required', until: 'Not accepted.' });
  assert.deepEqual(serverFields({}), {});
});

test('phone preview model: language, fallback, end time in India time', () => {
  const f = { ...GOOD, messageHi: '', mode: 'until', until: '2030-01-01T10:00' };
  const en = phoneModel(f, 'en');
  assert.equal(en.title, 'Account blocked');
  assert.equal(en.message, 'Your account is blocked.');
  assert.equal(en.usingDefault, false);
  assert.match(en.until, /^Until /);
  assert.match(en.until, /IST$/);
  const hi = phoneModel(f, 'hi');
  assert.equal(hi.message, 'Your account is blocked.', 'Hindi falls back to English');
  assert.equal(hi.fellBack, true);
  assert.equal(hi.title, 'खाता ब्लॉक है');
  assert.equal(phoneModel({ ...f, messageHi: 'आपका खाता ब्लॉक है।' }, 'hi').message, 'आपका खाता ब्लॉक है।');
  const empty = phoneModel({ ...GOOD, message: '' }, 'en');
  assert.equal(empty.usingDefault, true);
  assert.ok(empty.message.length > 10);
  assert.equal(phoneModel(GOOD, 'en').until, '');
  assert.equal(untilLabel('2026-10-16T12:30:00.000Z'), 'Until 16 Oct 2026, 6:00 pm IST');
  assert.deepEqual(phoneModel(GOOD, 'en').buttons, ['Try again', 'Sign out']);
});

test('device block form', () => {
  const f = blankDeviceForm('');
  assert.ok(validateDeviceBlock(f, NOW).deviceId);
  assert.ok(validateDeviceBlock({ ...GOOD, deviceId: 'has space' }, NOW).deviceId);
  assert.deepEqual(validateDeviceBlock({ ...GOOD, deviceId: 'abc123' }, NOW), {});
  assert.deepEqual(toDeviceBody({ ...GOOD, deviceId: ' abc ' }), { deviceId: 'abc', reason: GOOD.reason, message: GOOD.message, until: null });
});

/* ----------------------------------------------------------- tab / section state -- */
const FULL = {
  user: { uid: 'uid-abcdef123456', contact: '+919812304821', tags: ['vip'], notes: [{ id: 'n1' }], blockHistory: [{ action: 'block', at: '2026-10-01T00:00:00Z', by: 'admin', reason: 'r', message: 'm' }] },
  devices: [{ deviceId: 'd1', blocked: false }],
  wallet: { balance: 1461, recent: [{ id: 1 }] },
  bookings: { total: 3, recent: [{ id: 1 }] },
  events: { registrations: [], badges: [] },
  calls: { unavailable: true, reason: 'timeout' },
  audit: [],
};

test('fan-out tabs: unavailable is not empty, and a missing section counts as unavailable', () => {
  assert.equal(tabState(null, 'wallet'), 'loading');
  assert.equal(tabState(FULL, 'wallet'), 'ready');
  assert.equal(tabState(FULL, 'calls'), 'unavailable');
  assert.equal(tabState({ ...FULL, calls: undefined }, 'calls'), 'unavailable');
  assert.equal(tabState(FULL, 'events'), 'empty');
  assert.equal(tabState({ ...FULL, bookings: { total: 0, recent: [] } }, 'bookings'), 'empty');
  assert.equal(tabState(FULL, 'devices'), 'ready');
  assert.equal(tabState({ ...FULL, devices: [] }, 'devices'), 'empty');
  assert.equal(tabState(FULL, 'activity'), 'ready');
  assert.equal(tabState({ ...FULL, user: { ...FULL.user, blockHistory: [] } }, 'activity'), 'empty');
  assert.equal(tabState(FULL, 'profile'), 'ready');
  assert.deepEqual(unavailableTabs(FULL), ['calls']);
  assert.equal(isUnavailable({ unavailable: true }), true);
  assert.equal(isUnavailable({ unavailable: false }), false);
});

test('tab labels carry counts only when they are honest', () => {
  assert.equal(tabLabel(FULL, 'devices'), 'Devices (1)');
  assert.equal(tabLabel(FULL, 'wallet'), 'Wallet (1,461)');
  assert.equal(tabLabel(FULL, 'calls'), 'Calls');
  assert.equal(tabCount(FULL, 'calls'), undefined);
  assert.equal(tabLabel(null, 'devices'), 'Devices');
  assert.equal(tabLabel(FULL, 'notes'), 'Notes & tags (1)');
});

test('activity merges block history and audit rows, newest first', () => {
  const items = activityItems({ user: { blockHistory: [{ action: 'unblock', at: '2026-10-03T00:00:00Z', by: 'ravi' }, { action: 'block', at: '2026-10-01T00:00:00Z', by: 'admin', message: 'm', reason: 'r' }] }, audit: [{ id: 'e1', at: '2026-10-02T00:00:00Z', operator: 'sita', method: 'POST', path: '/api/admin/users/u1/tags' }] });
  assert.deepEqual(items.map((i) => i.kind), ['unblock', 'audit', 'block']);
  assert.match(items[1].title, /Changed admin\/users/);
  assert.match(items[2].detail, /Reason: r/);
});

/* ------------------------------------------------------------------- delete -- */
test('typed delete confirmation: contact, or the last 6 of the uid when the contact is masked', () => {
  const u = { contact: '+919812304821', uid: 'uid-abcdef123456' };
  assert.equal(deletePhrase(u), '+919812304821');
  assert.equal(deleteMatches('+919812304821', u), true);
  assert.equal(deleteMatches(' 123456 ', u), true);
  assert.equal(deleteMatches('+91981230482', u), false);
  assert.equal(deleteMatches('', u), false);
  const masked = { contact: '••••4821', uid: 'uid-abcdef123456' };
  assert.equal(deletePhrase(masked), '123456');
  assert.equal(deleteMatches('••••4821', masked), false, 'a masked value is never accepted');
  assert.equal(deleteMatches('123456', masked), true);
});

/* ------------------------------------------------------------------- export -- */
test('export confirm says what will be taken', () => {
  const sel = exportPlan({ filters: NO_FILTERS, sort: DEFAULT_SORT, selectedIds: ['a', 'b'], total: 900, now: NOW });
  assert.equal(sel.mode, 'selected');
  assert.equal(sel.count, 2);
  assert.equal(sel.query.ids, 'a,b');
  assert.match(sel.title, /2 selected users/);
  const all = exportPlan({ filters: { ...NO_FILTERS, status: 'blocked' }, sort: DEFAULT_SORT, selectedIds: [], total: 412, now: NOW });
  assert.equal(all.mode, 'filtered');
  assert.equal(all.count, 412);
  assert.equal(all.query.status, 'blocked');
  assert.equal('ids' in all.query, false);
  assert.ok(all.lines.some((l) => /audit/.test(l)));
  const many = exportPlan({ filters: NO_FILTERS, sort: DEFAULT_SORT, selectedIds: [], total: null, now: NOW });
  assert.equal(many.count, null);
  assert.ok(many.lines.some((l) => l.includes('50,000')));
  const big = exportPlan({ filters: NO_FILTERS, sort: DEFAULT_SORT, selectedIds: [], total: 80000, now: NOW });
  assert.equal(big.count, EXPORT_CAP);
  assert.equal(big.capped, true);
  assert.equal(exportFilename(new Date(2026, 9, 16), 'filtered'), 'users-2026-10-16.csv');
  assert.equal(exportFilename(new Date(2026, 9, 16), 'selected'), 'users-selected-2026-10-16.csv');
});

test('a selected export is only saved when it holds exactly the selection', () => {
  const csv = 'id,name\r\na,"Priya\nRao"\r\nb,Asha\r\n';
  assert.equal(csvDataRows(csv), 2);
  assert.equal(selectionExportOk(csv, 2), true);
  assert.equal(selectionExportOk(csv, 1), false, 'a server that ignored ids would send everyone');
  assert.equal(csvDataRows('id,name'), 0);
  assert.equal(csvDataRows(''), 0);
  assert.equal(csvDataRows('﻿id\r\n1'), 1);
});

/* -------------------------------------------------------------------- route -- */
test('users route parsing', () => {
  assert.deepEqual(parseUsersRoute([], {}), { view: 'list' });
  assert.deepEqual(parseUsersRoute(['blocked-devices'], {}), { view: 'devices' });
  assert.deepEqual(parseUsersRoute(['u1'], {}), { view: 'detail', id: 'u1', tab: 'profile', mode: 'drawer' });
  assert.equal(parseUsersRoute(['u1'], {}, { arrivedWithId: true }).mode, 'page');
  assert.equal(parseUsersRoute(['u1'], { page: '1' }).mode, 'page');
  assert.equal(parseUsersRoute(['u1'], { tab: 'devices' }).tab, 'devices');
  assert.equal(parseUsersRoute(['u1'], { tab: 'nonsense' }).tab, 'profile');
  assert.equal(userHash('u 1', { tab: 'wallet', page: true }), '#/people/users/u%201?tab=wallet&page=1');
  assert.equal(userHash('u1'), '#/people/users/u1');
});

test('the deep link resolves through the router, and the palette opens it', () => {
  const r = resolveRoute('#/people/users/65f0a1?tab=devices', MODULES, GROUPS);
  assert.equal(r.kind, 'module');
  assert.equal(r.module.id, 'Users');
  assert.deepEqual(r.rest, ['65f0a1']);
  assert.equal(r.query.tab, 'devices');
  assert.equal(r.legacy, false);
  assert.equal(buildHash('/people/users', ['65f0a1'], {}), '#/people/users/65f0a1');
  const bd = resolveRoute('#/people/users/blocked-devices', MODULES, GROUPS);
  assert.equal(bd.module.id, 'Users');
  assert.equal(childFor(bd.module, bd.rest)?.title, 'Blocked devices');
  assert.equal(childFor(bd.module, ['65f0a1']), null);
});

test('Blocked devices is a palette entry under Users with the same area', () => {
  const kids = childModules(MODULES);
  assert.equal(kids.length, 1);
  assert.equal(kids[0].route, '/people/users/blocked-devices');
  assert.deepEqual(kids[0].area, 'devotees');
  assert.deepEqual(kids[0].breadcrumb, ['People', 'Users', 'Blocked devices']);
  assert.equal(rankModules([...MODULES, ...kids], 'blocked dev')[0].id, 'Users/blocked-devices');
});

/* ------------------------------------------------------------------- format -- */
test('status, version and row patch', () => {
  assert.deepEqual(statusOf({ blocked: false }), { tone: 'success', label: 'Active' });
  assert.equal(statusOf({ blocked: true }).label, 'Blocked');
  assert.match(statusOf({ blocked: true, blockUntil: '2030-01-05T00:00:00Z' }).label, /^Blocked until 5 Jan/);
  assert.equal(versionLabel({ versionName: '1.3.0', versionCode: 13 }), '1.3.0 (13)');
  assert.equal(versionLabel({ versionCode: 12 }), 'Build 12');
  assert.equal(versionLabel({}), '—');
  assert.deepEqual(rowPatch({ block: { active: true, until: null }, tags: ['a'] }), { blocked: true, blockUntil: null, tags: ['a'] });
  assert.deepEqual(rowPatch({ block: { active: false, until: '2030-01-01' } }), { blocked: false, blockUntil: null });
  assert.deepEqual(rowPatch(null), {});
});
