// The version decision, exhaustively: every status, the ordering between them, grace, unidentified callers, the OS notice, maintenance allow-list.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { BLOCKING_STATUSES, evaluatePolicy, intOrNull, isBlocking, policyResponse } from './app-policy.js';

const NOW = Date.parse('2026-10-16T10:00:00Z');
const past = '2026-10-15T10:00:00Z';
const future = '2026-10-17T10:00:00Z';
const names = new Map([[5, '1.2.0'], [8, '1.5.0'], [10, '2.0.0']]);
const ev = (policy, caller = {}) => evaluatePolicy(policy, { versionCode: 7, osApi: 30, now: NOW, names, ...caller });
const status = (policy, caller) => ev(policy, caller).status;

describe('intOrNull', () => {
  test('accepts whole numbers and digit strings only', () => {
    for (const [v, want] of [[0, 0], [12, 12], ['12', 12], [' 7 ', 7], [999999999, 999999999]]) assert.equal(intOrNull(v), want, String(v));
    for (const v of [-1, 1.5, NaN, Infinity, '', 'abc', '1e3', '-3', '1.5', null, undefined, {}, [], true, 1e12, '1234567890']) assert.equal(intOrNull(v), null, String(v));
  });
});

describe('every status', () => {
  test('no policy at all, or an empty one, is ok', () => {
    assert.equal(status(null), 'ok');
    assert.equal(status(undefined), 'ok');
    assert.equal(status({}), 'ok');
    assert.equal(status({ minVersionCode: null, recommendedVersionCode: null, blockedVersionCodes: [], minOsApi: null, maintenance: { enabled: false } }), 'ok');
  });

  test('maintenance: on, no end time => everyone; before the end => everyone; at / after the end => over', () => {
    const m = (extra) => ({ maintenance: { enabled: true, message: 'Back soon', messageHi: 'जल्द', ...extra } });
    const r = ev(m({}));
    assert.deepEqual([r.status, r.message, r.messageHi, r.maintenanceUntil], ['maintenance', 'Back soon', 'जल्द', null]);
    assert.equal(ev(m({ until: future })).maintenanceUntil, '2026-10-17T10:00:00.000Z');
    assert.equal(status(m({ until: future })), 'maintenance');
    assert.equal(status(m({ until: new Date(NOW).toISOString() })), 'ok', 'now == until: over');
    assert.equal(status(m({ until: past })), 'ok');
    assert.equal(status({ maintenance: { enabled: false, message: 'x' } }), 'ok', 'off');
    assert.equal(status({ maintenance: { enabled: 'yes' } }), 'ok', 'only a real true switches it on');
  });

  test('maintenance falls back to the policy message when it has none of its own', () => {
    const r = ev({ message: 'Update please', messageHi: 'अपडेट', maintenance: { enabled: true } });
    assert.deepEqual([r.message, r.messageHi], ['Update please', 'अपडेट']);
  });

  test('maintenance allow-list: a listed uid passes, others and anonymous do not', () => {
    const p = { maintenance: { enabled: true, allowUids: ['u-tester'] } };
    assert.equal(status(p, { uid: 'u-tester' }), 'ok');
    assert.equal(status(p, { uid: 'u-other' }), 'maintenance');
    assert.equal(status(p, { uid: null }), 'maintenance');
    assert.equal(status(p, {}), 'maintenance');
    assert.equal(status({ maintenance: { enabled: true, allowUids: [] } }, { uid: 'u-tester' }), 'maintenance');
  });

  test('blocked: the listed build only', () => {
    const p = { blockedVersionCodes: [6, 7], message: 'This build has a serious bug', storeUrl: 'https://play.google.com/x', minVersionCode: 8 };
    const r = ev(p);
    assert.deepEqual([r.status, r.message, r.storeUrl, r.minVersionName], ['blocked', 'This build has a serious bug', 'https://play.google.com/x', '1.5.0']);
    assert.equal(status(p, { versionCode: 9 }), 'ok');
    assert.equal(status(p, { versionCode: 6 }), 'blocked');
    assert.equal(status({ blockedVersionCodes: [7] }, { versionCode: '7' }), 'blocked', 'a digit string is a version code');
  });

  test('update_required: below the minimum; the minimum itself and above are fine', () => {
    const p = { minVersionCode: 8, message: 'Please update', messageHi: 'अपडेट करें', storeUrl: 'https://s' };
    const r = ev(p);
    assert.deepEqual([r.status, r.message, r.messageHi, r.storeUrl, r.minVersionName, r.graceUntil], ['update_required', 'Please update', 'अपडेट करें', 'https://s', '1.5.0', null]);
    assert.equal(status(p, { versionCode: 8 }), 'ok');
    assert.equal(status(p, { versionCode: 9 }), 'ok');
    assert.equal(status(p, { versionCode: 0 }), 'update_required', 'versionCode 0 is a real build');
  });

  test('a version name the registry does not know is "build N"', () => {
    assert.equal(ev({ minVersionCode: 9 }).minVersionName, 'build 9');
    assert.equal(ev({ recommendedVersionCode: 11 }).recommendedVersionName, 'build 11');
    assert.equal(ev({}).minVersionName, null);
    assert.equal(ev({ minVersionCode: 10 }, { names: { 10: 'two' } }).minVersionName, 'two', 'a plain object works');
    assert.equal(ev({ minVersionCode: 10 }, { names: (c) => (c === 10 ? 'fn' : undefined) }).minVersionName, 'fn', 'so does a function');
  });

  test('unsupported_os: a notice below minOsApi; the minimum itself is fine; unknown osApi is not judged', () => {
    const p = { minOsApi: 26, message: 'Your phone is too old' };
    assert.equal(status(p, { osApi: 25 }), 'unsupported_os');
    assert.equal(status(p, { osApi: 26 }), 'ok');
    assert.equal(status(p, { osApi: undefined }), 'ok');
    assert.equal(status(p, { osApi: 'abc' }), 'ok');
    assert.equal(isBlocking('unsupported_os'), false, 'a notice, never a block');
  });

  test('update_available: below the recommended build only', () => {
    const p = { recommendedVersionCode: 10 };
    assert.equal(status(p), 'update_available');
    assert.equal(status(p, { versionCode: 10 }), 'ok');
    assert.equal(status(p, { versionCode: 11 }), 'ok');
    assert.equal(ev(p).recommendedVersionName, '2.0.0');
  });

  test('snoozeDays comes from the policy (1..30), else 3', () => {
    assert.equal(ev({ snoozeDays: 10 }).snoozeDays, 10);
    for (const bad of [0, 31, 2.5, '5', null, undefined]) assert.equal(ev({ snoozeDays: bad }).snoozeDays, 3, String(bad));
  });
});

