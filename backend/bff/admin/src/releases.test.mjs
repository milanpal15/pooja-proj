// The admin BFF for app releases, approvals, the audit log and custom roles (docs/RELEASES.md, docs/ROLES.md): the area gate for every new route, the
// 200 / 202 relay, audit with before/after (the header is stored and never forwarded), the cached role -> permission resolution, APP_ENV.
// Stand-ins for the monolith, identity and engagement.  Run: node --test --test-concurrency=1 src/releases.test.mjs   (no database needed)
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, beforeEach, describe, test } from 'node:test';

import { ENGAGEMENT_ADMIN_ROUTES, IDENTITY_ADMIN_ROUTES, ROLE_PERMISSIONS, areaFor, encodeAuditDetail, hasPermission, verifyServiceToken } from '@bhakti/common';

import { createApp } from './app.js';
import { loadConfig } from './config.js';

const SECRET = 'test-secret-test-secret-1234';
const COOKIE_SECRET = 'cookie-secret-cookie-secret-12';
const quiet = { info() {}, warn() {}, error() {} };
const ID = '000000000000000000000001';

let mono; let idn; let eng; let gw; let base;
let clock = Date.now();
let ops; let roles; let engCalls; let idnCalls; let audits; let engReply;
const claimsOf = (req) => { try { return verifyServiceToken(req.headers.authorization?.replace(/^Bearer /, ''), { secret: SECRET }); } catch { return null; } };

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

/** What identity answers for an operator: role and permissions RESOLVED FROM THE ROLE STORE (here: `roles`), like the real one. */
const BUILTIN_NAMES = { admin: 'Administrator', editor: 'Editor', viewer: 'Viewer' };
const resolve = (key) => (ROLE_PERMISSIONS[key] ? { roleName: BUILTIN_NAMES[key], permissions: ROLE_PERMISSIONS[key] } : roles[key] ? { roleName: roles[key].name, permissions: roles[key].permissions } : { roleName: key, permissions: [] });

