// The admin BFF applies the `events` area gate to the events-owned operator routes, forwards role/perms in the signed token, audits writes and relays
// events' validation errors unchanged. Stand-ins for the monolith, identity and events.
// Run: node --test --test-concurrency=1 src/events.test.mjs   (no database needed)
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, beforeEach, describe, test } from 'node:test';

import { AREAS, CATALOG_ADMIN_ROUTES, ENGAGEMENT_ADMIN_ROUTES, EVENTS_ADMIN_ROUTES, IDENTITY_ADMIN_ROUTES, ORDERS_ADMIN_ROUTES, WALLET_ADMIN_ROUTES, areaFor, hasPermission, permissionsFor, verifyServiceToken } from '@bhakti/common';

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

let mono; let idn; let evt; let gw; let base;
let evtCalls; let audits; let monoSeen; let evtMode = 'ok';
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
    monoSeen.push(req.url);
    json(200, { via: 'monolith' });
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
  evt = await listen((req, res, body, json) => {
    if (req.url === '/health') return json(evtMode === 'down' ? 503 : 200, {});
    const u = new URL(req.url, 'http://x');
    const text = body.toString('utf8');
    evtCalls.push({ method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), claims: claimsOf(req), body: text ? JSON.parse(text) : undefined });
    if (evtMode === 'down') return req.socket.destroy();
    if (evtMode === 'bad') return json(400, { error: 'This event has problems that need fixing.', code: 'bad_event', fields: { 'milestones.items.0.title': 'Required.' } });
    if (evtMode === 'catalog') return json(503, { error: 'The catalog cannot be reached.', code: 'catalog_unavailable' });
    json(200, { events: true, method: req.method, path: u.pathname, echoed: text ? JSON.parse(text) : undefined });
  });
  const config = loadConfig({
    MONOLITH_URL: `http://127.0.0.1:${mono.address().port}`,
    IDENTITY_URL: `http://127.0.0.1:${idn.address().port}`,
    EVENTS_URL: `http://127.0.0.1:${evt.address().port}`,
    INTERNAL_JWT_SECRET: SECRET, ADMIN_SESSION_SECRET: COOKIE_SECRET, SERVICE_TIMEOUT_MS: '1000',
  });
  gw = http.createServer(createApp(config, { logger: quiet }));
  await new Promise((r) => gw.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${gw.address().port}`;
});
after(() => { for (const s of [gw, mono, idn, evt]) s.closeAllConnections?.(); for (const s of [gw, mono, idn, evt]) s.close(); });
beforeEach(() => { evtCalls = []; audits = []; monoSeen = []; evtMode = 'ok'; });

const settle = () => new Promise((r) => setTimeout(r, 80));
async function call(method, path, { headers = {}, body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, body: json, text };
}
const cookies = {};
async function as(role) {
  if (cookies[role]) return { cookie: cookies[role] };
  const name = { admin: 'root', editor: 'ed', viewer: 'view' }[role];
  const res = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: name, password: `${name}-pass` }) });
  assert.equal(res.status, 200);
  cookies[role] = res.headers.get('set-cookie').split(';')[0];
  return { cookie: cookies[role] };
}

describe('the `events` area in the gate tables', () => {
  test('it is a real area; admin + editor edit, viewer views, nobody else gains anything', () => {
    assert.ok(AREAS.includes('events'));
    assert.ok(hasPermission(permissionsFor('admin'), 'events:edit'));
    assert.ok(hasPermission(permissionsFor('editor'), 'events:edit'));
    assert.ok(hasPermission(permissionsFor('viewer'), 'events:view'));
    assert.ok(!hasPermission(permissionsFor('viewer'), 'events:edit'));
    assert.ok(!hasPermission(permissionsFor('nobody'), 'events:view'));
  });
  test('every route resolves to a MAPPED events area with the right level, and belongs to no other service', () => {
    assert.equal(EVENTS_ADMIN_ROUTES.length, 16);
    const others = new Set([...ENGAGEMENT_ADMIN_ROUTES, ...IDENTITY_ADMIN_ROUTES, ...WALLET_ADMIN_ROUTES, ...CATALOG_ADMIN_ROUTES, ...ORDERS_ADMIN_ROUTES].map((r) => `${r.method} ${r.path}`));
    for (const r of EVENTS_ADMIN_ROUTES) {
      const a = areaFor(r.method, r.sample ?? r.path);
      assert.ok(a.mapped, `${r.method} ${r.path} unmapped`);
      assert.equal(a.area, 'events');
      assert.equal(a.level, r.method === 'GET' ? 'view' : 'edit');
      assert.ok(!others.has(`${r.method} ${r.path}`));
    }
    // the fixed path comes before `:id`
    const paths = EVENTS_ADMIN_ROUTES.filter((r) => r.method === 'GET').map((r) => r.path);
    assert.ok(paths.indexOf('/admin/events/task-kinds') < paths.indexOf('/admin/events/:id'));
  });
});

describe('role x route over HTTP', () => {
  test('admin and editor reach every route; the viewer only reads; a stranger is 401; the call carries role + perms', async () => {
    for (const r of EVENTS_ADMIN_ROUTES) {
      const sample = r.sample ?? r.path;
      for (const role of ['admin', 'editor', 'viewer']) {
        const allowed = r.method === 'GET' || role !== 'viewer';
        evtCalls = [];
        const res = await call(r.method, `/api${sample}`, { headers: await as(role), body: r.method === 'GET' || r.method === 'DELETE' ? undefined : { title: 'x' } });
        if (allowed) {
          assert.equal(res.status, r.successStatus ?? 200, `${role} ${r.method} ${r.path}`);
          assert.equal(evtCalls.length, 1);
          assert.equal(evtCalls[0].path, `/internal/events${sample}`);
          assert.equal(evtCalls[0].claims.iss, 'admin-bff');
          assert.equal(evtCalls[0].claims.role, role);
          assert.deepEqual(evtCalls[0].claims.perms, permissionsFor(role));
        } else {
          assert.equal(res.status, 403, `${role} ${r.method} ${r.path}`);
          assert.equal(res.body.needs, 'events:edit');
          assert.equal(evtCalls.length, 0);
        }
      }
      const anon = await call(r.method, `/api${sample}`);
      assert.equal(anon.status, 401, `anon ${r.method} ${r.path}`);
    }
    assert.equal(monoSeen.length, 0);
  });
  test('writes are audited; reads are not', async () => {
    await call('POST', '/api/admin/events', { headers: await as('editor'), body: { title: 'T' } });
    await call('GET', '/api/admin/events', { headers: await as('editor') });
    await settle();
    assert.equal(audits.length, 1);
    assert.equal(audits[0].body.method, 'POST');
    assert.match(audits[0].body.path, /admin\/events$/);
  });
  test('the query string and body reach events; events\' answers (bad_event + fields, catalog_unavailable) pass through unchanged', async () => {
    evtMode = 'bad';
    const bad = await call('POST', '/api/admin/events', { headers: await as('admin'), body: { title: '' } });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.code, 'bad_event');
    assert.ok(bad.body.fields['milestones.items.0.title']);
    evtMode = 'catalog';
    const c = await call('PUT', '/api/admin/events/000000000000000000000001', { headers: await as('admin'), body: { published: true } });
    assert.equal(c.status, 503);
    assert.equal(c.body.code, 'catalog_unavailable');
    evtMode = 'ok';
    await call('GET', '/api/admin/events?x=1', { headers: await as('admin') });
    assert.deepEqual(evtCalls.at(-1).query, { x: '1' });
  });
  test('participants + stats: area events:view (the viewer reads), the cursor and limit reach events, and a read is not audited', async () => {
    const id = '000000000000000000000001';
    for (const p of [`/api/admin/events/${id}/participants`, `/api/admin/events/${id}/stats`]) {
      assert.equal((await call('GET', p)).status, 401, `anon ${p}`);
      for (const role of ['admin', 'editor', 'viewer']) assert.equal((await call('GET', p, { headers: await as(role) })).status, 200, `${role} ${p}`);
      const a = areaFor('GET', p.replace('/api', ''));
      assert.deepEqual([a.area, a.level, a.mapped, a.also], ['events', 'view', true, undefined]);
    }
    evtCalls = [];
    await call('POST', `/api/admin/events/${id}/participants`, { headers: await as('admin'), body: {} });
    assert.equal(evtCalls.length, 0, 'a write to participants is not an events route');
    await call('GET', `/api/admin/events/${id}/participants?cursor=abc&limit=25&junk[]=1`, { headers: await as('viewer') });
    assert.deepEqual(evtCalls.at(-1).query, { cursor: 'abc', limit: '25' });
    assert.equal(evtCalls.at(-1).claims.role, 'viewer', 'events masks from the signed role + perms');
    assert.deepEqual(evtCalls.at(-1).claims.perms, permissionsFor('viewer'));
    audits = [];
    await settle();
    assert.equal(audits.length, 0);
  });
  test('the public devotee routes are NOT served by the admin BFF', async () => {
    await call('GET', '/api/events');
    assert.equal(evtCalls.length, 0, 'never reaches events (it falls through to the monolith, which has no events)');
    for (const [m, p] of [['POST', '/api/events/garba/join'], ['POST', '/api/events/garba/leave'], ['GET', '/api/me/events'], ['GET', '/api/me/badges'], ['POST', '/api/events/garba/milestones/m1/tasks/t1/progress']]) {
      await call(m, p, { body: m === 'POST' ? {} : undefined });
    }
    assert.equal(evtCalls.length, 0);
  });
});
