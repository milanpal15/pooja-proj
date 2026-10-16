// The area registry, the built-in presets and the pure helpers custom roles are built on (docs/ROLES.md sections 1 and 4).
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  AREAS, AREA_INFO, AUDIT_DETAIL_MAX_BYTES, BUILTIN_ROLES, ROLE_PERMISSIONS, can, decodeAuditDetail, encodeAuditDetail, hasPermission, missingPermissions, normalizePermissions,
  permissionsFor, sanitizeAuditDetail, sanitizeAuditValue,
} from './index.js';
import { areaFor } from './operator/access/routes.js';

describe('area registry', () => {
  test('every area has a label, a description and a sidebar group; AREAS is derived from it', () => {
    assert.deepEqual(AREAS, AREA_INFO.map((a) => a.key));
    assert.equal(new Set(AREAS).size, AREAS.length);
    for (const a of AREA_INFO) {
      assert.ok(a.label && a.description && a.group, a.key);
      assert.match(a.key, /^[a-z]+$/);
    }
    for (const k of ['releases', 'approvals', 'audit', 'roles', 'events']) assert.ok(AREAS.includes(k), k);
    assert.equal(AREAS.length, 21);
  });
  test('the first 17 areas are the monolith\'s, in order', () => {
    assert.deepEqual(AREAS.slice(0, 17), ['overview', 'content', 'horoscope', 'panchang', 'announcements', 'push', 'flags', 'policies', 'devotees', 'astrologers', 'money', 'wallets', 'orders', 'calls', 'payouts', 'operators', 'events']);
  });
});

describe('built-in presets (docs/ROLES.md section 1)', () => {
  test('admin holds everything, including the new areas', () => {
    for (const a of AREAS) for (const l of ['view', 'edit']) assert.ok(can('admin', a, l), `${a}:${l}`);
  });
  test('editor: today\'s rights + releases:view, approvals:view; no audit, roles, operators, devotees, push', () => {
    const p = permissionsFor('editor');
    for (const x of ['releases:view', 'approvals:view', 'content:edit', 'events:edit', 'flags:view', 'overview:view']) assert.ok(hasPermission(p, x), x);
    for (const x of ['releases:edit', 'approvals:edit', 'audit:view', 'roles:view', 'operators:view', 'devotees:view', 'push:view', 'flags:edit']) assert.equal(hasPermission(p, x), false, x);
  });
  test('viewer: views only (incl. releases and approvals); nothing editable; no admin-only areas', () => {
    const p = permissionsFor('viewer');
    assert.ok(hasPermission(p, 'releases:view') && hasPermission(p, 'approvals:view'));
    assert.equal(p.some((x) => x.endsWith(':edit')), false);
    for (const x of ['audit:view', 'roles:view', 'operators:view', 'devotees:view', 'push:view']) assert.equal(hasPermission(p, x), false, x);
  });
  test('admin-only areas are exactly operators, devotees, push, audit, roles', () => {
    const adminOnly = AREAS.filter((a) => !hasPermission(permissionsFor('viewer'), `${a}:view`));
    assert.deepEqual(adminOnly.sort(), ['audit', 'devotees', 'operators', 'push', 'roles']);
  });
  test('unknown role => no permissions (fail closed)', () => {
    assert.deepEqual(permissionsFor('ghost'), []);
    assert.equal(can('ghost', 'overview', 'view'), false);
    assert.deepEqual(BUILTIN_ROLES.map((r) => r.key), ['admin', 'editor', 'viewer']);
    for (const r of BUILTIN_ROLES) assert.ok(r.name && r.description);
    assert.deepEqual(Object.keys(ROLE_PERMISSIONS), ['admin', 'editor', 'viewer']);
  });
});

describe('normalizePermissions', () => {
  test('edit implies view (both stored), duplicates collapse, order follows the registry', () => {
    assert.deepEqual(normalizePermissions(['flags:edit', 'content:view', 'flags:view', 'content:view']).permissions, ['content:view', 'flags:view', 'flags:edit']);
    assert.deepEqual(normalizePermissions([]).permissions, []);
  });
  test('unknown areas, bad levels and non-strings are reported, not stored', () => {
    const n = normalizePermissions(['nope:view', 'content:delete', 'content', 7, null, 'content:view', 'CONTENT:view']);
    assert.deepEqual(n.permissions, ['content:view']);
    assert.equal(n.invalid.length, 6);
    assert.deepEqual(normalizePermissions('content:view').permissions, [], 'not a list');
  });
});

