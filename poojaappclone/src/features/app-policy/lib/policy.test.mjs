/**
 * The version gate's decisions: status classification, snooze maths, grace display, offline cache,
 * the 426/503 parser, the telemetry headers and the gate bus.
 *
 *   node --test src/features/app-policy/lib/policy.test.mjs
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

const P = load(path.join(here, 'policy.ts'));
const H = load(path.join(here, '../../../lib/app-headers.ts'));
const G = load(path.join(here, '../../../lib/api/gate-signal.ts'));

const NOW = Date.parse('2026-10-16T06:00:00Z');
const DAY = 86_400_000;
const pol = (o) => P.parsePolicy({ status: 'ok', ...o });

test('statusIsBlocking: the three blocking statuses only; unknown is not blocking', () => {
  for (const s of ['maintenance', 'blocked', 'update_required']) assert.equal(P.statusIsBlocking(s), true, s);
  for (const s of ['ok', 'update_available', 'unsupported_os', 'something_new', '', null, undefined]) assert.equal(P.statusIsBlocking(s), false, String(s));
});

test('parsePolicy fails open: unknown status, garbage and non-objects are ok', () => {
  assert.equal(pol({ status: 'quarantine' }).status, 'ok');
  for (const junk of [null, undefined, 'x', 42, [], '<html>']) {
    const p = P.parsePolicy(junk);
    assert.equal(p.status, 'ok');
    assert.equal(p.degraded, true);
  }
  assert.equal(pol({ status: 'ok', degraded: true }).degraded, true);
});

test('parsePolicy keeps good fields and sanitises bad ones', () => {
  const p = P.parsePolicy({
    status: 'update_required', message: 'Update', messageHi: 'अपडेट', storeUrl: 'https://play.google.com/x', minVersionName: '1.2.0',
    graceUntil: 'not a date', snoozeDays: 999, maintenanceUntil: '2026-10-16T12:00:00Z',
  });
  assert.equal(p.status, 'update_required');
  assert.equal(p.minVersionName, '1.2.0');
  assert.equal(p.graceUntil, null);
  assert.equal(p.snoozeDays, 30);
  assert.equal(p.maintenanceUntil, '2026-10-16T12:00:00Z');
  assert.equal(pol({ storeUrl: 'javascript:alert(1)' }).storeUrl, '');
  assert.equal(pol({ storeUrl: 'market://details?id=a.b' }).storeUrl, 'market://details?id=a.b');
  assert.equal(pol({ storeUrl: '' }).storeUrl, '');
  assert.equal(pol({ snoozeDays: 0 }).snoozeDays, 1);
  assert.equal(pol({}).snoozeDays, 3);
});

test('snooze maths: hidden while snoozed, back after, per offer', () => {
  const p = pol({ status: 'update_available', recommendedVersionName: '1.3.0', snoozeDays: 3 });
  assert.equal(P.shouldShowNudge(p, 0, NOW), true);
  const until = P.snoozeUntil(p, NOW);
  assert.equal(until, NOW + 3 * DAY);
  assert.equal(P.shouldShowNudge(p, until, NOW + DAY), false);
  assert.equal(P.shouldShowNudge(p, until, until), true);
  assert.equal(P.shouldShowNudge(pol({ status: 'ok' }), 0, NOW), false);
  assert.equal(P.shouldShowNudge(pol({ status: 'unsupported_os' }), 0, NOW), false);
  // a stored snooze only applies to the same offer
  const snooze = P.parseSnooze(JSON.stringify({ key: P.nudgeKey(p), until }));
  assert.equal(P.snoozedUntilFor(snooze, p), until);
  const newer = pol({ status: 'update_available', recommendedVersionName: '1.4.0' });
  assert.equal(P.snoozedUntilFor(snooze, newer), 0);
  assert.equal(P.parseSnooze('garbage'), null);
  assert.equal(P.parseSnooze(null), null);
});

test('snooze never outlives the grace deadline', () => {
  const grace = new Date(NOW + 2 * DAY).toISOString();
  const p = pol({ status: 'update_available', snoozeDays: 7, graceUntil: grace });
  assert.equal(P.snoozeUntil(p, NOW), Date.parse(grace));
  const past = pol({ status: 'update_available', snoozeDays: 7, graceUntil: new Date(NOW - DAY).toISOString() });
  assert.equal(P.snoozeUntil(past, NOW), NOW + 7 * DAY);
});

test('grace display is IST, en and hi, empty for junk', () => {
  // 2026-10-30T20:00Z is 31 Oct 01:30 IST
  assert.equal(P.formatIstDate('2026-10-30T20:00:00Z', 'en'), '31 Oct 2026');
  assert.equal(P.formatIstDate('2026-10-30T10:00:00Z', 'en'), '30 Oct 2026');
  assert.equal(P.formatIstDate('2026-10-30T10:00:00Z', 'hi'), '30 अक्तू 2026');
  assert.equal(P.formatIstDateTime('2026-10-16T12:30:00Z', 'en'), '16 Oct 2026, 6:00 PM');
  assert.equal(P.formatIstDateTime('2026-10-16T18:30:00Z', 'en'), '17 Oct 2026, 12:00 AM');
  assert.equal(P.formatIstDate(null, 'en'), '');
  assert.equal(P.formatIstDate('nope', 'en'), '');
  assert.equal(P.formatIstDateTime(null, 'en'), '');
});

test('pickMessage: Hindi only when Hindi is selected and written', () => {
  const p = { message: 'Please update', messageHi: 'कृपया अपडेट करें' };
  assert.equal(P.pickMessage(p, 'hi', 'fb'), 'कृपया अपडेट करें');
  assert.equal(P.pickMessage(p, 'en', 'fb'), 'Please update');
  assert.equal(P.pickMessage({ message: 'Please update', messageHi: '  ' }, 'hi', 'fb'), 'Please update');
  assert.equal(P.pickMessage({ message: '', messageHi: '' }, 'en', 'fb'), 'fb');
  assert.equal(P.pickMessage({ message: ' ', messageHi: '' }, 'hi', 'fb'), 'fb');
});

test('cache while offline: fresh used, stale/garbled/degraded ignored, expired maintenance dropped', () => {
  const blocked = pol({ status: 'update_required', minVersionName: '2.0' });
  assert.equal(P.readCache(P.serializeCache(blocked, NOW - DAY), NOW).status, 'update_required');
  assert.equal(P.readCache(P.serializeCache(blocked, NOW - 8 * DAY), NOW), null);
  assert.equal(P.readCache('{not json', NOW), null);
  assert.equal(P.readCache(null, NOW), null);
  assert.equal(P.readCache(JSON.stringify({ policy: { status: 'blocked' } }), NOW), null);
  assert.equal(P.readCache(P.serializeCache(P.parsePolicy('x'), NOW), NOW), null);
  const maint = pol({ status: 'maintenance', maintenanceUntil: new Date(NOW + DAY).toISOString() });
  assert.equal(P.readCache(P.serializeCache(maint, NOW - 1000), NOW).status, 'maintenance');
  assert.equal(P.readCache(P.serializeCache(maint, NOW - 1000), NOW + 2 * DAY).status, 'ok');
  assert.equal(P.effectivePolicy(pol({ status: 'maintenance' }), NOW).status, 'maintenance'); // no `until` = open ended
});

test('refetch throttle: 10 minutes unless forced', () => {
  assert.equal(P.shouldRefetch(null, NOW), true);
  assert.equal(P.shouldRefetch(NOW - 5 * 60_000, NOW), false);
  assert.equal(P.shouldRefetch(NOW - 10 * 60_000, NOW), true);
  assert.equal(P.shouldRefetch(NOW - 1000, NOW, true), true);
  assert.equal(P.shouldRefetch(NOW + 1000, NOW), true); // clock moved back
});

test('426 / 503 handling parser', () => {
  const upd = P.policyFromGateResponse(426, { code: 'app_outdated', status: 'update_required', message: 'm', minVersionName: '1.5', storeUrl: 'https://s.example/a' });
  assert.equal(upd.status, 'update_required');
  assert.equal(upd.minVersionName, '1.5');
  assert.equal(P.policyFromGateResponse(426, { code: 'app_outdated', status: 'blocked' }).status, 'blocked');
  assert.equal(P.policyFromGateResponse(426, { code: 'app_outdated', status: 'weird' }).status, 'update_required');
  const m = P.policyFromGateResponse(503, { code: 'maintenance', status: 'maintenance', message: 'down', maintenanceUntil: '2026-10-16T12:00:00Z' });
  assert.equal(m.status, 'maintenance');
  assert.equal(m.maintenanceUntil, '2026-10-16T12:00:00Z');
  // other 503s / 426s / bodies are not gate answers
  assert.equal(P.policyFromGateResponse(503, { error: 'db down' }), null);
  assert.equal(P.policyFromGateResponse(426, { code: 'other' }), null);
  assert.equal(P.policyFromGateResponse(426, null), null);
  assert.equal(P.policyFromGateResponse(200, { code: 'app_outdated' }), null);
});

test('gate bus: only real gate responses, listeners isolated, unsubscribe works', () => {
  assert.equal(G.isGateResponse(426, { code: 'app_outdated' }), true);
  assert.equal(G.isGateResponse(503, { code: 'maintenance' }), true);
  assert.equal(G.isGateResponse(503, { code: 'app_outdated' }), false);
  assert.equal(G.isGateResponse(500, { code: 'maintenance' }), false);
  assert.equal(G.isGateResponse(426, null), false);
  const seen = [];
  const off = G.onGateSignal((s) => seen.push(s.httpStatus));
  G.onGateSignal(() => {
    throw new Error('bad listener');
  });
  G.emitGateSignal({ httpStatus: 426, body: {} });
  off();
  G.emitGateSignal({ httpStatus: 503, body: {} });
  assert.deepEqual(seen, [426]);
});

test('telemetry headers: all five, omitted when unknown, never garbage', () => {
  const full = H.buildAppHeaders({ platform: 'android', versionName: '1.0.0', versionCode: 7, osApi: 34, deviceId: 'dev_abc123' });
  assert.deepEqual(full, {
    'X-App-Platform': 'android',
    'X-App-Version': '1.0.0',
    'X-App-Version-Code': '7',
    'X-OS-Api': '34',
    'X-Device-Id': 'dev_abc123',
  });
  const bare = H.buildAppHeaders({ platform: 'android', versionName: '1.0.0', versionCode: null, osApi: NaN, deviceId: null });
  assert.equal('X-App-Version-Code' in bare, false);
  assert.equal('X-OS-Api' in bare, false);
  assert.equal('X-Device-Id' in bare, false);
  assert.equal('X-Device-Id' in H.buildAppHeaders({ platform: 'android', versionName: '1', versionCode: 1, osApi: 1, deviceId: 'bad\nid' }), false);
  assert.equal(H.buildAppHeaders({ platform: 'android', versionName: '1', versionCode: -1, osApi: 1, deviceId: null })['X-App-Version-Code'], undefined);
});