before(async () => {
  mono = await listen((req, res, body, json) => json(200, { via: 'monolith' }));
  eng = await listen((req, res, body, json) => {
    if (req.url === '/health') return json(200, {});
    const u = new URL(req.url, 'http://x');
    engCalls.push({ method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), claims: claimsOf(req), body });
    json(engReply.status ?? 200, engReply.body ?? { engagement: true }, engReply.headers ?? {});
  });
  idn = await listen((req, res, body, json) => {
    if (req.url === '/health') return json(200, {});
    const u = new URL(req.url, 'http://x');
    idnCalls.push({ method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), claims: claimsOf(req), body });
    if (u.pathname === '/internal/identity/operators/session') {
      const o = ops[u.searchParams.get('id')];
      return json(200, o ? { required: true, authed: true, id: u.searchParams.get('id'), username: o.username, role: o.role, ...resolve(o.role) } : { required: true, authed: false });
    }
    if (u.pathname === '/internal/identity/operators/login') {
      const e = Object.entries(ops).find(([, o]) => o.username === body.username && o.password === body.password);
      return e ? json(200, { id: e[0], username: e[1].username, role: e[1].role, ...resolve(e[1].role) }) : json(401, { error: 'Wrong username or password', code: 'bad_credentials' });
    }
    if (u.pathname === '/internal/identity/audit') { audits.push({ claims: claimsOf(req), body }); return json(200, { ok: true }); }
    if (u.pathname === '/internal/identity/admin/audit-log') return json(200, { items: [{ id: ID, operator: 'root' }], next: null });
    const detail = u.pathname.startsWith('/internal/identity/admin/roles') && req.method !== 'GET'
      ? { 'x-audit-detail': encodeAuditDetail({ before: null, after: { key: 'support', permissions: ['orders:view'] } }) } : {};
    json(req.method === 'POST' && u.pathname === '/internal/identity/admin/roles' ? 201 : 200, { identity: true, path: u.pathname }, detail);
  });
  const cfg = (env = {}) => loadConfig({
    MONOLITH_URL: `http://127.0.0.1:${mono.address().port}`,
    ENGAGEMENT_URL: `http://127.0.0.1:${eng.address().port}`,
    IDENTITY_URL: `http://127.0.0.1:${idn.address().port}`,
    INTERNAL_JWT_SECRET: SECRET, ADMIN_SESSION_SECRET: COOKIE_SECRET, SERVICE_TIMEOUT_MS: '1000', ...env,
  });
  globalThis.__cfg = cfg;
  gw = http.createServer(createApp(cfg(), { logger: quiet, now: () => clock }));
  await new Promise((r) => gw.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${gw.address().port}`;
});
after(() => { for (const s of [gw, mono, idn, eng]) s.closeAllConnections?.(); for (const s of [gw, mono, idn, eng]) s.close(); });
beforeEach(() => {
  engCalls = []; idnCalls = []; audits = []; engReply = {};
  clock += 60_000; // every test starts past the 5 s session cache
  roles = {
    support: { name: 'Support desk', permissions: ['overview:view', 'orders:view', 'orders:edit'] },
    looker: { name: 'Operator looker', permissions: ['operators:view'] },
    releaser: { name: 'Releaser', permissions: ['releases:view', 'releases:edit'] },
  };
  ops = {
    aaaaaaaaaaaaaaaaaaaaaaaa: { username: 'root', role: 'admin', password: 'root-pass' },
    bbbbbbbbbbbbbbbbbbbbbbbb: { username: 'ed', role: 'editor', password: 'ed-pass' },
    cccccccccccccccccccccccc: { username: 'view', role: 'viewer', password: 'view-pass' },
    dddddddddddddddddddddddd: { username: 'sam', role: 'support', password: 'sam-pass' },
    eeeeeeeeeeeeeeeeeeeeeeee: { username: 'lou', role: 'looker', password: 'lou-pass' },
    ffffffffffffffffffffffff: { username: 'rel', role: 'releaser', password: 'rel-pass' },
  };
});
// Role-store edits made while a signed-in session exists are the whole point of several tests below.

const settle = () => new Promise((r) => setTimeout(r, 80));
async function call(method, path, { headers = {}, body, at = base } = {}) {
  const res = await fetch(`${at}${path}`, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, body: json, text, headers: res.headers };
}
async function as(name, at = base) {
  const o = Object.values(ops).find((x) => x.username === name);
  const res = await fetch(`${at}/api/admin/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: name, password: o.password }) });
  assert.equal(res.status, 200);
  return { cookie: res.headers.get('set-cookie').split(';')[0] };
}

const NEW_ENGAGEMENT = () => ENGAGEMENT_ADMIN_ROUTES.filter((r) => /^\/admin\/(releases|version-policy|versions|approvals)/.test(r.path));
const NEW_IDENTITY = () => IDENTITY_ADMIN_ROUTES.filter((r) => /^\/admin\/(roles|audit-log)/.test(r.path));
const sampleOf = (r) => r.sample ?? r.path;
const bodyOf = (r) => (r.method === 'GET' || r.method === 'DELETE' ? undefined : { x: 1 });

describe('the route tables', () => {
  test('every new route is MAPPED to its area with the right level: releases, approvals, audit, roles', () => {
    const want = (r) => {
      if (/^\/admin\/(releases|version-policy|versions)/.test(r.path)) return 'releases';
      if (r.path.startsWith('/admin/approvals')) return 'approvals';
      if (r.path === '/admin/audit-log') return 'audit';
      return 'roles';
    };
    const all = [...NEW_ENGAGEMENT(), ...NEW_IDENTITY()];
    assert.equal(NEW_ENGAGEMENT().length, 13);
    assert.equal(NEW_IDENTITY().length, 6);
    for (const r of all) {
      const a = areaFor(r.method, sampleOf(r));
      assert.ok(a.mapped, `${r.method} ${r.path} is unmapped`);
      assert.equal(a.area, want(r), `${r.method} ${r.path}`);
      assert.equal(r.area, a.area, `${r.method} ${r.path}: the table agrees with the gate`);
      assert.equal(a.level, r.method === 'GET' ? 'view' : 'edit', `${r.method} ${r.path}`);
    }
  });
  test('a fixed path is registered before a parameterised one that could swallow it', () => {
    const paths = ENGAGEMENT_ADMIN_ROUTES.map((r) => `${r.method} ${r.path}`);
    assert.ok(paths.indexOf('GET /admin/approvals/settings') >= 0);
    assert.ok(paths.indexOf('PUT /admin/approvals/settings') >= 0);
  });
});

