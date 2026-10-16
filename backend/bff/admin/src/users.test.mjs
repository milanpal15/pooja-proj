// The admin BFF for Users 360 and blocking (docs/USERS.md): the area gate per role, the relay to identity, audit before/after, the streamed CSV export.
// Stand-ins for the monolith and identity.  Run: node --test --test-concurrency=1 src/users.test.mjs   (no database needed)
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, beforeEach, describe, test } from 'node:test';

import { EXPORT_CAP, IDENTITY_ADMIN_ROUTES, ROLE_PERMISSIONS, areaFor, csvCell, encodeAuditDetail, verifyServiceToken } from '@bhakti/common';

import { createApp } from './app.js';
import { loadConfig } from './config.js';

const SECRET = 'test-secret-test-secret-1234';
const quiet = { info() {}, warn() {}, error() {} };
const ID = '000000000000000000000001';
const claimsOf = (req) => { try { return verifyServiceToken(req.headers.authorization?.replace(/^Bearer /, ''), { secret: SECRET }); } catch { return null; } };

let mono; let idn; let gw; let base; let clock = Date.now();
let idnCalls; let audits; let exportPages; let exportFail;
const OPS = {
  aaaaaaaaaaaaaaaaaaaaaaaa: { username: 'root', role: 'admin', password: 'root-pass', permissions: ROLE_PERMISSIONS.admin },
  bbbbbbbbbbbbbbbbbbbbbbbb: { username: 'ed', role: 'editor', password: 'ed-pass', permissions: ROLE_PERMISSIONS.editor },
  cccccccccccccccccccccccc: { username: 'looker', role: 'looker', password: 'looker-pass', permissions: ['devotees:view'] },
};

function listen(handler) {
  const s = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      handler(req, res, text ? JSON.parse(text) : undefined, (code, b, h = {}) => { res.writeHead(code, { 'content-type': 'application/json', ...h }); res.end(JSON.stringify(b)); });
    });
  });
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r(s)));
}

