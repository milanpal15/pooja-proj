// Phase 2: the admin BFF owns the operator session. Stand-ins for the monolith, identity and engagement.
// Run: node --test --test-concurrency=1 src/identity.test.mjs   (no database needed)
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, beforeEach, describe, test } from 'node:test';

import { permissionsFor, verifyServiceToken } from '@bhakti/common';

import { createApp } from './app.js';
import { loadConfig } from './config.js';

const SECRET = 'test-secret-test-secret-1234';
const COOKIE_SECRET = 'cookie-secret-cookie-secret-12';
const PROD = { NODE_ENV: 'production', CORS_ORIGIN: 'https://dash.example.com' }; // production trusts one proxy hop, so X-Forwarded-For names the client
const quiet = { info() {}, warn() {}, error() {} };

let mono; let idn; let eng; let gw; let base;
let monoSeen; let idnCalls; let engCalls;
let idnMode = 'ok'; // ok | down | open (no operators)
let clock = Date.now();
let ops; // id -> { username, role, active, password }
let loginCalls;

const claimsOf = (req) => {
  try { return verifyServiceToken(req.headers.authorization?.replace(/^Bearer /, ''), { secret: SECRET }); } catch { return null; }
};

function listen(handler) {
  const s = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => handler(req, res, raw ? JSON.parse(raw) : undefined, (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); }));
  });
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r(s)));
}

