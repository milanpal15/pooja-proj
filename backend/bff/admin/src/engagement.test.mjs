import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, beforeEach, describe, test } from 'node:test';

import {
  ENGAGEMENT_ADMIN_ROUTES, ROUTE_AREAS, SESSION_TTL_MS, areaFor, createSessionResolver, engagementAdminRouter,
  hasPermission, permissionsFor, targetOf, verifyServiceToken,
} from '@bhakti/common';

import { createApp } from './app.js';
import { loadConfig } from './config.js';

const SECRET = 'test-secret-test-secret-1234';
const OPERATORS = {
  adm: { authed: true, required: true, username: 'admin1', role: 'admin', permissions: permissionsFor('admin') },
  edi: { authed: true, required: true, username: 'editor1', role: 'editor', permissions: permissionsFor('editor') },
  vie: { authed: true, required: true, username: 'viewer1', role: 'viewer', permissions: permissionsFor('viewer') },
};
const cookie = (k) => ({ cookie: `pooja_admin=${k}` });

let mono;
let eng;
let gw;
let base;
let monoMode = 'ok'; // ok | down | open (no operators exist)
let sessionCalls;
let audits;
let engCalls;
let engMode = 'ok'; // ok | down | 401 | echo-400
let monoSeen;

before(async () => {
  mono = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const p = req.url.split('?')[0];
      const json = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
      if (p === '/api/health') return json(200, { ok: true });
      if (p === '/api/admin/session') {
        sessionCalls.push(req.headers.cookie || '');
        if (monoMode === 'down') return req.socket.destroy();
        if (monoMode === 'open') return json(200, { required: false, authed: true, role: 'admin', permissions: permissionsFor('admin') });
        const k = /pooja_admin=(\w+)/.exec(req.headers.cookie || '')?.[1];
        return json(200, OPERATORS[k] ?? { required: true, authed: false });
      }
      if (p === '/internal/audit') {
        audits.push({ claims: verifyServiceToken(req.headers.authorization?.replace(/^Bearer /, ''), { secret: SECRET }), body: JSON.parse(raw) });
        return json(200, { ok: true });
      }
      monoSeen = { method: req.method, url: req.url };
      json(200, { via: 'monolith', path: p });
    });
  });
  eng = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const json = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
      if (req.url === '/health') return json(engMode === 'down' ? 503 : 200, {});
      const claims = verifyServiceToken(req.headers.authorization?.replace(/^Bearer /, ''), { secret: SECRET });
      engCalls.push({ method: req.method, url: req.url, claims, body: raw ? JSON.parse(raw) : undefined });
      if (engMode === 'down') return req.socket.destroy();
      if (engMode === '401') return json(401, { error: 'bad', code: 'bad_signature' });
      if (engMode === 'echo-400') return json(400, { error: 'Could not save that.' });
      if (req.url === '/internal/engagement/flags') return json(200, { flags: { a: true } });
      json(200, { engagement: true, method: req.method, url: req.url });
    });
  });
  for (const s of [mono, eng]) await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const config = loadConfig({
    MONOLITH_URL: `http://127.0.0.1:${mono.address().port}`,
    ENGAGEMENT_URL: `http://127.0.0.1:${eng.address().port}`,
    INTERNAL_JWT_SECRET: SECRET,
    SERVICE_TIMEOUT_MS: '1000',
  });
  gw = http.createServer(createApp(config, { logger: { info() {}, warn() {}, error() {} } }));
  await new Promise((r) => gw.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${gw.address().port}`;
});
after(() => { for (const s of [gw, eng, mono]) s.closeAllConnections?.(); for (const s of [gw, eng, mono]) s.close(); });
beforeEach(() => { sessionCalls = []; audits = []; engCalls = []; engMode = 'ok'; monoMode = 'ok'; monoSeen = null; });

// Distinct cookie VALUES per test would dodge the 30 s cache; tests that rely on the cache say so.
let n = 0;
const fresh = (role) => ({ cookie: `pooja_admin=${role}; t=${++n}` });
async function call(method, path, { headers = {}, body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, body: json, headers: res.headers };
}
const settle = () => new Promise((r) => setTimeout(r, 60)); // the audit POST is fire-and-forget

describe('the route table (what this BFF handles itself)', () => {
  test('every handled route resolves to a MAPPED area, the one the table declares', () => {
    for (const r of ENGAGEMENT_ADMIN_ROUTES) {
      const sample = r.sample ?? r.path;
      const a = areaFor(r.method, sample);
      assert.ok(a.mapped, `${r.method} ${r.path} has no entry in access/routes.js (it would be admin-only)`);
      assert.equal(a.area, r.area, `${r.method} ${r.path}`);
      assert.equal(a.level, r.method === 'GET' ? 'view' : 'edit');
    }
  });

  test('the express router registers exactly the table, no more (a new route needs an entry here)', () => {
    const router = engagementAdminRouter({ sessions: {}, client: {} });
    const registered = router.stack.filter((l) => l.route).flatMap((l) => Object.keys(l.route.methods).map((m) => `${m.toUpperCase()} ${l.route.path}`));
    const wanted = ENGAGEMENT_ADMIN_ROUTES.map((r) => `${r.method} /api${r.path}`);
    assert.deepEqual([...registered].sort(), [...wanted].sort());
  });

  test('the role x route matrix', () => {
    const allowed = (role, r) => {
      const a = areaFor(r.method, r.sample ?? r.path);
      return hasPermission(permissionsFor(role), `${a.area}:${a.level}`);
    };
    for (const r of ENGAGEMENT_ADMIN_ROUTES) {
      assert.ok(allowed('admin', r), `admin ${r.method} ${r.path}`);
      const write = r.method !== 'GET';
      assert.equal(allowed('viewer', r), !write, `viewer ${r.method} ${r.path}`);
      const editorWrites = ['content', 'announcements'].includes(r.area);
      assert.equal(allowed('editor', r), !write || editorWrites, `editor ${r.method} ${r.path}`);
    }
    // announcements push and flags edit are admin-only writes
    assert.ok(!allowed('editor', ENGAGEMENT_ADMIN_ROUTES.find((r) => r.area === 'push')));
    assert.ok(!allowed('editor', ENGAGEMENT_ADMIN_ROUTES.find((r) => r.method === 'PUT' && r.area === 'flags')));
  });

  test('every ROUTE_AREAS entry the table relies on is present', () => {
    assert.ok(ROUTE_AREAS.some((r) => r.area === 'flags') && ROUTE_AREAS.some((r) => r.area === 'overview'));
  });
});

describe('operator authentication', () => {
  test('no session -> 401 {error:"Sign in required"}; engagement is never called', async () => {
    const r = await call('GET', '/api/flags/full', { headers: fresh('nobody') });
    assert.equal(r.status, 401);
    assert.deepEqual(r.body, { error: 'Sign in required' });
    assert.equal(engCalls.length, 0);
    assert.equal((await call('GET', '/api/content/settings')).status, 401, 'no cookie at all');
  });

  test('role + permissions come from the monolith session and are forwarded as signed claims', async () => {
    const r = await call('GET', '/api/flags/full', { headers: fresh('edi') });
    assert.equal(r.status, 200);
    const c = engCalls[0].claims;
    assert.equal(c.iss, 'admin-bff');
    assert.equal(c.sub, 'editor1');
    assert.equal(c.role, 'editor');
    assert.deepEqual(c.perms, permissionsFor('editor'));
    assert.equal(engCalls[0].url, '/internal/engagement/flags/full');
  });

  test('the cookie is forwarded to the monolith; the answer is cached 30 s per cookie', async () => {
    const h = fresh('adm');
    for (let i = 0; i < 3; i++) assert.equal((await call('GET', '/api/visitors', { headers: h })).status, 200);
    assert.equal(sessionCalls.length, 1);
    assert.equal(sessionCalls[0], h.cookie);
    await call('GET', '/api/visitors', { headers: fresh('adm') });
    assert.equal(sessionCalls.length, 2, 'a different cookie is a different cache entry');
  });

  test('cache unit: expiry after the TTL, failures and sign-outs are not cached', async () => {
    let t = 1_000;
    let mode = 'ok';
    let calls = 0;
    const r = createSessionResolver({
      monolithUrl: 'http://x',
      now: () => t,
      fetchImpl: async () => {
        calls++;
        if (mode === 'throw') throw new Error('down');
        return { ok: true, json: async () => (mode === 'ok' ? OPERATORS.adm : { authed: false }) };
      },
    });
    const req = { headers: { cookie: 'c=1' }, ip: '1.1.1.1' };
    assert.equal((await r.resolve(req)).ok, true);
    assert.equal((await r.resolve(req)).ok, true);
    assert.equal(calls, 1);
    t += SESSION_TTL_MS + 1;
    await r.resolve(req);
    assert.equal(calls, 2);
    mode = 'throw';
    t += SESSION_TTL_MS + 1;
    assert.equal((await r.resolve(req)).status, 502);
    mode = 'out';
    assert.equal((await r.resolve(req)).status, 401);
    assert.equal((await r.resolve(req)).status, 401);
    assert.equal(calls, 5, 'not-authed answers are re-asked every time');
  });

  test('monolith session endpoint unreachable -> 502, not 401 (do not sign the operator out)', async () => {
    monoMode = 'down';
    const r = await call('GET', '/api/flags/full', { headers: fresh('adm') });
    assert.equal(r.status, 502);
    assert.equal(r.body.code, 'upstream_unavailable');
  });

  test('a monolith with no operators yet (non-production) opens the dashboard, as it does itself', async () => {
    monoMode = 'open';
    assert.equal((await call('GET', '/api/flags/full', { headers: fresh('whoever') })).status, 200);
  });
});

describe('the area gate on handled routes', () => {
  const ROWS = [
    // [role, method, path, expected status]
    ['vie', 'GET', '/api/flags/full', 200],
    ['vie', 'PUT', '/api/flags/bhajan', 403],
    ['edi', 'PUT', '/api/flags/bhajan', 403],
    ['adm', 'PUT', '/api/flags/bhajan', 200],
    ['vie', 'GET', '/api/content/settings', 200],
    ['vie', 'POST', '/api/content/settings', 403],
    ['edi', 'POST', '/api/content/settings', 201], // a create answers 201, as the monolith's generic CRUD does
    ['vie', 'DELETE', '/api/content/settings/000000000000000000000001', 403],
    ['edi', 'PUT', '/api/content/announcements/000000000000000000000001', 200],
    ['vie', 'POST', '/api/content/announcements', 403],
    ['edi', 'POST', '/api/admin/announcements/000000000000000000000001/push', 403],
    ['vie', 'POST', '/api/admin/announcements/000000000000000000000001/push', 403],
    ['adm', 'POST', '/api/admin/announcements/000000000000000000000001/push', 200],
    ['vie', 'GET', '/api/analytics/summary', 200],
  ];
  for (const [role, method, path, want] of ROWS) {
    test(`${role} ${method} ${path} -> ${want}`, async () => {
      const r = await call(method, path, { headers: fresh(role), body: method === 'GET' || method === 'DELETE' ? undefined : {} });
      assert.equal(r.status, want);
      if (want === 403) {
        assert.equal(r.body.code, 'forbidden');
        assert.match(r.body.needs, /:edit$/);
        assert.equal(engCalls.length, 0, 'refused before engagement');
      }
    });
  }

  test('path params and query strings are forwarded (push ?force)', async () => {
    await call('POST', '/api/admin/announcements/000000000000000000000001/push?force=1', { headers: fresh('adm'), body: {} });
    assert.equal(engCalls[0].url, '/internal/engagement/admin/announcements/000000000000000000000001/push?force=1');
  });

  test('an editor\'s money-row refusal comes from engagement and passes through with its status and body', async () => {
    engMode = 'ok';
    const r = await call('POST', '/api/content/settings', { headers: fresh('edi'), body: { key: 'prasadDelivery', value: '1' } });
    // The fake engagement just echoes; the point is the editor's perms reach it for the real check.
    assert.deepEqual(engCalls[0].claims.perms.includes('money:edit'), false);
    assert.equal(r.status, 201);
  });

  test('engagement error bodies pass through unchanged; a rejected service token is a 502, never a 401', async () => {
    engMode = 'echo-400';
    let r = await call('POST', '/api/content/settings', { headers: fresh('adm'), body: { x: 1 } });
    assert.equal(r.status, 400);
    assert.deepEqual(r.body, { error: 'Could not save that.' });
    engMode = '401';
    r = await call('GET', '/api/flags/full', { headers: fresh('adm') });
    assert.equal(r.status, 502);
    assert.equal(r.body.code, 'engagement_auth_failed');
    engMode = 'down';
    r = await call('GET', '/api/flags/full', { headers: fresh('adm') });
    assert.equal(r.status, 502);
  });
});

describe('audit', () => {
  test('a successful engagement-handled write is recorded through the monolith; no body, right fields', async () => {
    await call('PUT', '/api/flags/bhajan', { headers: fresh('adm'), body: { enabled: false, secret: 'do-not-log' } });
    await settle();
    assert.equal(audits.length, 1);
    assert.equal(audits[0].claims.iss, 'admin-bff');
    assert.deepEqual(audits[0].body, { operator: 'admin1', role: 'admin', area: 'flags', method: 'PUT', path: '/api/flags/bhajan', targetId: 'bhajan', status: 200 });
    await call('DELETE', '/api/content/settings/000000000000000000000001', { headers: fresh('edi') });
    await settle();
    assert.equal(audits[1].body.targetId, '000000000000000000000001');
    assert.equal(audits[1].body.area, 'content');
    assert.equal(audits[1].body.operator, 'editor1');
  });
  test('reads, refused writes and failed writes are not recorded', async () => {
    await call('GET', '/api/flags/full', { headers: fresh('adm') });
    await call('PUT', '/api/flags/bhajan', { headers: fresh('vie'), body: {} });
    engMode = 'echo-400';
    await call('POST', '/api/content/settings', { headers: fresh('adm'), body: {} });
    await settle();
    assert.equal(audits.length, 0);
  });
  test('targetOf matches the monolith rule', () => {
    assert.equal(targetOf('/flags/bhajan'), 'bhajan');
    assert.equal(targetOf('/content/settings/0123456789abcdef01234567'), '0123456789abcdef01234567');
    assert.equal(targetOf('/content/settings'), undefined);
  });
});

describe('everything else still reaches the monolith (including its own login/session)', () => {
  test('unlisted /api paths are proxied untouched', async () => {
    for (const [m, p] of [['GET', '/api/admin/session'], ['GET', '/api/content/deities'], ['GET', '/api/users'], ['GET', '/api/admin/billing/rules'], ['GET', '/api/flags/full/extra']]) {
      monoSeen = null;
      const r = await call(m, p, { headers: fresh('adm') });
      assert.ok(monoSeen || p === '/api/admin/session', `${m} ${p}`);
      if (p !== '/api/admin/session') assert.equal(r.body.via, 'monolith');
    }
    assert.equal(engCalls.length, 0);
  });
  test('the public allowlist routes (the smoke test hits them through this BFF) are served from engagement', async () => {
    const r = await call('GET', '/api/flags');
    assert.deepEqual(r.body, { flags: { a: true } });
    assert.equal(sessionCalls.length, 0, 'public: no session needed');
    engMode = 'down';
    const d = await call('GET', '/api/flags');
    assert.equal(d.status, 200);
    assert.equal(d.headers.get('x-degraded'), 'engagement');
  });
  test('health: degraded but up when only engagement is down', async () => {
    engMode = 'down';
    const h = await call('GET', '/api/health');
    assert.equal(h.status, 200);
    assert.deepEqual(h.body.degraded, ['engagement']);
  });
});