before(async () => {
  mono = await listen((_req, _res, _b, json) => json(200, { via: 'monolith' }));
  idn = await listen((req, _res, body, json) => {
    if (req.url === '/health') return json(200, {});
    const u = new URL(req.url, 'http://x');
    idnCalls.push({ method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), claims: claimsOf(req), body });
    if (u.pathname === '/internal/identity/operators/session') {
      const o = OPS[u.searchParams.get('id')];
      return json(200, o ? { required: true, authed: true, id: u.searchParams.get('id'), username: o.username, role: o.role, roleName: o.role, permissions: o.permissions } : { required: true, authed: false });
    }
    if (u.pathname === '/internal/identity/operators/login') {
      const e = Object.entries(OPS).find(([, o]) => o.username === body.username && o.password === body.password);
      return e ? json(200, { id: e[0], username: e[1].username, role: e[1].role, roleName: e[1].role, permissions: e[1].permissions }) : json(401, { error: 'no', code: 'bad_credentials' });
    }
    if (u.pathname === '/internal/identity/audit') { audits.push(body); return json(200, { ok: true }); }
    if (u.pathname === '/internal/identity/admin/users/export') {
      if (exportFail && u.searchParams.get('cursor')) return req.socket.destroy();
      const n = Number(u.searchParams.get('cursor') ?? 0);
      const page = exportPages[n];
      if (!page) return json(400, { error: 'bad', code: 'bad_cursor' });
      return json(200, { rows: page, next: n + 1 < exportPages.length ? String(n + 1) : null, capped: false });
    }
    const detail = req.method === 'POST' && u.pathname.endsWith('/block') ? { 'x-audit-detail': encodeAuditDetail({ before: { blocked: false }, after: { blocked: true, reason: 'spam' } }) } : {};
    json(req.method === 'POST' && u.pathname.endsWith('/notes') ? 201 : 200, { identity: true, method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), body }, detail);
  });
  const cfg = loadConfig({
    MONOLITH_URL: `http://127.0.0.1:${mono.address().port}`, IDENTITY_URL: `http://127.0.0.1:${idn.address().port}`,
    INTERNAL_JWT_SECRET: SECRET, ADMIN_SESSION_SECRET: 'cookie-secret-cookie-secret-12', SERVICE_TIMEOUT_MS: '1000',
  });
  gw = http.createServer(createApp(cfg, { logger: quiet, now: () => clock }));
  await new Promise((r) => gw.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${gw.address().port}`;
});
after(() => { for (const s of [gw, mono, idn]) { s.closeAllConnections?.(); s.close(); } });
beforeEach(() => { idnCalls = []; audits = []; exportFail = false; exportPages = [[]]; clock += 60_000; });

async function as(name) {
  const o = Object.values(OPS).find((x) => x.username === name);
  const res = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: name, password: o.password }) });
  return { cookie: res.headers.get('set-cookie').split(';')[0] };
}
async function call(method, path, { who, body } = {}) {
  const res = await fetch(`${base}${path}`, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(who ?? {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* csv */ }
  return { status: res.status, body: json, text, headers: res.headers };
}
const settle = () => new Promise((r) => setTimeout(r, 80));

describe('the area gate', () => {
  test('every Users route is area devotees: admin passes, editor is 403 (devotees is admin-only), a custom devotees:view role reads but cannot write or export', async () => {
    const root = await as('root'); const ed = await as('ed'); const looker = await as('looker');
    for (const r of IDENTITY_ADMIN_ROUTES.filter((x) => /^\/admin\/(users|blocked-devices)/.test(x.path))) {
      const path = `/api${r.sample ?? r.path}`;
      assert.equal(areaFor(r.method, r.sample ?? r.path).area, 'devotees');
      assert.equal((await call(r.method, path, { who: ed, body: r.method === 'GET' ? undefined : {} })).status, 403, `editor ${r.method} ${r.path}`);
      const lk = await call(r.method, path, { who: looker, body: r.method === 'GET' ? undefined : {} });
      const readable = r.method === 'GET' && !r.path.endsWith('/export');
      assert.equal(lk.status === 403, !readable, `looker ${r.method} ${r.path}`);
      if (!readable) assert.equal(lk.body.needs, r.path.endsWith('/export') ? 'devotees:edit' : 'devotees:edit');
      exportPages = [[]];
      assert.notEqual((await call(r.method, path, { who: root, body: r.method === 'GET' ? undefined : {} })).status, 403, `admin ${r.method} ${r.path}`);
    }
  });
});

describe('the relay', () => {
  test('list, 360, block and friends go to identity with the operator\'s signed claims and their query strings; the list maps to /admin/users/list', async () => {
    const root = await as('root');
    const list = await call('GET', '/api/admin/users?q=asha&status=blocked&limit=20', { who: root });
    assert.equal(list.body.path, '/internal/identity/admin/users/list');
    assert.deepEqual(list.body.query, { q: 'asha', status: 'blocked', limit: '20' });
    const c = idnCalls.at(-1).claims;
    assert.deepEqual([c.iss, c.role], ['admin-bff', 'admin']);
    assert.ok(c.perms.includes('devotees:edit'));
    assert.equal((await call('GET', `/api/admin/users/${ID}`, { who: root })).body.path, `/internal/identity/admin/users/${ID}`);
    const del = await call('DELETE', `/api/admin/users/${ID}`, { who: root, body: { confirm: 'abc123' } });
    assert.deepEqual(idnCalls.at(-1).body, { confirm: 'abc123' });
    assert.equal(del.status, 200);
    assert.equal((await call('POST', `/api/admin/users/${ID}/notes`, { who: root, body: { text: 'hi' } })).status, 201);
    assert.equal((await call('POST', '/api/admin/blocked-devices', { who: root, body: { deviceId: 'd' } })).status, 200);
    assert.equal((await call('GET', '/api/users', { who: root })).body.path, '/internal/identity/admin/users', 'the old unpaginated list still works');
  });

  test('a block is audited with identity\'s before / after (and the header never reaches the dashboard); a read is not audited', async () => {
    const root = await as('root');
    const r = await call('POST', `/api/admin/users/${ID}/block`, { who: root, body: { reason: 'spam', message: 'm' } });
    assert.equal(r.headers.get('x-audit-detail'), null);
    await settle();
    assert.equal(audits.length, 1);
    assert.deepEqual([audits[0].area, audits[0].method, audits[0].targetId, audits[0].before, audits[0].after.blocked], ['devotees', 'POST', ID, { blocked: false }, true]);
    await call('GET', `/api/admin/users/${ID}`, { who: root });
    await settle();
    assert.equal(audits.length, 1);
  });
});

describe('GET /api/admin/users/export', () => {
  const row = (n, over = {}) => ({ id: `id${n}`, uid: `u${n}`, name: `Name ${n}`, contact: `+91980000000${n}`, method: 'phone', role: 'devotee', blocked: false, tags: ['a', 'b'], createdAt: '2026-01-01T00:00:00.000Z', lastActive: '2026-10-01T00:00:00.000Z', version: '1.2.0 (12)', ...over });

  test('streams text/csv from identity\'s pages: BOM, header, one line per row, quoting, formula guard, filters passed on', async () => {
    exportPages = [[row(1, { name: 'Smith, "Bob"' }), row(2, { name: '=HYPERLINK("x")' })], [row(3, { name: 'हरि ओम' })]];
    const res = await call('GET', '/api/admin/users/export?status=blocked&tag=vip&ignored=1', { who: await as('root') });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /^text\/csv/);
    assert.match(res.headers.get('content-disposition'), /^attachment; filename="users-\d{4}-\d{2}-\d{2}\.csv"$/);
    const lines = res.text.replace(/^﻿/, '').split('\r\n').filter(Boolean);
    assert.equal(lines[0], 'id,uid,name,contact,method,role,blocked,tags,createdAt,lastActive,version');
    assert.equal(lines.length, 4);
    assert.equal(lines[1].split(',').slice(0, 3).join(','), 'id1,u1,"Smith');
    assert.ok(lines[1].includes('"Smith, ""Bob"""'));
    assert.ok(lines[2].includes(`"'=HYPERLINK(""x"")"`), 'a leading = is neutralised');
    assert.ok(lines[1].includes('+919800000001'), 'a phone number keeps its +');
    assert.ok(lines[3].includes('हरि ओम'));
    const asked = idnCalls.filter((c) => c.path.endsWith('/admin/users/export'));
    assert.equal(asked.length, 2);
    assert.deepEqual([asked[0].query.status, asked[0].query.tag, 'ignored' in asked[0].query, asked[0].query.limit, asked[1].query.cursor, asked[1].query.already], ['blocked', 'vip', false, '1000', '1', '2']);
    assert.equal(audits.length, 0, 'identity writes the export audit row itself, once, up front');
  });

  test('ids= is passed on; csvCell unit rules; the cap constant is 50 000', async () => {
    await call('GET', '/api/admin/users/export?ids=a,b', { who: await as('root') });
    assert.equal(idnCalls.at(-1).query.ids, 'a,b');
    assert.deepEqual([csvCell('-5'), csvCell('-x'), csvCell('@a'), csvCell(null), csvCell(true), csvCell('a\nb')], ['-5', "'-x", "'@a", '', 'true', '"a\nb"']);
    assert.equal(EXPORT_CAP, 50_000);
  });

  test('a first-page error is a normal JSON error (no half file); a failure mid-stream breaks the download rather than ending short', async () => {
    exportPages = []; // first page: identity answers 400
    const bad = await call('GET', '/api/admin/users/export', { who: await as('root') });
    assert.equal(bad.status, 400);
    exportPages = [[row(1)], [row(2)]]; exportFail = true;
    const root = await as('root');
    let broke = false;
    try {
      const res = await fetch(`${base}/api/admin/users/export`, { headers: root });
      await res.text();
    } catch { broke = true; }
    assert.equal(broke, true);
  });
});
