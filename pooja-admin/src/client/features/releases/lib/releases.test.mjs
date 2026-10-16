import assert from 'node:assert/strict';
import test from 'node:test';

import { chartModel, classify, headline, impactBody } from './impact.js';
import { previewCards } from './phone.js';
import { blankForm, fromPolicy, isDirty, riskReasons, serverFields, toBody, validate } from './policy.js';
import { blankRelease, policyPatch, timeline, validateRelease } from './release.js';

const policy = { minVersionCode: 10, recommendedVersionCode: 12, blockedVersionCodes: [11], minOsApi: 26, graceUntil: null, snoozeDays: 3, message: 'Update', messageHi: '', storeUrl: 'https://play.google.com/x', blockUnversioned: false, maintenance: { enabled: false, message: '', messageHi: '', until: null, allowUids: [] } };

test('form round trip', () => {
  const f = fromPolicy(policy);
  assert.equal(f.minVersionCode, '10');
  assert.deepEqual(toBody(f).blockedVersionCodes, [11]);
  assert.equal(toBody(f).graceUntil, null);
  assert.equal(isDirty(f, fromPolicy(policy)), false);
  assert.equal(isDirty({ ...f, minVersionCode: '11' }, fromPolicy(policy)), true);
  assert.deepEqual(validate(f), {});
  assert.equal(toBody(blankForm()).minVersionCode, null);
});

test('validation mirrors the server', () => {
  const f = fromPolicy(policy);
  assert.ok(validate({ ...f, minVersionCode: '-1' }).minVersionCode);
  assert.ok(validate({ ...f, minVersionCode: '1.5' }).minVersionCode);
  assert.ok(validate({ ...f, minVersionCode: '12', recommendedVersionCode: '11' }).recommendedVersionCode);
  assert.deepEqual(validate({ ...f, minVersionCode: '', recommendedVersionCode: '3' }), {});
  assert.ok(validate({ ...f, message: 'x'.repeat(301) }).message);
  assert.deepEqual(validate({ ...f, message: 'x'.repeat(300) }), {});
  assert.ok(validate({ ...f, blockedVersionCodes: Array.from({ length: 51 }, (_, i) => i) }).blockedVersionCodes);
  assert.ok(validate({ ...f, snoozeDays: '31' }).snoozeDays);
  assert.ok(validate({ ...f, storeUrl: 'play store' }).storeUrl);
  assert.ok(validate({ ...f, graceUntil: 'garbage' }).graceUntil);
  assert.ok(validate({ ...f, maintenance: { ...f.maintenance, allowUids: Array.from({ length: 51 }, (_, i) => `u${i}`) } })['maintenance.allowUids']);
  assert.ok(validate({ ...f, maintenance: { ...f.maintenance, message: 'y'.repeat(301) } })['maintenance.message']);
});

test('risky vs relief', () => {
  const body = (patch) => ({ ...toBody(fromPolicy(policy)), ...patch });
  assert.deepEqual(riskReasons(policy, body({})), []);
  assert.equal(riskReasons(policy, body({ minVersionCode: 11 })).length, 1, 'min raised');
  assert.deepEqual(riskReasons(policy, body({ minVersionCode: 8 })), [], 'min lowered is relief');
  assert.deepEqual(riskReasons(policy, body({ blockedVersionCodes: [] })), [], 'unblocking is relief');
  assert.equal(riskReasons(policy, body({ blockedVersionCodes: [9, 11] })).length, 1, 'block added');
  assert.equal(riskReasons(policy, body({ maintenance: { ...policy.maintenance, enabled: true } })).length, 1);
  assert.deepEqual(riskReasons({ ...policy, maintenance: { enabled: true } }, body({})), [], 'turning maintenance off is relief');
  assert.equal(riskReasons(policy, body({ blockUnversioned: true })).length, 1);
  const g = { ...policy, graceUntil: '2026-11-01T00:00:00.000Z' };
  assert.equal(riskReasons(g, { ...toBody(fromPolicy(g)), graceUntil: '2026-10-20T00:00:00.000Z' }).length, 1, 'earlier');
  assert.deepEqual(riskReasons(g, { ...toBody(fromPolicy(g)), graceUntil: '2026-12-01T00:00:00.000Z' }), [], 'later is relief');
  assert.ok(riskReasons(null, body({ minVersionCode: 3 })).length >= 1);
});