describe('role x route over HTTP', () => {
  test('admin reaches every new route; each call carries admin-bff, the role and the full resolved permissions', async () => {
    const h = await as('root');
    for (const r of [...NEW_ENGAGEMENT(), ...NEW_IDENTITY()]) {
      const target = r.path.startsWith('/admin/roles') || r.path.startsWith('/admin/audit-log') ? idnCalls : engCalls;
      target.length = 0;
      const res = await call(r.method, `/api${sampleOf(r)}`, { headers: h, body: bodyOf(r) });
      assert.equal(res.status, r.method === 'PUT' && r.path === '/admin/version-policy' ? 200 : (r.successStatus ?? 200), `${r.method} ${r.path}`);
      const seen = target.filter((c) => c.path !== '/internal/identity/operators/session').at(-1);
      assert.equal(seen.claims.iss, 'admin-bff');
      assert.equal(seen.claims.role, 'admin');
      assert.deepEqual(seen.claims.perms, ROLE_PERMISSIONS.admin);
    }
  });

  test('editor and viewer may LOOK at releases, versions and approvals - and are refused everything else, naming the permission needed', async () => {
    for (const name of ['ed', 'view']) {
      const h = await as(name);
      for (const r of NEW_ENGAGEMENT()) {
        engCalls = [];
        const res = await call(r.method, `/api${sampleOf(r)}`, { headers: h, body: bodyOf(r) });
        if (r.method === 'GET') {
          assert.equal(res.status, 200, `${name} ${r.method} ${r.path}`);
          assert.equal(engCalls.length, 1);
        } else {
          assert.equal(res.status, 403, `${name} ${r.method} ${r.path}`);
          assert.equal(res.body.needs, `${r.area}:edit`);
          assert.equal(engCalls.length, 0, 'the service is never called');
        }
      }
      for (const r of NEW_IDENTITY()) {
        idnCalls = [];
        const res = await call(r.method, `/api${sampleOf(r)}`, { headers: h, body: bodyOf(r) });
        assert.equal(res.status, 403, `${name} ${r.method} ${r.path}`);
        assert.equal(res.body.needs, `${r.area}:${r.method === 'GET' ? 'view' : 'edit'}`);
        assert.equal(idnCalls.filter((c) => c.path.includes('/admin/')).length, 0);
      }
    }
  });

  test('a stranger is 401 on all of them', async () => {
    for (const r of [...NEW_ENGAGEMENT(), ...NEW_IDENTITY()]) assert.equal((await call(r.method, `/api${sampleOf(r)}`, { body: bodyOf(r) })).status, 401, `${r.method} ${r.path}`);
  });

  test('a CUSTOM role is gated by what it holds: the releaser edits releases but cannot touch approvals; the looker reads the role list and nothing else', async () => {
    const rel = await as('rel');
    assert.equal((await call('PUT', '/api/admin/version-policy', { headers: rel, body: { message: 'x' } })).status, 200);
    assert.equal((await call('GET', '/api/admin/approvals', { headers: rel })).status, 403, 'releases:edit does not grant approvals:view');
    assert.equal((await call('POST', `/api/admin/approvals/${ID}/approve`, { headers: rel, body: {} })).status, 403);
    assert.equal((await call('GET', '/api/admin/audit-log', { headers: rel })).status, 403);
    const lou = await as('lou');
    const list = await call('GET', '/api/admin/roles', { headers: lou });
    assert.equal(list.status, 200, 'operators:view may read the role list');
    assert.equal(idnCalls.filter((c) => c.path === '/internal/identity/admin/roles').at(-1).claims.perms.join(), 'operators:view');
    for (const [m, p] of [['POST', '/api/admin/roles'], ['PUT', '/api/admin/roles/support'], ['DELETE', '/api/admin/roles/support'], ['POST', '/api/admin/roles/support/duplicate']]) {
      assert.equal((await call(m, p, { headers: lou, body: m === 'DELETE' ? undefined : {} })).status, 403, `${m} ${p}`);
    }
    assert.equal((await call('GET', '/api/admin/roles', { headers: await as('sam') })).status, 403, 'a support operator holds neither roles:view nor operators:view');
    assert.equal((await call('GET', '/api/admin/audit-log', { headers: await as('sam') })).status, 403);
    assert.equal((await call('GET', '/api/admin/releases', { headers: await as('sam') })).status, 403);
  });
});

