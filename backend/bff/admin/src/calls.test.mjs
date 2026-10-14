// Phase 6: the admin BFF applies the area gate to the calls-owned operator routes (astrologers, calls, payouts), forwards role/perms in the signed
// token, audits the writes, and serves the public astrologer list. Stand-ins for the monolith, identity and calls.
// Run: node --test --test-concurrency=1 src/orders.test.mjs   (no database needed)
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, beforeEach, describe, test } from 'node:test';

import { CATALOG_ADMIN_ROUTES, ENGAGEMENT_ADMIN_ROUTES, IDENTITY_ADMIN_ROUTES, ORDERS_ADMIN_ROUTES, WALLET_ADMIN_ROUTES, CALLS_ADMIN_ROUTES, CALLS_PUBLIC_GETS, areaFor, hasPermission, permissionsFor, verifyServiceToken } from '@bhakti/common';

import { createApp } from './app.js';
import { loadConfig } from './config.js';

const SECRET = 'test-secret-test-secret-1234';
const COOKIE_SECRET = 'cookie-secret-cookie-secret-12';
const quiet = { info() {}, warn() {}, error() {} };
const OPS = {
  aaaaaaaaaaaaaaaaaaaaaaaa: { username: 'root', role: 'admin', password: 'root-pass' },
  bbbbbbbbbbbbbbbbbbbbbbbb: { username: 'ed', role: 'editor', password: 'ed-pass' },
  cccccccccccccccccccccccc: { username: 'view', role: 'viewer', password: 'view-pass' },
};

let mono; let idn; let ord; let gw; let base;
let ordCalls; let audits; let monoSeen; let ordMode = 'ok';
let clock = Date.now();
const claimsOf = (req) => { try { return verifyServiceToken(req.headers.authorization?.replace(/^Bearer /, ''), { secret: SECRET }); } catch { return null; } };

function listen(handler) {
  const s = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      handler(req, res, body, (code, b, h = {}) => { res.writeHead(code, { 'content-type': 'application/json', ...h }); res.end(JSON.stringify(b)); });
    });
  });
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r(s)));
}