test('server field errors', () => {
  assert.deepEqual(serverFields({ fields: { message: 'too long' } }), { message: 'too long' });
  assert.deepEqual(serverFields({ fields: [{ field: 'minVersionCode', message: 'bad' }] }), { minVersionCode: 'bad' });
  assert.deepEqual(serverFields(null), {});
});

test('impact body and chart model', () => {
  const f = fromPolicy(policy);
  assert.deepEqual(impactBody({ ...f, minVersionCode: '12' }), { minVersionCode: 12, recommendedVersionCode: 12, blockedVersionCodes: [11], minOsApi: 26 });
  assert.equal(impactBody({ ...f, minVersionCode: 'x' }), null);
  assert.equal(impactBody({ ...f, minVersionCode: '' }).minVersionCode, null);
  const hyp = { minVersionCode: 12, recommendedVersionCode: 14, blockedVersionCodes: [13] };
  assert.equal(classify(13, hyp), 'blocked');
  assert.equal(classify(11, hyp), 'below_min');
  assert.equal(classify(12, hyp), 'nudged');
  assert.equal(classify(14, hyp), 'ok');
  const m = chartModel([{ versionCode: 11, devices: 10 }, { versionCode: 14, versionName: '1.4.0', devices: 40, pctOfActiveDevices7d: 61.23 }], hyp);
  assert.deepEqual(m.rows.map((r) => r.code), [14, 11]);
  assert.equal(m.rows[0].label, '1.4.0 (14)');
  assert.equal(m.rows[0].pct, '61.2%');
  assert.equal(m.rows[0].share, 1);
  assert.equal(m.rows[1].pct, '—');
  assert.equal(chartModel([], hyp).rows.length, 0);
  const h = headline({ devices: { total: 900, blocked: 412, nudged: 1204, unsupportedOs: 0 }, users: { blockedActive7d: 305, blockedActive30d: 380 } });
  assert.equal(h.blocks, 'blocks 412 devices · 305 users active in 7d');
  assert.equal(headline(null), null);
});

test('phone previews use the operator words and hide a missing store button', () => {
  const f = { ...fromPolicy(policy), messageHi: 'हिंदी', storeUrl: '' };
  const en = previewCards(f, 'en');
  assert.equal(en.length, 5);
  assert.equal(en[0].message, 'Update');
  assert.deepEqual(en[0].buttons, []);
  assert.equal(previewCards(f, 'hi')[0].message, 'हिंदी');
  assert.equal(previewCards({ ...f, messageHi: '' }, 'hi')[0].message, 'Update', 'falls back to English');
  assert.equal(en[2].usingDefault, true);
  assert.deepEqual(previewCards({ ...f, storeUrl: 'https://x.y' }, 'en')[0].buttons, ['Update now']);
});

test('release wizard rules', () => {
  const f = { ...blankRelease(), versionName: '1.4.0', versionCode: '14' };
  assert.deepEqual(validateRelease(f, 0, [13]), {});
  assert.ok(validateRelease(f, 0, [14]).versionCode);
  assert.deepEqual(validateRelease(f, 0, [14], true), {});
  assert.ok(validateRelease({ ...f, versionCode: '0' }, 0).versionCode);
  assert.ok(validateRelease({ ...f, versionName: ' ' }, 0).versionName);
  assert.deepEqual(policyPatch({ ...f, status: 'draft' }), null);
  assert.deepEqual(policyPatch({ ...f, recommend: false }), null);
  assert.deepEqual(policyPatch(f), { recommendedVersionCode: 14 });
  assert.deepEqual(policyPatch({ ...f, setMinimum: true, graceUntil: '2026-11-01T10:00' }), { recommendedVersionCode: 14, minVersionCode: 14, graceUntil: '2026-11-01T10:00' });
});

test('timeline tags and usage', () => {
  const rows = timeline([{ versionCode: 11 }, { versionCode: 12 }, { versionCode: 10 }], policy, { byVersion: [{ versionCode: 12, devices: 5, activeDevices7d: 4 }] });
  assert.deepEqual(rows.map((r) => r.versionCode), [12, 11, 10]);
  assert.deepEqual(rows[0].tags, ['Recommended']);
  assert.deepEqual(rows[1].tags, ['Blocked']);
  assert.deepEqual(rows[2].tags, ['Minimum']);
  assert.equal(rows[0].devices, 5);
  assert.equal(rows[2].devices, null);
});