describe('version-policy: 200 / 202 relay, audit detail', () => {
  test('the service\'s status is relayed: 202 sent for approval, 200 applied; the body is untouched', async () => {
    const h = await as('root');
    engReply = { status: 202, body: { approval: { _id: ID, status: 'pending' }, version: 4 } };
    const a = await call('PUT', '/api/admin/version-policy', { headers: h, body: { minVersionCode: 9 } });
    assert.deepEqual([a.status, a.body.approval.status, a.body.version], [202, 'pending', 4]);
    engReply = { status: 200, body: { policy: { version: 5 }, version: 5 } };
    const b = await call('PUT', '/api/admin/version-policy', { headers: h, body: { message: 'hi' } });
    assert.deepEqual([b.status, b.body.version], [200, 5]);
    assert.deepEqual(engCalls.at(-1).body, { message: 'hi' });
    engReply = { status: 400, body: { error: 'x', code: 'bad_policy', fields: { snoozeDays: 'Must be 1 to 30' } } };
    const c = await call('PUT', '/api/admin/version-policy', { headers: h, body: { snoozeDays: 99 } });
    assert.deepEqual([c.status, c.body.code, c.body.fields.snoozeDays], [400, 'bad_policy', 'Must be 1 to 30']);
  });

  test('the service\'s x-audit-detail goes to the audit log (sanitised) and is stripped from the reply; selfApproved rides along', async () => {
    const h = await as('root');
    engReply = {
      status: 200, body: { policy: {}, selfApproved: true },
      headers: { 'x-audit-detail': encodeAuditDetail({ before: { minVersionCode: 3 }, after: { minVersionCode: 5, maintenance: { allowUidsCount: 2 } }, selfApproved: true }) },
    };
    const r = await call('PUT', '/api/admin/version-policy', { headers: h, body: { minVersionCode: 5 } });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('x-audit-detail'), null, 'never forwarded to the dashboard');
    await settle();
    const a = audits.at(-1).body;
    assert.deepEqual([a.operator, a.role, a.area, a.method, a.path, a.status, a.selfApproved], ['root', 'admin', 'releases', 'PUT', '/api/admin/version-policy', 200, true]);
    assert.deepEqual([a.before, a.after], [{ minVersionCode: 3 }, { minVersionCode: 5, maintenance: { allowUidsCount: 2 } }]);
  });

  test('a header carrying secrets or personal data is scrubbed before it is stored; a malformed header is ignored, not fatal', async () => {
    const h = await as('root');
    engReply = { status: 200, body: {}, headers: { 'x-audit-detail': Buffer.from(JSON.stringify({ before: { password: 'p', ok: 1 }, after: { phone: '+91', email: 'a@b', note: 'fine' } })).toString('base64') } };
    await call('PUT', '/api/admin/version-policy', { headers: h, body: { message: 'a' } });
    await settle();
    assert.deepEqual([audits.at(-1).body.before, audits.at(-1).body.after], [{ ok: 1 }, { note: 'fine' }]);
    engReply = { status: 200, body: {}, headers: { 'x-audit-detail': '%%%not-base64-json' } };
    const r = await call('PUT', '/api/admin/version-policy', { headers: h, body: { message: 'b' } });
    assert.equal(r.status, 200);
    await settle();
    assert.equal('before' in audits.at(-1).body, false);
  });

  test('a pending approval (202) is audited too (status 202); a refused write (409) is not', async () => {
    const h = await as('root');
    engReply = { status: 202, body: { approval: {} } };
    await call('PUT', '/api/admin/version-policy', { headers: h, body: { minVersionCode: 9 } });
    engReply = { status: 409, body: { error: 'own', code: 'own_request' } };
    await call('POST', `/api/admin/approvals/${ID}/approve`, { headers: h, body: {} });
    await settle();
    assert.deepEqual(audits.map((a) => [a.body.path, a.body.status]), [['/api/admin/version-policy', 202]]);
  });

  test('writes are audited with the area and a target id; reads and the impact preview (a POST that only reads) are not', async () => {
    const h = await as('root');
    await call('POST', '/api/admin/releases', { headers: h, body: { versionName: '1', versionCode: 1 } });
    await call('PUT', `/api/admin/releases/${ID}`, { headers: h, body: {} });
    await call('POST', `/api/admin/approvals/${ID}/reject`, { headers: h, body: { note: 'n' } });
    await call('GET', '/api/admin/releases', { headers: h });
    await call('GET', '/api/admin/versions/usage', { headers: h });
    await call('POST', '/api/admin/version-policy/impact', { headers: h, body: { minVersionCode: 3 } });
    await settle();
    assert.deepEqual(audits.map((a) => [a.body.method, a.body.path, a.body.area]), [
      ['POST', '/api/admin/releases', 'releases'], ['PUT', `/api/admin/releases/${ID}`, 'releases'], ['POST', `/api/admin/approvals/${ID}/reject`, 'approvals'],
    ]);
    assert.equal(audits[1].body.targetId, ID);
  });

  test('the query and body reach engagement; engagement\'s refusals pass through; engagement down is a clean 5xx', async () => {
    const h = await as('root');
    await call('GET', '/api/admin/approvals?status=pending', { headers: h });
    assert.deepEqual(engCalls.at(-1).query, { status: 'pending' });
    engReply = { status: 409, body: { error: 'You cannot approve your own request.', code: 'own_request' } };
    const r = await call('POST', `/api/admin/approvals/${ID}/approve`, { headers: h, body: { note: 'x' } });
    assert.deepEqual([r.status, r.body.code], [409, 'own_request']);
    assert.deepEqual(engCalls.at(-1).body, { note: 'x' });
  });
});