before(async () => {
  mono = await listen((req, res, body, json) => {
    if (req.url === '/api/health') return json(200, { ok: true });
    monoSeen.push({ method: req.method, url: req.url, claims: claimsOf(req) });
    json(200, { via: 'monolith', path: req.url.split('?')[0] });
  });
  idn = await listen((req, res, body, json) => {
    if (req.url === '/health') return json(200, {});
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/internal/identity/operators/session') {
      const o = OPS[u.searchParams.get('id')];
      return json(200, o ? { required: true, authed: true, id: u.searchParams.get('id'), username: o.username, role: o.role, permissions: permissionsFor(o.role) } : { required: true, authed: false });
    }
    if (u.pathname === '/internal/identity/operators/login') {
      const b = JSON.parse(body.toString());
      const e = Object.entries(OPS).find(([, o]) => o.username === b.username && o.password === b.password);
      return e ? json(200, { id: e[0], username: e[1].username, role: e[1].role, permissions: permissionsFor(e[1].role) }) : json(401, { error: 'Wrong username or password', code: 'bad_credentials' });
    }
    if (u.pathname === '/internal/identity/audit') { audits.push({ claims: claimsOf(req), body: JSON.parse(body.toString()) }); return json(200, { ok: true }); }
    json(200, { identity: true });
  });
  ord = await listen((req, res, body, json) => {
    if (req.url === '/health') return json(ordMode === 'down' ? 503 : 200, {});
    const u = new URL(req.url, 'http://x');
    const text = body.toString('utf8');
    ordCalls.push({ method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), claims: claimsOf(req), body: text ? JSON.parse(text) : undefined });
    if (ordMode === 'down') return req.socket.destroy();
    if (ordMode === 'badtoken') return json(401, { error: 'bad', code: 'bad_signature' });
    if (ordMode === 'invalid' && req.method !== 'GET') return json(409, { error: 'That sign-in is already used by Pt. Sharma.', code: 'duplicate_identifier' });
    if (ordMode === 'wallet' && req.method !== 'GET') return json(503, { error: 'Coins are temporarily unavailable. Please try again in a moment.', code: 'wallet_unavailable' });
    if (u.pathname === '/internal/calls/astrologers') return json(200, { astrologers: [{ id: 'a1' }] });
    json(200, { calls: true, method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), echoed: text ? JSON.parse(text) : undefined });
  });
  const config = loadConfig({
    MONOLITH_URL: `http://127.0.0.1:${mono.address().port}`,
    IDENTITY_URL: `http://127.0.0.1:${idn.address().port}`,
    CALLS_URL: `http://127.0.0.1:${ord.address().port}`,
    INTERNAL_JWT_SECRET: SECRET, ADMIN_SESSION_SECRET: COOKIE_SECRET, SERVICE_TIMEOUT_MS: '1000',
  });
  gw = http.createServer(createApp(config, { logger: quiet, now: () => clock }));
  await new Promise((r) => gw.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${gw.address().port}`;
});
after(() => { for (const s of [gw, mono, idn, ord]) s.closeAllConnections?.(); for (const s of [gw, mono, idn, ord]) s.close(); });
beforeEach(() => { ordCalls = []; audits = []; monoSeen = []; ordMode = 'ok'; clock += 60_000; });

const settle = () => new Promise((r) => setTimeout(r, 80)); // audit POSTs are fire-and-forget
async function call(method, path, { headers = {}, body, raw } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, body: json, headers: res.headers, text };
}
const cookies = {};
async function as(role) {
  if (cookies[role]) return { cookie: cookies[role] };
  const name = { admin: 'root', editor: 'ed', viewer: 'view' }[role];
  const r = await call('POST', '/api/admin/login', { body: { username: name, password: `${name}-pass` } });
  assert.equal(r.status, 200, r.text);
  cookies[role] = r.headers.get('set-cookie').split(';')[0];
  return { cookie: cookies[role] };
}

describe('the route table (what this BFF hands to calls)', () => {
  test('every route resolves to a MAPPED area (astrologers, calls or payouts), with the right level', () => {
    assert.equal(CALLS_ADMIN_ROUTES.length, 12);
    for (const r of CALLS_ADMIN_ROUTES) {
      const a = areaFor(r.method, r.sample ?? r.path);
      assert.ok(a.mapped, `${r.method} ${r.path} has no entry in access/routes.js (it would be admin-only)`);
      assert.equal(a.area, r.area);
      assert.ok(['astrologers', 'calls', 'payouts'].includes(a.area));
      assert.equal(a.level, r.method === 'GET' ? 'view' : 'edit');
    }
  });

  test('it does not take another service\'s paths, and has the whole astrologers / calls / payouts dashboard surface', () => {
    const mine = new Set(CALLS_ADMIN_ROUTES.map((r) => `${r.method} ${r.path}`));
    for (const other of [...ENGAGEMENT_ADMIN_ROUTES, ...IDENTITY_ADMIN_ROUTES, ...WALLET_ADMIN_ROUTES, ...CATALOG_ADMIN_ROUTES, ...ORDERS_ADMIN_ROUTES]) assert.ok(!mine.has(`${other.method} ${other.path}`), `${other.method} ${other.path} belongs to another service`);
    assert.deepEqual([...mine].sort(), [
      'DELETE /admin/astrologers/:id', 'GET /admin/astrologers', 'GET /admin/calls', 'GET /admin/payouts', 'GET /admin/payouts/summary',
      'POST /admin/astrologers', 'POST /admin/astrologers/:id/reactivate', 'POST /admin/astrologers/:id/suspend', 'POST /admin/calls/:id/end',
      'POST /admin/calls/:id/refund', 'POST /admin/payouts', 'PUT /admin/astrologers/:id',
    ]);
  });
});

describe('the area gate, role by role, over every calls route', () => {
  test('the full role x route matrix: a role needs <area>:view to read and <area>:edit to write; a stranger 401; a refused call never reaches calls', async () => {
    let allowedWrites = 0;
    for (const r of CALLS_ADMIN_ROUTES) {
      const sample = r.sample ?? r.path;
      for (const role of ['admin', 'editor', 'viewer']) {
        const held = permissionsFor(role);
        const a = areaFor(r.method, sample);
        const allowed = hasPermission(held, `${a.area}:${a.level}`);
        ordCalls = [];
        const res = await call(r.method, `/api${sample}`, { headers: await as(role), body: r.method === 'GET' || r.method === 'DELETE' ? undefined : { name: 'x' } });
        if (allowed) {
          assert.equal(res.status, r.successStatus ?? 200, `${role} ${r.method} ${r.path}`);
          assert.equal(ordCalls.length, 1);
          if (r.method !== 'GET') allowedWrites += 1;
        } else {
          assert.equal(res.status, 403, `${role} ${r.method} ${r.path}`);
          assert.deepEqual([res.body.code, res.body.needs], ['forbidden', `${a.area}:${a.level}`]);
          assert.equal(ordCalls.length, 0, 'a refused call never reaches calls');
        }
      }
      const anon = await call(r.method, `/api${sample}`, { body: r.method === 'GET' || r.method === 'DELETE' ? undefined : {} });
      assert.equal(anon.status, 401, `anon ${r.method} ${r.path}`);
    }
    assert.equal(allowedWrites, 8, 'the admin may write all eight');
    for (const area of ['astrologers', 'calls', 'payouts']) assert.deepEqual(['editor', 'viewer'].map((role) => hasPermission(permissionsFor(role), `${area}:edit`)), [false, false]);
  });
});

describe('forwarding', () => {
  test('calls receives a token from admin-bff carrying the operator\'s id, role, perms and username; the body arrives as parsed JSON, the query string intact', async () => {
    const r = await call('POST', '/api/admin/astrologers/000000000000000000000001/suspend', { headers: await as('admin'), body: {} });
    assert.equal(r.status, 200);
    const c = ordCalls[0];
    assert.equal(c.path, '/internal/calls/admin/astrologers/000000000000000000000001/suspend');
    assert.deepEqual([c.claims.iss, c.claims.sub, c.claims.role, c.claims.ctx.username], ['admin-bff', 'aaaaaaaaaaaaaaaaaaaaaaaa', 'admin', 'root']);
    assert.deepEqual(c.claims.perms, permissionsFor('admin'));
    const refund = await call('POST', '/api/admin/calls/000000000000000000000001/refund', { headers: await as('admin'), body: { coins: 4, reason: 'echo', requestId: 'g1' } });
    assert.deepEqual(ordCalls.at(-1).body, { coins: 4, reason: 'echo', requestId: 'g1' });
    assert.equal(refund.status, 200);
    const g = await call('GET', '/api/admin/calls?outcome=failed&limit=5&from=2026-01-01', { headers: await as('viewer') });
    assert.deepEqual(g.body.query, { outcome: 'failed', limit: '5', from: '2026-01-01' });
    assert.equal(ordCalls.at(-1).claims.role, 'viewer');
    assert.deepEqual(ordCalls.at(-1).claims.perms, permissionsFor('viewer'));
    assert.equal((await call('GET', '/api/admin/payouts?astrologerId=a1', { headers: await as('editor') })).body.query.astrologerId, 'a1');
    assert.equal(monoSeen.length, 0);
  });

  test('a create answers 201 (as the monolith did), a delete passes no body', async () => {
    const c = await call('POST', '/api/admin/astrologers', { headers: await as('admin'), body: { name: 'A', ratePerMin: 5, signInEmail: 'a@b.co' } });
    assert.equal(c.status, 201);
    assert.deepEqual(ordCalls.at(-1).body, { name: 'A', ratePerMin: 5, signInEmail: 'a@b.co' });
    assert.equal((await call('POST', '/api/admin/payouts', { headers: await as('admin'), body: { astrologerId: 'a', amountPaise: 1 } })).status, 201);
    const d = await call('DELETE', '/api/admin/astrologers/000000000000000000000001', { headers: await as('admin') });
    assert.equal(d.status, 200);
    assert.equal(ordCalls.at(-1).body, undefined);
  });

  test('calls\' answers pass through unchanged (status, message, code, extras)', async () => {
    ordMode = 'invalid';
    const a = await call('POST', '/api/admin/astrologers', { headers: await as('admin'), body: { name: 'A' } });
    assert.deepEqual([a.status, a.body], [409, { error: 'That sign-in is already used by Pt. Sharma.', code: 'duplicate_identifier' }]);
  });

  test('a token calls rejects is OUR problem: 502, never a 401 that would sign the operator out; calls down: a JSON 502 and the session is untouched', async () => {
    ordMode = 'badtoken';
    assert.equal((await call('GET', '/api/admin/calls', { headers: await as('admin') })).status, 502);
    ordMode = 'down';
    clock += 20_000;
    const d = await call('GET', '/api/admin/calls', { headers: await as('admin') });
    assert.deepEqual([d.status, d.body.code], [502, 'upstream_unavailable']);
    ordMode = 'ok';
    clock += 20_000;
    assert.equal((await call('GET', '/api/admin/session', { headers: await as('admin') })).body.authed, true);
  });
});

describe('audit (every successful write, through identity)', () => {
  test('an astrologer edit, a force end, a goodwill refund and a payout are recorded with operator, role, area, method, path and status - and no body', async () => {
    const id = '6acf0a7fce86d1f7b8489916';
    await call('PUT', `/api/admin/astrologers/${id}`, { headers: await as('admin'), body: { signInEmail: 'secret@private.example' } });
    await call('POST', `/api/admin/calls/${id}/end`, { headers: await as('admin'), body: {} });
    await call('POST', `/api/admin/calls/${id}/refund`, { headers: await as('admin'), body: { coins: 4, reason: 'a private reason' } });
    await call('POST', '/api/admin/payouts', { headers: await as('admin'), body: { astrologerId: id, amountPaise: 100, reference: 'UTR-private' } });
    await settle();
    assert.deepEqual(audits.map((a) => [a.body.operator, a.body.role, a.body.area, a.body.method, a.body.path, a.body.status]), [
      ['root', 'admin', 'astrologers', 'PUT', `/api/admin/astrologers/${id}`, 200],
      ['root', 'admin', 'calls', 'POST', `/api/admin/calls/${id}/end`, 200],
      ['root', 'admin', 'calls', 'POST', `/api/admin/calls/${id}/refund`, 200],
      ['root', 'admin', 'payouts', 'POST', '/api/admin/payouts', 201],
    ]);
    for (const secret of ['secret@private.example', 'a private reason', 'UTR-private']) assert.equal(JSON.stringify(audits).includes(secret), false, secret);
    assert.equal(audits[0].claims.iss, 'admin-bff');
    audits.length = 0;
    await call('GET', '/api/admin/calls', { headers: await as('admin') });
    await call('POST', `/api/admin/calls/${id}/end`, { headers: await as('viewer'), body: {} });
    ordMode = 'invalid';
    await call('POST', '/api/admin/astrologers', { headers: await as('admin'), body: { name: 'A' } });
    await settle();
    assert.equal(audits.length, 0, 'reads, refusals and failures are not audited');
  });
});

describe('public: the astrologer list works here too (no session)', () => {
  test('GET /api/astrologers needs no cookie, is served from calls as admin-bff; calls down is a 503 (no stale presence list)', async () => {
    assert.deepEqual(CALLS_PUBLIC_GETS.map((g) => g.path), ['/astrologers', '/astrologers/:id']);
    const r = await call('GET', '/api/astrologers');
    assert.deepEqual([r.status, r.body.astrologers[0].id], [200, 'a1']);
    assert.deepEqual([ordCalls[0].claims.iss, ordCalls[0].path], ['admin-bff', '/internal/calls/astrologers']);
    ordMode = 'down';
    const d = await call('GET', '/api/astrologers');
    assert.deepEqual([d.status, d.body.code], [503, 'calls_unavailable']);
  });

  test('the devotee and astrologer routes are the mobile BFF\'s: here they reach the monolith\'s gate, never calls', async () => {
    for (const [m, p] of [['GET', '/api/calls/c1'], ['POST', '/api/calls'], ['GET', '/api/astrologer/me'], ['PUT', '/api/astrologer/me/presence']]) {
      await call(m, p, { body: m === 'GET' ? undefined : {} });
    }
    assert.equal(ordCalls.length, 0);
  });
});

describe('without IDENTITY_URL (legacy): the monolith still owns the session and the audit log', () => {
  let legacyMono; let legacy; let lbase; let monoAudits;
  before(async () => {
    monoAudits = [];
    legacyMono = await listen((req, res, body, json) => {
      if (req.url === '/api/health') return json(200, { ok: true });
      if (req.url === '/api/admin/session') return json(200, /pooja_admin=ed/.test(req.headers.cookie || '') ? { required: true, authed: true, username: 'ed', role: 'editor', permissions: permissionsFor('editor') } : { required: true, authed: false });
      if (req.url === '/internal/audit') { monoAudits.push(JSON.parse(body.toString())); return json(200, { ok: true }); }
      json(200, { via: 'monolith' });
    });
    const config = loadConfig({ MONOLITH_URL: `http://127.0.0.1:${legacyMono.address().port}`, CALLS_URL: `http://127.0.0.1:${ord.address().port}`, INTERNAL_JWT_SECRET: SECRET, SERVICE_TIMEOUT_MS: '1000' });
    legacy = http.createServer(createApp(config, { logger: quiet }));
    await new Promise((r) => legacy.listen(0, '127.0.0.1', r));
    lbase = `http://127.0.0.1:${legacy.address().port}`;
  });
  after(() => { for (const s of [legacy, legacyMono]) s.closeAllConnections?.(); for (const s of [legacy, legacyMono]) s.close(); });

  test('gate here, session from the monolith: an editor reads but cannot suspend an astrologer', async () => {
    const ed = { cookie: 'pooja_admin=ed' };
    assert.equal((await fetch(`${lbase}/api/admin/astrologers`)).status, 401);
    assert.equal((await fetch(`${lbase}/api/admin/astrologers`, { headers: ed })).status, 200);
    assert.equal((await fetch(`${lbase}/api/admin/astrologers/000000000000000000000001/suspend`, { method: 'POST', headers: { ...ed, 'content-type': 'application/json' }, body: '{}' })).status, 403);
  });
});