describe('missingPermissions (the escalation test)', () => {
  test('what the holder lacks, with edit implying view', () => {
    assert.deepEqual(missingPermissions(['content:edit'], ['content:view', 'content:edit']), []);
    assert.deepEqual(missingPermissions(['content:view'], ['content:view', 'content:edit']), ['content:edit']);
    assert.deepEqual(missingPermissions([], ['roles:edit']), ['roles:edit']);
    assert.deepEqual(missingPermissions(undefined, ['x:view']), ['x:view']);
    assert.deepEqual(missingPermissions(['roles:edit'], undefined), []);
  });
});

describe('route table for the new areas', () => {
  test('every new path maps to its area; GET is view, writes are edit; the roles list is also readable with operators:view', () => {
    const cases = [
      ['GET', '/admin/releases', 'releases', 'view'], ['POST', '/admin/releases', 'releases', 'edit'], ['PUT', '/admin/releases/abc', 'releases', 'edit'],
      ['POST', '/admin/releases/abc/withdraw', 'releases', 'edit'], ['PUT', '/admin/version-policy', 'releases', 'edit'], ['POST', '/admin/version-policy/impact', 'releases', 'edit'],
      ['GET', '/admin/versions/usage', 'releases', 'view'], ['GET', '/admin/approvals', 'approvals', 'view'], ['PUT', '/admin/approvals/settings', 'approvals', 'edit'],
      ['POST', '/admin/approvals/abc/approve', 'approvals', 'edit'], ['GET', '/admin/audit-log', 'audit', 'view'], ['GET', '/admin/roles', 'roles', 'view'],
      ['POST', '/admin/roles', 'roles', 'edit'], ['PUT', '/admin/roles/support', 'roles', 'edit'], ['DELETE', '/admin/roles/support', 'roles', 'edit'], ['POST', '/admin/roles/support/duplicate', 'roles', 'edit'],
    ];
    for (const [m, p, area, level] of cases) {
      const a = areaFor(m, p);
      assert.deepEqual([a.area, a.level, a.mapped], [area, level, true], `${m} ${p}`);
    }
    assert.equal(areaFor('GET', '/admin/roles').viewAlso, 'operators:view');
    assert.equal(areaFor('POST', '/admin/roles').viewAlso, 'operators:view', 'declared, but the gate only honours it for reads');
    assert.equal(areaFor('GET', '/admin/roles/support').viewAlso, undefined);
    assert.equal(areaFor('GET', '/flags/full').viewAlso, undefined, 'the key is absent for ordinary rows');
  });
});

describe('audit detail', () => {
  test('secret-looking keys and personal data are dropped at any depth; strings are clipped; depth is bounded', () => {
    const v = sanitizeAuditValue({ ok: 1, password: 'x', nested: { apiKey: 'k', fine: 'y', passwordHash: 'h', list: [{ token: 't', n: 2 }] }, phone: '+91', email: 'a@b', contact: 'c', long: 'z'.repeat(900), __v: 3 });
    assert.deepEqual(Object.keys(v).sort(), ['long', 'nested', 'ok']);
    assert.deepEqual(v.nested, { fine: 'y', list: [{ n: 2 }] });
    assert.equal(v.long.length, 503);
    assert.equal(JSON.stringify(sanitizeAuditValue({ a: { b: { c: { d: { e: { f: { g: 1 } } } } } } })).includes('[nested]'), true);
  });
  test('encode / decode round-trips a sanitised {before, after, selfApproved}; garbage decodes to null', () => {
    const header = encodeAuditDetail({ before: { min: 3 }, after: { min: 5, password: 'no' }, selfApproved: true });
    assert.deepEqual(decodeAuditDetail(header), { before: { min: 3 }, after: { min: 5 }, selfApproved: true });
    for (const bad of [undefined, null, '', 'not base64 json', 12, 'x'.repeat(30_000), Buffer.from('[1,2').toString('base64')]) assert.equal(decodeAuditDetail(bad), null);
    assert.equal(decodeAuditDetail(Buffer.from('{}').toString('base64')), null, 'nothing to keep');
    assert.equal(sanitizeAuditDetail({ before: null, after: null }), null);
  });
  test('an oversized side is replaced by a marker so the stored value stays within the limit', () => {
    const big = { text: 'a'.repeat(499), list: Array.from({ length: 100 }, (_, i) => ({ i, s: 'b'.repeat(400) })) };
    const d = sanitizeAuditDetail({ before: big, after: { ok: 1 } });
    assert.deepEqual(d.before, { _truncated: true });
    assert.deepEqual(d.after, { ok: 1 });
    assert.ok(JSON.stringify(decodeAuditDetail(encodeAuditDetail({ before: big, after: big }))).length < 2 * AUDIT_DETAIL_MAX_BYTES);
  });
});