describe('ordering', () => {
  const everything = {
    maintenance: { enabled: true, message: 'm' }, blockedVersionCodes: [7], minVersionCode: 9, recommendedVersionCode: 12, minOsApi: 33, message: 'p',
  };
  test('maintenance beats blocked beats update_required beats unsupported_os beats update_available', () => {
    assert.equal(status(everything), 'maintenance');
    assert.equal(status({ ...everything, maintenance: { enabled: false } }), 'blocked');
    assert.equal(status({ ...everything, maintenance: { enabled: false }, blockedVersionCodes: [] }), 'update_required');
    assert.equal(status({ ...everything, maintenance: { enabled: false }, blockedVersionCodes: [], minVersionCode: 7 }), 'unsupported_os');
    assert.equal(status({ ...everything, maintenance: { enabled: false }, blockedVersionCodes: [], minVersionCode: 7, minOsApi: 30 }), 'update_available');
    assert.equal(status({ ...everything, maintenance: { enabled: false }, blockedVersionCodes: [], minVersionCode: 7, minOsApi: 30, recommendedVersionCode: 7 }), 'ok');
  });

  test('a blocked build above the minimum is still blocked; below the minimum a blocked build is "blocked", not "update_required"', () => {
    assert.equal(status({ minVersionCode: 5, blockedVersionCodes: [7] }), 'blocked');
    assert.equal(status({ minVersionCode: 9, blockedVersionCodes: [7] }), 'blocked');
  });

  test('update_required beats the OS notice (a phone too old AND a build too old must update first)', () => {
    assert.equal(status({ minVersionCode: 9, minOsApi: 33 }, { osApi: 28 }), 'update_required');
  });
});