describe('configuration', () => {
  test('CALLS_URL needs the secret; unset leaves the BFF as before', async () => {
    const env = { MONOLITH_URL: 'http://m', INTERNAL_JWT_SECRET: SECRET };
    assert.throws(() => loadConfig({ ...env, INTERNAL_JWT_SECRET: '', CALLS_URL: 'http://c' }), /INTERNAL_JWT_SECRET/);
    assert.equal(loadConfig({ ...env, CALLS_URL: 'http://c/' }).callsUrl, 'http://c');
    assert.equal(loadConfig(env).callsUrl, '');
    const c = loadConfig({ MONOLITH_URL: `http://127.0.0.1:${mono.address().port}`, INTERNAL_JWT_SECRET: SECRET });
    const g = http.createServer(createApp(c, { logger: quiet }));
    await new Promise((r) => g.listen(0, '127.0.0.1', r));
    assert.equal((await (await fetch(`http://127.0.0.1:${g.address().port}/api/astrologers`)).json()).via, 'monolith');
    g.closeAllConnections?.();
    g.close();
  });

  test('/api/health reports degraded:["calls"] while it is down', async () => {
    ordMode = 'down';
    const h = await call('GET', '/api/health');
    assert.deepEqual([h.status, h.body.degraded], [200, ['calls']]);
  });
});