before(async () => {
  mono = await listen((req, res, body, json) => {
    if (req.url === '/api/health') return json(200, { ok: true });
    monoSeen.push({ method: req.method, url: req.url, headers: req.headers, claims: claimsOf(req), body });
    json(200, { via: 'monolith', path: req.url.split('?')[0] });
  });
  eng = await listen((req, res, body, json) => {
    if (req.url === '/health') return json(200, {});
    engCalls.push({ method: req.method, url: req.url, claims: claimsOf(req), body });
    json(200, { engagement: true });
  });
  idn = await listen((req, res, body, json) => {
    if (req.url === '/health') return json(idnMode === 'down' ? 503 : 200, {});
    if (idnMode === 'down') return req.socket.destroy();
    const claims = claimsOf(req);
    const u = new URL(req.url, 'http://x');
    idnCalls.push({ method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), claims, body });
    if (!claims) return json(401, { error: 'bad', code: 'bad_signature' });
    if (u.pathname === '/internal/identity/operators/session') {
      if (idnMode === 'open') return json(200, { required: false, authed: true, role: 'admin', permissions: permissionsFor('admin') });
      const o = ops[u.searchParams.get('id')];
      if (!o || !o.active) return json(200, { required: true, authed: false });
      return json(200, { required: true, authed: true, id: u.searchParams.get('id'), username: o.username, role: o.role, permissions: permissionsFor(o.role) });
    }
    if (u.pathname === '/internal/identity/operators/login') {
      loginCalls.push(body);
      const entry = Object.entries(ops).find(([, o]) => o.username === body.username && o.active);
      if (!entry || entry[1].password !== body.password) return json(401, { error: 'Wrong username or password', code: 'bad_credentials' });
      return json(200, { id: entry[0], username: entry[1].username, role: entry[1].role, permissions: permissionsFor(entry[1].role) });
    }
    if (u.pathname === '/internal/identity/audit') return json(200, { ok: true });
    if (u.pathname === '/internal/identity/admin/users' && req.method === 'POST') return json(410, { error: 'gone' });
    if (u.pathname === '/internal/identity/admin/operators/000000000000000000000001' && req.method === 'PUT') return json(400, { error: 'This is the only admin left' });
    json(200, { identity: true, method: req.method, path: u.pathname });
  });
  const config = (extra = {}) => loadConfig({
    MONOLITH_URL: `http://127.0.0.1:${mono.address().port}`,
    ENGAGEMENT_URL: `http://127.0.0.1:${eng.address().port}`,
    IDENTITY_URL: `http://127.0.0.1:${idn.address().port}`,
    INTERNAL_JWT_SECRET: SECRET,
    ADMIN_SESSION_SECRET: COOKIE_SECRET,
    SERVICE_TIMEOUT_MS: '1000',
    ...extra,
  });
  gw = http.createServer(createApp(config(), { logger: quiet, now: () => clock }));
  await new Promise((r) => gw.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${gw.address().port}`;
});
after(() => { for (const s of [gw, mono, idn, eng]) s.closeAllConnections?.(); for (const s of [gw, mono, idn, eng]) s.close(); });
beforeEach(() => {
  monoSeen = []; idnCalls = []; engCalls = []; loginCalls = [];
  idnMode = 'ok';
  clock += 60_000; // every test starts past the 5 s session cache
  ops = {
    aaaaaaaaaaaaaaaaaaaaaaaa: { username: 'root', role: 'admin', active: true, password: 'root-password' },
    bbbbbbbbbbbbbbbbbbbbbbbb: { username: 'ed', role: 'editor', active: true, password: 'ed-password' },
    cccccccccccccccccccccccc: { username: 'view', role: 'viewer', active: true, password: 'view-password' },
  };
});

/** A separate gateway: its own login throttle, its own session cache, its own circuit breaker. */
async function freshGateway(env = {}) {
  const g = http.createServer(createApp(loadConfig({
    MONOLITH_URL: `http://127.0.0.1:${mono.address().port}`,
    ENGAGEMENT_URL: `http://127.0.0.1:${eng.address().port}`,
    IDENTITY_URL: `http://127.0.0.1:${idn.address().port}`,
    INTERNAL_JWT_SECRET: SECRET, ADMIN_SESSION_SECRET: COOKIE_SECRET, SERVICE_TIMEOUT_MS: '1000', ...env,
  }), { logger: quiet, now: () => clock }));
  await new Promise((r) => g.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${g.address().port}`, close: () => { g.closeAllConnections?.(); g.close(); } };
}

async function call(method, path, { headers = {}, body, ip, at = base } = {}) {
  const res = await fetch(`${at}${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(ip ? { 'x-forwarded-for': ip } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, body: json, headers: res.headers, text };
}
const settle = () => new Promise((r) => setTimeout(r, 80)); // audit POSTs are fire-and-forget

/** Sign in as a seeded operator through the real login route; returns the cookie header. */
async function login(username) {
  const o = Object.values(ops).find((x) => x.username === username);
  const r = await call('POST', '/api/admin/login', { body: { username, password: o.password } });
  assert.equal(r.status, 200, r.text);
  return { cookie: r.headers.get('set-cookie').split(';')[0] };
}
const as = login;

describe('login, cookie, session, logout', () => {
  test('a good login sets an HttpOnly SameSite=Strict cookie and answers the dashboard\'s shape; the hash never appears', async () => {
    const r = await call('POST', '/api/admin/login', { body: { username: ' ROOT ', password: 'root-password' } });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { ok: true, required: true, username: 'root', role: 'admin', permissions: permissionsFor('admin') });
    const sc = r.headers.get('set-cookie');
    assert.match(sc, /^pooja_admin=[^;]+; Path=\/; HttpOnly; SameSite=Strict; Max-Age=43200$/);
    assert.equal(loginCalls[0].username, 'root', 'trimmed and lower-cased before it reaches identity');
    const claims = idnCalls.find((c) => c.path.endsWith('/operators/login')).claims;
    assert.equal(claims.iss, 'admin-bff');
  });

  test('wrong password and unknown user are the same 401; over-long passwords are refused WITHOUT calling identity', async () => {
    const a = await call('POST', '/api/admin/login', { body: { username: 'root', password: 'nope' } });
    const b = await call('POST', '/api/admin/login', { body: { username: 'ghost', password: 'root-password' } });
    assert.deepEqual([a.status, a.body], [401, { error: 'Wrong username or password' }]);
    assert.deepEqual([b.status, b.body], [401, { error: 'Wrong username or password' }]);
    loginCalls.length = 0;
    const c = await call('POST', '/api/admin/login', { body: { username: 'root', password: 'x'.repeat(257) } });
    assert.equal(c.status, 401);
    assert.equal(loginCalls.length, 0);
    assert.equal(a.headers.get('set-cookie'), null);
  });

  test('throttle: 10 failures per client+user then 429 with Retry-After; another user is unaffected; success clears the count', async () => {
    const g = await freshGateway(PROD);
    const ip = '10.0.0.1';
    for (let i = 0; i < 10; i++) assert.equal((await call('POST', '/api/admin/login', { at: g.base, ip, body: { username: 'root', password: `bad${i}` } })).status, 401);
    const blocked = await call('POST', '/api/admin/login', { at: g.base, ip, body: { username: 'root', password: 'root-password' } });
    assert.equal(blocked.status, 429, 'even the RIGHT password is refused while locked out');
    assert.equal(blocked.body.code, 'rate_limited');
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
    assert.equal(blocked.body.retryAfterSec, Number(blocked.headers.get('retry-after')));
    assert.equal((await call('POST', '/api/admin/login', { at: g.base, ip, body: { username: 'ed', password: 'ed-password' } })).status, 200, 'a different user from the same client');
    assert.equal((await call('POST', '/api/admin/login', { at: g.base, ip: '10.0.0.2', body: { username: 'root', password: 'root-password' } })).status, 200, 'a different client');
    // success resets the per-user counter
    for (let i = 0; i < 9; i++) await call('POST', '/api/admin/login', { at: g.base, ip: '10.0.0.3', body: { username: 'view', password: 'bad' } });
    assert.equal((await call('POST', '/api/admin/login', { at: g.base, ip: '10.0.0.3', body: { username: 'view', password: 'view-password' } })).status, 200);
    for (let i = 0; i < 9; i++) assert.equal((await call('POST', '/api/admin/login', { at: g.base, ip: '10.0.0.3', body: { username: 'view', password: 'bad' } })).status, 401);
    g.close();
  });

  test('throttle: 40 failures from one client across usernames -> 429 for everyone behind that client', async () => {
    const g = await freshGateway(PROD);
    const ip = '10.0.1.1';
    for (let i = 0; i < 40; i++) await call('POST', '/api/admin/login', { at: g.base, ip, body: { username: `spray${i}`, password: 'x' } });
    const r = await call('POST', '/api/admin/login', { at: g.base, ip, body: { username: 'root', password: 'root-password' } });
    assert.equal(r.status, 429);
    g.close();
  });

  test('no operators exist -> {ok:true, required:false} without a cookie', async () => {
    idnMode = 'open';
    const r = await call('POST', '/api/admin/login', { body: { username: 'a', password: 'b' } });
    assert.deepEqual(r.body, { ok: true, required: false });
    assert.equal(r.headers.get('set-cookie'), null);
  });

  test('identity down at login -> a clear 503, not a 401 (it is not the operator\'s fault) and not counted as a failure', async () => {
    const g = await freshGateway(PROD);
    idnMode = 'down';
    const at = g.base;
    for (let i = 0; i < 12; i++) assert.equal((await call('POST', '/api/admin/login', { at, ip: '10.0.2.1', body: { username: 'root', password: 'root-password' } })).status, 503);
    idnMode = 'ok';
    // (a fresh gateway here: the first one's circuit breaker is open for 10 s after repeated failures, which is the point of a breaker)
    const g2 = await freshGateway(PROD);
    assert.equal((await call('POST', '/api/admin/login', { at: g2.base, ip: '10.0.2.1', body: { username: 'root', password: 'root-password' } })).status, 200);
    g.close(); g2.close();
  });

  test('GET /session: no cookie, forged cookie, valid cookie, role read from the record, deactivated, expired', async () => {
    assert.deepEqual((await call('GET', '/api/admin/session')).body, { required: true, authed: false });
    assert.deepEqual((await call('GET', '/api/admin/session', { headers: { cookie: 'pooja_admin=forged.value' } })).body, { required: true, authed: false });
    const h = await as('ed');
    assert.deepEqual((await call('GET', '/api/admin/session', { headers: h })).body, { required: true, authed: true, username: 'ed', role: 'editor', permissions: permissionsFor('editor') });
    ops.bbbbbbbbbbbbbbbbbbbbbbbb.role = 'viewer';
    clock += 6_000; // past the 5 s cache
    assert.equal((await call('GET', '/api/admin/session', { headers: h })).body.role, 'viewer', 'a demotion shows on the next call');
    ops.bbbbbbbbbbbbbbbbbbbbbbbb.active = false;
    clock += 6_000;
    assert.deepEqual((await call('GET', '/api/admin/session', { headers: h })).body, { required: true, authed: false });
    ops.bbbbbbbbbbbbbbbbbbbbbbbb.active = true;
    clock += 13 * 3600_000;
    assert.deepEqual((await call('GET', '/api/admin/session', { headers: h })).body, { required: true, authed: false }, 'cookie older than 12 h');
  });

  test('GET /session when no operator exists answers required:false (dev); logout clears the cookie', async () => {
    idnMode = 'open';
    assert.deepEqual((await call('GET', '/api/admin/session')).body, { required: false, authed: true, role: 'admin', permissions: permissionsFor('admin') });
    const out = await call('POST', '/api/admin/logout');
    assert.equal(out.status, 200);
    assert.deepEqual(out.body, { ok: true });
    assert.match(out.headers.get('set-cookie'), /^pooja_admin=; Path=\/; HttpOnly; SameSite=Strict; Max-Age=0$/);
  });

  test('the session is cached 5 s per operator: one identity lookup for a burst', async () => {
    const h = await as('root');
    idnCalls.length = 0;
    for (let i = 0; i < 4; i++) assert.equal((await call('GET', '/api/content/deities', { headers: h })).status, 200);
    assert.equal(idnCalls.filter((c) => c.path.endsWith('/operators/session')).length, 1);
  });

  test('cookie flags: None implies Secure; production implies Secure', async () => {
    const mk = async (env) => {
      const g = http.createServer(createApp(loadConfig({ MONOLITH_URL: `http://127.0.0.1:${mono.address().port}`, IDENTITY_URL: `http://127.0.0.1:${idn.address().port}`, INTERNAL_JWT_SECRET: SECRET, ADMIN_SESSION_SECRET: COOKIE_SECRET, ...env }), { logger: quiet }));
      await new Promise((r) => g.listen(0, '127.0.0.1', r));
      const res = await fetch(`http://127.0.0.1:${g.address().port}/api/admin/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'root', password: 'root-password' }) });
      g.close();
      return res.headers.get('set-cookie');
    };
    assert.match(await mk({ SESSION_SAMESITE: 'None' }), /SameSite=None; Max-Age=43200; Secure$/);
    assert.match(await mk({ NODE_ENV: 'production', CORS_ORIGIN: 'https://dash.example.com' }), /; Secure$/);
  });
});

describe('the gate in front of the monolith', () => {
  test('no session: the routes THIS BFF serves answer 401 {error:"Sign in required"} and call nothing; monolith routes are forwarded WITHOUT a token (its gate answers)', async () => {
    for (const [m, p] of [['GET', '/api/users'], ['GET', '/api/flags/full'], ['GET', '/api/admin/operators'], ['PUT', '/api/admin/policies/terms']]) {
      const r = await call(m, p, { body: m === 'PUT' ? {} : undefined });
      assert.equal(r.status, 401, p);
      assert.deepEqual(r.body, { error: 'Sign in required' });
    }
    assert.equal(monoSeen.length + engCalls.length, 0);
    assert.equal(idnCalls.filter((c) => !c.path.endsWith('/session')).length, 0);
    for (const [m, p] of [['GET', '/api/content/deities'], ['PUT', '/api/horoscope/day/2026-01-01'], ['GET', '/api/admin/poojas'], ['GET', '/api/poojas']]) {
      monoSeen.length = 0;
      await call(m, p, { body: m === 'PUT' ? {} : undefined, headers: { cookie: 'pooja_admin=forged.value', authorization: 'Bearer firebase-ish' } });
      assert.equal(monoSeen[0].headers.authorization, undefined, `${p}: nothing vouches for this caller`);
      assert.equal(monoSeen[0].headers.cookie, undefined);
    }
  });

  test('a signed-in operator is forwarded with a signed token - and NEITHER the cookie nor any Authorization the browser sent', async () => {
    const h = await as('ed');
    const r = await call('PUT', '/api/horoscope/day/2026-01-01', { headers: { ...h, authorization: 'Bearer firebase-token-from-a-browser' }, body: { readings: [] } });
    assert.equal(r.status, 200);
    const seen = monoSeen[0];
    assert.equal(seen.headers.cookie, undefined);
    assert.notEqual(seen.headers.authorization, 'Bearer firebase-token-from-a-browser');
    assert.deepEqual([seen.claims.iss, seen.claims.sub, seen.claims.role, seen.claims.ctx.username], ['admin-bff', 'bbbbbbbbbbbbbbbbbbbbbbbb', 'editor', 'ed']);
    assert.deepEqual(seen.claims.perms, permissionsFor('editor'));
    assert.deepEqual(seen.body, { readings: [] }, 'the body is streamed untouched');
  });

  test('role matrix: identity- and engagement-owned routes are gated HERE (area gate, by role)', async () => {
    const sample = [
      ['devotees (identity)', 'GET', '/api/users', { admin: 200, editor: 403, viewer: 403 }],
      ['operators (identity)', 'GET', '/api/admin/operators', { admin: 200, editor: 403, viewer: 403 }],
      ['audit log (identity)', 'GET', '/api/admin/audit-log', { admin: 200, editor: 403, viewer: 403 }],
      ['policies read (identity)', 'GET', '/api/admin/policies', { admin: 200, editor: 200, viewer: 200 }],
      ['policies write (identity)', 'PUT', '/api/admin/policies/terms', { admin: 200, editor: 403, viewer: 403 }],
      ['flags read (engagement)', 'GET', '/api/flags/full', { admin: 200, editor: 200, viewer: 200 }],
      ['flag write (engagement)', 'PUT', '/api/flags/bhajan', { admin: 200, editor: 403, viewer: 403 }],
      ['announcements write (engagement)', 'POST', '/api/content/announcements', { admin: 201, editor: 201, viewer: 403 }],
      ['push (engagement)', 'POST', '/api/admin/announcements/000000000000000000000001/push', { admin: 200, editor: 403, viewer: 403 }],
    ];
    const hs = { admin: await as('root'), editor: await as('ed'), viewer: await as('view') };
    for (const [name, m, p, want] of sample) {
      for (const role of ['admin', 'editor', 'viewer']) {
        const r = await call(m, p, { headers: hs[role], body: m === 'GET' ? undefined : {} });
        assert.equal(r.status, want[role], `${name} as ${role}: got ${r.status} ${r.text}`);
        if (want[role] === 403) assert.equal(r.body.code, 'forbidden');
      }
    }
  });

  test('monolith-owned routes: the role\'s permissions travel in the signed token and the monolith (still authoritative) applies the area gate', async () => {
    for (const [role, user] of [['admin', 'root'], ['editor', 'ed'], ['viewer', 'view']]) {
      monoSeen.length = 0;
      const r = await call('POST', '/api/admin/poojas', { headers: await as(user), body: {} });
      assert.equal(r.status, 200, 'the stand-in monolith does not gate; the real one does (pooja-api/src/identity-mode.test.mjs, access.test.mjs)');
      assert.deepEqual([monoSeen[0].claims.role, monoSeen[0].claims.perms], [role, permissionsFor(role)]);
    }
  });

  test('a refused request to a BFF-served route reaches no service at all', async () => {
    const h = await as('view');
    monoSeen.length = 0; engCalls.length = 0; idnCalls.length = 0;
    await call('GET', '/api/users', { headers: h });
    await call('PUT', '/api/flags/bhajan', { headers: h, body: {} });
    await call('POST', '/api/admin/operators', { headers: h, body: {} });
    assert.equal(monoSeen.length + engCalls.length, 0);
    assert.equal(idnCalls.filter((c) => !c.path.endsWith('/session')).length, 0);
  });

  test('PUBLIC routes pass without a session, carry no operator token, and lose any credential the client sent', async () => {
    const r = await call('GET', '/api/content', { headers: { cookie: 'pooja_admin=junk', authorization: 'Bearer abc' } });
    assert.equal(r.status, 200);
    assert.equal(monoSeen[0].headers.authorization, undefined);
    assert.equal(monoSeen[0].headers.cookie, undefined);
    assert.equal(idnCalls.length, 0, 'no identity call for a public route');
    assert.equal((await call('GET', '/api/policy/terms')).status, 200, 'public policy read passes to the monolith (retired there; the mobile BFF serves it)');
  });

  test('a devotee Bearer token does not become operator access; /admin/login is not a free pass for other paths', async () => {
    assert.equal((await call('GET', '/api/users', { headers: { authorization: 'Bearer anything' } })).status, 401);
    assert.equal((await call('GET', '/api/admin/login/../operators')).status, 401);
  });
});

describe('identity-owned routes', () => {
  test('GET /api/users reaches identity with the operator\'s id as subject and role/permissions as claims', async () => {
    const h = await as('root');
    idnCalls.length = 0;
    const r = await call('GET', '/api/users', { headers: h });
    assert.equal(r.status, 200);
    const c = idnCalls.find((x) => x.path === '/internal/identity/admin/users');
    assert.deepEqual([c.claims.iss, c.claims.sub, c.claims.role, c.claims.ctx.username], ['admin-bff', 'aaaaaaaaaaaaaaaaaaaaaaaa', 'admin', 'root']);
    assert.deepEqual(c.claims.perms, permissionsFor('admin'));
    assert.equal(monoSeen.length, 0);
  });

  test('POST /api/users stays 410 (passed through from identity, for an operator who may edit devotees)', async () => {
    assert.equal((await call('POST', '/api/users', { body: { contact: 'x' } })).status, 401, 'a stranger gets 401 first, as before');
    const r = await call('POST', '/api/users', { headers: await as('root'), body: { contact: 'x', name: 'y' } });
    assert.equal(r.status, 410);
    assert.equal(r.body.error, 'gone');
  });

  test('identity\'s refusals pass through with their message (lockout)', async () => {
    const r = await call('PUT', '/api/admin/operators/000000000000000000000001', { headers: await as('root'), body: { role: 'viewer' } });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'This is the only admin left');
  });

  test('an operator change through the BFF drops the cached session (a demotion bites immediately)', async () => {
    const h = await as('ed');
    assert.equal((await call('GET', '/api/flags/full', { headers: h })).status, 200);
    ops.bbbbbbbbbbbbbbbbbbbbbbbb.active = false; // identity now says inactive; BFF still has the cache (no clock advance)
    assert.equal((await call('GET', '/api/flags/full', { headers: h })).status, 200, 'within the 5 s window');
    await call('PUT', '/api/admin/operators/bbbbbbbbbbbbbbbbbbbbbbbb', { headers: await as('root'), body: { active: false } });
    assert.equal((await call('GET', '/api/flags/full', { headers: h })).status, 401);
  });
});

describe('audit log: every successful operator write goes to identity', () => {
  const entries = () => idnCalls.filter((c) => c.path === '/internal/identity/audit').map((c) => c.body);

  test('a proxied write, an identity write and an engagement write are all recorded; reads and failures are not', async () => {
    const h = await as('root');
    idnCalls.length = 0;
    await call('PUT', '/api/horoscope/day/2026-04-04', { headers: h, body: {} }); // monolith
    await call('PUT', '/api/admin/policies/terms', { headers: h, body: { title: 't' } }); // identity
    await call('PUT', '/api/flags/bhajan', { headers: h, body: { enabled: false } }); // engagement
    await call('GET', '/api/content/deities', { headers: h });
    await call('PUT', '/api/admin/operators/000000000000000000000001', { headers: h, body: { role: 'viewer' } }); // identity answers 400
    await call('PUT', '/api/flags/bhajan', { headers: await as('view'), body: {} }); // 403 at the BFF
    await settle();
    const e = entries();
    assert.deepEqual(e.map((x) => `${x.method} ${x.path}`).sort(), ['PUT /api/admin/policies/terms', 'PUT /api/flags/bhajan', 'PUT /api/horoscope/day/2026-04-04']);
    const h1 = e.find((x) => x.path.includes('horoscope'));
    assert.deepEqual([h1.operator, h1.role, h1.area, h1.targetId, h1.status], ['root', 'admin', 'horoscope', '2026-04-04', 200]);
    assert.equal(e.find((x) => x.path.includes('policies')).targetId, 'terms');
    assert.ok(e.every((x) => !('body' in x)), 'never a request body');
  });

  test('the phase-1 stopgap is gone: nothing is posted to the monolith\'s /internal/audit or asked of its /api/admin/session', async () => {
    const h = await as('root');
    await call('PUT', '/api/flags/bhajan', { headers: h, body: {} });
    await call('PUT', '/api/horoscope/day/2026-05-05', { headers: h, body: {} });
    await settle();
    assert.ok(monoSeen.every((s) => s.url !== '/internal/audit' && s.url !== '/api/admin/session'));
  });
});

describe('identity down', () => {
  test('BFF-served routes answer a clear 503 (never 401 - that would sign the operator out - and never open); monolith routes get a signed "unavailable" so ITS gate answers 503 too', async () => {
    const g = await freshGateway();
    const login2 = await call('POST', '/api/admin/login', { at: g.base, body: { username: 'root', password: 'root-password' } });
    const h = { cookie: login2.headers.get('set-cookie').split(';')[0] };
    idnMode = 'down';
    clock += 60_000;
    monoSeen.length = 0;
    for (const [m, p] of [['GET', '/api/users'], ['GET', '/api/flags/full'], ['GET', '/api/admin/session']]) {
      const r = await call(m, p, { headers: h, at: g.base });
      assert.equal(r.status, 503, p);
      assert.equal(r.body.code, 'identity_unavailable');
    }
    assert.equal(monoSeen.length, 0);
    await call('GET', '/api/content/deities', { headers: h, at: g.base });
    assert.deepEqual([monoSeen[0].claims.iss, monoSeen[0].claims.sub, monoSeen[0].claims.ctx.authError, monoSeen[0].claims.perms], ['admin-bff', null, 'unavailable', []]);
    g.close();
  });

  test('public routes keep working; /api/health stays 200 with degraded ["identity"]; /health/deps is 503', async () => {
    const g = await freshGateway();
    idnMode = 'down';
    assert.equal((await call('GET', '/api/content', { at: g.base })).status, 200);
    const h = await call('GET', '/api/health', { at: g.base });
    assert.equal(h.status, 200);
    assert.deepEqual(h.body.degraded, ['identity']);
    assert.equal((await call('GET', '/health/deps', { at: g.base })).status, 503);
    g.close();
  });
});

describe('no operator exists', () => {
  test('development: the dashboard is open (admin token for "local-dev"); production: 503 no_operators, never open', async () => {
    idnMode = 'open';
    const r = await call('GET', '/api/content/deities');
    assert.equal(r.status, 200);
    assert.deepEqual([monoSeen[0].claims.sub, monoSeen[0].claims.role], ['local-dev', 'admin']);
    const g = http.createServer(createApp(loadConfig({ MONOLITH_URL: `http://127.0.0.1:${mono.address().port}`, IDENTITY_URL: `http://127.0.0.1:${idn.address().port}`, INTERNAL_JWT_SECRET: SECRET, ADMIN_SESSION_SECRET: COOKIE_SECRET, NODE_ENV: 'production', CORS_ORIGIN: 'https://d.example.com' }), { logger: quiet }));
    await new Promise((ok) => g.listen(0, '127.0.0.1', ok));
    const pb = `http://127.0.0.1:${g.address().port}`;
    monoSeen.length = 0;
    const own = await fetch(`${pb}/api/users`);
    assert.equal(own.status, 503);
    assert.equal((await own.json()).code, 'no_operators');
    await fetch(`${pb}/api/content/deities`);
    g.close();
    assert.equal(monoSeen[0].claims.ctx.authError, 'no_operators', 'the monolith then answers 503 no_operators for a gated route - never open');
    assert.equal(monoSeen[0].claims.perms.length, 0);
  });
});

describe('the phone\'s FCM push registration is not an admin-BFF route', () => {
  test('POST (with a token) and DELETE /api/push/register are a plain 404 here: identity is never asked, nothing reaches the monolith', async () => {
    const cookie = await as('root');
    for (const [method, headers] of [['POST', { ...cookie, authorization: 'Bearer some-firebase-token' }], ['DELETE', {}], ['DELETE', cookie]]) {
      monoSeen.length = 0;
      idnCalls.length = 0;
      engCalls.length = 0;
      const r = await call(method, '/api/push/register', { headers, body: { token: 'fcm' } });
      assert.equal(r.status, 404, `${method}`);
      assert.deepEqual(r.body, { error: 'not found', code: 'not_found' });
      assert.equal(idnCalls.filter((c) => c.path.includes('/push/')).length, 0);
      assert.equal(engCalls.length + monoSeen.length, 0);
    }
  });

  test('the pre-existing anonymous Expo registration (POST, no Authorization header) is untouched: still engagement\'s', async () => {
    const r = await call('POST', '/api/push/register', { body: { deviceId: 'd', pushToken: 'ExponentPushToken[x]' } });
    assert.equal(r.status, 200);
    assert.equal(engCalls.at(-1).url, '/internal/engagement/push/register');
    assert.equal(idnCalls.filter((c) => c.path.includes('/push/')).length, 0);
  });
});

describe('IDENTITY_URL unset', () => {
  test('is exactly phase 1: no login/session handling here, requests (cookie included) go to the monolith untouched', async () => {
    const g = http.createServer(createApp(loadConfig({ MONOLITH_URL: `http://127.0.0.1:${mono.address().port}` }), { logger: quiet }));
    await new Promise((ok) => g.listen(0, '127.0.0.1', ok));
    monoSeen.length = 0;
    const r = await fetch(`http://127.0.0.1:${g.address().port}/api/admin/session`, { headers: { cookie: 'pooja_admin=abc' } });
    g.close();
    assert.equal(r.status, 200);
    assert.equal(monoSeen[0].headers.cookie, 'pooja_admin=abc');
    assert.equal(monoSeen[0].headers.authorization, undefined);
  });

  test('config: IDENTITY_URL without a secret is refused at boot', () => {
    assert.throws(() => loadConfig({ IDENTITY_URL: 'http://x:1' }), /INTERNAL_JWT_SECRET/);
  });
});