describe('grace', () => {
  const p = (graceUntil) => ({ minVersionCode: 9, recommendedVersionCode: 10, graceUntil, message: 'Update by the date' });

  test('before the grace date a too-old build gets a dated nudge, not a block', () => {
    const r = ev(p(future));
    assert.deepEqual([r.status, r.graceUntil, r.message], ['update_available', '2026-10-17T10:00:00.000Z', 'Update by the date']);
    assert.equal(isBlocking(r.status), false);
  });
  test('at the grace date and after it the build is blocked from the app; graceUntil is not repeated', () => {
    assert.equal(status(p(new Date(NOW).toISOString())), 'update_required', 'now == graceUntil: ended');
    const r = ev(p(past));
    assert.deepEqual([r.status, r.graceUntil], ['update_required', null]);
    assert.equal(status(p(null)), 'update_required');
    assert.equal(status(p('garbage')), 'update_required', 'an unreadable date is no grace');
  });
  test('grace never helps a blocked build or maintenance', () => {
    assert.equal(status({ ...p(future), blockedVersionCodes: [7] }), 'blocked');
    assert.equal(status({ ...p(future), maintenance: { enabled: true } }), 'maintenance');
  });
  test('grace does not touch builds at or above the minimum', () => {
    assert.equal(status(p(future), { versionCode: 9 }), 'update_available', 'only the recommended nudge');
    assert.equal(ev(p(future), { versionCode: 9 }).graceUntil, null);
    assert.equal(status(p(future), { versionCode: 10 }), 'ok');
  });
});

describe('missing or invalid version code (unidentified callers)', () => {
  const policy = { minVersionCode: 9, recommendedVersionCode: 12, blockedVersionCodes: [7], minOsApi: 33, message: 'm' };
  const weird = [undefined, null, '', 'abc', -3, 2.5, NaN, '12abc', {}, [], 'null'];
  test('are let through ("ok") when blockUnversioned is off - even with a minimum, a block list and an OS floor', () => {
    for (const v of weird) assert.equal(status(policy, { versionCode: v }), 'ok', JSON.stringify(v));
  });
  test('are refused as update_required when blockUnversioned is on', () => {
    for (const v of weird) {
      const r = ev({ ...policy, blockUnversioned: true }, { versionCode: v });
      assert.deepEqual([r.status, r.message], ['update_required', 'm'], JSON.stringify(v));
    }
    assert.equal(status({ blockUnversioned: true }, { versionCode: 5 }), 'ok', 'a real build is unaffected');
  });
  test('maintenance still applies to them', () => {
    assert.equal(status({ ...policy, maintenance: { enabled: true } }, { versionCode: undefined }), 'maintenance');
  });
  test('an unidentified caller still honours the allow-list', () => {
    assert.equal(status({ maintenance: { enabled: true, allowUids: ['u'] }, blockUnversioned: true }, { versionCode: undefined, uid: 'u' }), 'update_required', 'passes maintenance, then is unversioned');
  });
});

describe('inputs', () => {
  test('policy dates may be Date objects, ISO strings or epoch numbers; `now` may be a Date', () => {
    const p = (d) => ({ minVersionCode: 9, graceUntil: d });
    assert.equal(status(p(new Date(NOW + 1000))), 'update_available');
    assert.equal(status(p(NOW + 1000)), 'update_available');
    assert.equal(evaluatePolicy(p(NOW + 1000), { versionCode: 7, now: new Date(NOW + 2000) }).status, 'update_required');
  });
  test('junk in the policy never throws', () => {
    for (const p of [{ blockedVersionCodes: 'x' }, { blockedVersionCodes: [null, 'a', 7] }, { maintenance: 'on' }, { minVersionCode: 'nine' }, { minOsApi: -1 }, 42, 'str', []]) {
      assert.doesNotThrow(() => ev(p));
    }
    assert.equal(status({ blockedVersionCodes: [null, 'a', 7] }), 'blocked');
    assert.equal(status({ minVersionCode: 'nine' }), 'ok');
  });
  test('result shape is stable', () => {
    assert.deepEqual(Object.keys(ev({})).sort(), ['graceUntil', 'maintenanceUntil', 'message', 'messageHi', 'minVersionName', 'recommendedVersionName', 'snoozeDays', 'status', 'storeUrl']);
    assert.deepEqual(BLOCKING_STATUSES, ['maintenance', 'blocked', 'update_required']);
  });
  test('policyResponse adds the server time', () => {
    assert.equal(policyResponse(ev({}), NOW).serverTime, '2026-10-16T10:00:00.000Z');
  });
});