describe('audit log', () => {
  test('GET /api/admin/audit-log goes to identity with every filter, admin only', async () => {
    const h = await as('root');
    const r = await call('GET', '/api/admin/audit-log?operator=bob&area=releases&method=PUT&from=2026-01-01&to=2026-02-01&limit=25&before=abc&junk[]=1', { headers: h });
    assert.deepEqual([r.status, r.body.items.length, r.body.next], [200, 1, null]);
    const c = idnCalls.filter((x) => x.path === '/internal/identity/admin/audit-log').at(-1);
    assert.deepEqual(c.query, { operator: 'bob', area: 'releases', method: 'PUT', from: '2026-01-01', to: '2026-02-01', limit: '25', before: 'abc' });
    assert.equal((await call('GET', '/api/admin/audit-log', { headers: await as('ed') })).status, 403);
    assert.equal((await call('GET', '/api/admin/audit-log', { headers: await as('view') })).status, 403);
  });
});

describe('custom roles: the cached resolution feeds the gate AND the signed permissions', () => {
  test('an edit to a role is picked up by a signed-in operator within the cache window, with NO re-login - fake clock', async () => {
    const h = await as('sam');
    assert.equal((await call('GET', '/api/admin/releases', { headers: h })).status, 403);
    roles.support.permissions = [...roles.support.permissions, 'releases:view']; // edited behind the BFF's back (another instance, another admin)
    assert.equal((await call('GET', '/api/admin/releases', { headers: h })).status, 403, 'inside the TTL the cached list still applies');
    clock += 6_000; // > 5 s
    assert.equal((await call('GET', '/api/admin/releases', { headers: h })).status, 200, 'after the TTL the new list applies');
    assert.deepEqual(engCalls.at(-1).claims.perms, ['overview:view', 'orders:view', 'orders:edit', 'releases:view'], 'the SAME list is what the service is sent');
    roles.support.permissions = ['overview:view'];
    clock += 29_000; // the contract's ceiling is 30 s
    assert.equal((await call('GET', '/api/admin/releases', { headers: h })).status, 403, 'removal is as quick');
    const s = (await call('GET', '/api/admin/session', { headers: h })).body;
    assert.deepEqual([s.username, s.role, s.roleName, s.permissions], ['sam', 'support', 'Support desk', ['overview:view']]);
  });

  test('a role write that passes through THIS BFF drops the cache at once', async () => {
    const h = await as('sam');
    assert.equal((await call('GET', '/api/admin/releases', { headers: h })).status, 403);
    roles.support.permissions = ['releases:view'];
    const admin = await as('root');
    const w = await call('PUT', '/api/admin/roles/support', { headers: admin, body: { permissions: ['releases:view'] } });
    assert.equal(w.status, 200);
    assert.equal((await call('GET', '/api/admin/releases', { headers: h })).status, 200, 'no waiting for the TTL on this instance');
  });

  test('a role that no longer resolves holds NO permissions: signed in, everything 403', async () => {
    const h = await as('sam');
    delete roles.support;
    clock += 6_000;
    const s = (await call('GET', '/api/admin/session', { headers: h })).body;
    assert.deepEqual([s.authed, s.role, s.permissions], [true, 'support', []]);
    for (const p of ['/api/admin/releases', '/api/admin/roles', '/api/admin/approvals']) assert.equal((await call('GET', p, { headers: h })).status, 403, p);
  });

  test('role writes are audited with before/after; the roles area is the audit row\'s area', async () => {
    const h = await as('root');
    const r = await call('POST', '/api/admin/roles', { headers: h, body: { key: 'support', name: 'Support', permissions: ['orders:view'] } });
    assert.equal(r.status, 201);
    assert.equal(r.headers.get('x-audit-detail'), null);
    await call('POST', '/api/admin/roles/support/duplicate', { headers: h, body: { key: 'copy', name: 'Copy' } });
    await call('DELETE', '/api/admin/roles/support', { headers: h });
    await settle();
    assert.deepEqual(audits.map((a) => [a.body.method, a.body.path, a.body.area, a.body.targetId]), [
      ['POST', '/api/admin/roles', 'roles', undefined], ['POST', '/api/admin/roles/support/duplicate', 'roles', 'support'], ['DELETE', '/api/admin/roles/support', 'roles', 'support'],
    ]);
    assert.deepEqual(audits[0].body.after, { key: 'support', permissions: ['orders:view'] });
    assert.equal(audits[0].body.before, null);
  });
});

describe('session: roleName and environment (APP_ENV)', () => {
  const sessionAt = async (env) => {
    const g = http.createServer(createApp(globalThis.__cfg(env), { logger: quiet, now: () => clock }));
    await new Promise((r) => g.listen(0, '127.0.0.1', r));
    const at = `http://127.0.0.1:${g.address().port}`;
    try {
      const anon = (await call('GET', '/api/admin/session', { at })).body;
      const authed = (await call('GET', '/api/admin/session', { at, headers: await as('root', at) })).body;
      return { anon, authed };
    } finally { g.closeAllConnections?.(); g.close(); }
  };
  test('defaults to local; tester and production are passed through; anything else is local; it is on the signed-out answer too', async () => {
    for (const [env, want] of [[{}, 'local'], [{ APP_ENV: 'tester' }, 'tester'], [{ APP_ENV: 'production' }, 'production'], [{ APP_ENV: ' Tester ' }, 'tester'], [{ APP_ENV: 'staging' }, 'local'], [{ APP_ENV: '' }, 'local']]) {
      const { anon, authed } = await sessionAt(env);
      assert.equal(authed.environment, want, JSON.stringify(env));
      assert.equal(anon.environment, want);
      assert.deepEqual([authed.role, authed.roleName, authed.permissions], ['admin', 'Administrator', ROLE_PERMISSIONS.admin]);
    }
  });
  test('the session carries the role NAME next to the key; login too', async () => {
    const r = await call('POST', '/api/admin/login', { body: { username: 'sam', password: 'sam-pass' } });
    assert.deepEqual([r.body.role, r.body.roleName, r.body.permissions], ['support', 'Support desk', roles.support.permissions]);
    assert.ok(hasPermission(r.body.permissions, 'orders:view'));
  });
});
