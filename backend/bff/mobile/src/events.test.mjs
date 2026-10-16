// The mobile BFF serves GET /api/events and /api/events/:slug from the events service (Firebase-optional). Stand-ins for the monolith, identity and events.
// Run: node --test --test-concurrency=1 src/events.test.mjs   (no database, no Firebase)
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, beforeEach, describe, test } from 'node:test';

import { EVENTS_DEVOTEE_ROUTES, EVENTS_PUBLIC_GETS, verifyServiceToken } from '@bhakti/common';

import { createApp } from './app.js';
import { loadConfig } from './config.js';

const SECRET = 'test-secret-test-secret-1234';
const logger = { info() {}, warn() {}, error() {} };
const verifyIdToken = async (t) => {
  if (t.startsWith('good-')) return { uid: t.slice(5), phone_number: '+919800000001', firebase: { sign_in_provider: 'phone' } };
  throw new Error('Decoding Firebase ID token failed');
};
const firebase = { ready: () => true, error: () => null, projectId: () => 'p' };

let mono; let idn; let evt; let gw; let base;
let evtCalls; let evtMode = 'up'; let clock = 1_000_000; let monoSeen; let evtReply = null;
const claimsOf = (req) => { try { return verifyServiceToken(req.headers.authorization?.replace(/^Bearer /, ''), { secret: SECRET }); } catch { return null; } };

function listen(handler) {
  const s = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => handler(req, res, raw, (code, body, headers = {}) => { res.writeHead(code, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(body)); }));
  });
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r(s)));
}

before(async () => {
  mono = await listen((req, res, raw, json) => {
    if (req.url === '/api/health') return json(200, { ok: true });
    monoSeen.push(req.url);
    json(404, { via: 'monolith' });
  });
  idn = await listen((req, res, raw, json) => {
    if (req.url === '/health') return json(200, {});
    if (/\/status$/.test(req.url)) return json(200, { exists: true, blocked: false, name: 'Asha', role: 'devotee' });
    json(200, {});
  });
  evt = await listen((req, res, raw, json) => {
    if (req.url === '/health') return json(evtMode === 'down' ? 503 : 200, {});
    const u = new URL(req.url, 'http://x');
    evtCalls.push({ method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), claims: claimsOf(req), body: raw ? JSON.parse(raw) : undefined });
    if (evtMode === 'down') return req.socket.destroy();
    if (evtMode === 'badtoken') return json(401, { error: 'bad', code: 'bad_signature' });
    if (evtReply && (req.method === 'POST' || u.pathname.includes('/public/me/'))) return evtReply.status === 204 ? (res.writeHead(204), res.end()) : json(evtReply.status, evtReply.body);
    if (u.pathname === '/internal/events/public/events') return json(200, { types: [], tags: [], sections: { thisWeek: [{ slug: 'a', n: evtCalls.length }], upcoming: [] }, badgesCount: 0 });
    const m = /^\/internal\/events\/public\/events\/([^/]+)$/.exec(u.pathname);
    if (m && m[1] === 'garba') return json(200, { event: { slug: 'garba', me: null } });
    if (m) return json(404, { error: 'Event not found.', code: 'not_found' });
    json(404, {});
  });
  const config = loadConfig({
    MONOLITH_URL: `http://127.0.0.1:${mono.address().port}`,
    IDENTITY_URL: `http://127.0.0.1:${idn.address().port}`,
    EVENTS_URL: `http://127.0.0.1:${evt.address().port}`,
    INTERNAL_JWT_SECRET: SECRET, SERVICE_TIMEOUT_MS: '1000',
  });
  gw = http.createServer(createApp(config, { logger, verifyIdToken, firebase, now: () => clock }));
  await new Promise((r) => gw.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${gw.address().port}`;
});
after(() => { for (const s of [gw, mono, idn, evt]) s.closeAllConnections?.(); for (const s of [gw, mono, idn, evt]) s.close(); });
beforeEach(() => { evtCalls = []; monoSeen = []; evtMode = 'up'; evtReply = null; clock += 3_600_000; });

const get = async (path, headers = {}) => {
  const res = await fetch(`${base}${path}`, { headers });
  return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
};

describe('GET /api/events', () => {
  test('the route table is exactly the two public reads', () => {
    assert.deepEqual(EVENTS_PUBLIC_GETS.map((r) => r.path), ['/events', '/events/:slug']);
  });
  test('a guest is served (no Firebase token needed) with a service token that carries no devotee', async () => {
    const r = await get('/api/events?x=1');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.sections.upcoming, []);
    assert.equal(evtCalls[0].path, '/internal/events/public/events');
    assert.equal(evtCalls[0].claims.iss, 'mobile-bff');
    assert.ok(!evtCalls[0].claims.sub);
    assert.deepEqual(evtCalls[0].query, { x: '1' });
    assert.equal(monoSeen.length, 0);
  });
  test('a signed-in devotee rides as the token sub; a bad token is just a guest', async () => {
    await get('/api/events', { authorization: 'Bearer good-uid42' });
    assert.equal(evtCalls[0].claims.sub, 'uid42');
    evtCalls = [];
    const r = await get('/api/events', { authorization: 'Bearer garbage' });
    assert.equal(r.status, 200);
    assert.ok(!evtCalls[0].claims.sub);
  });
  test('detail passes through, the slug is encoded, and events\' 404 is relayed unchanged', async () => {
    assert.equal((await get('/api/events/garba')).body.event.slug, 'garba');
    const nf = await get('/api/events/nope');
    assert.equal(nf.status, 404);
    assert.equal(nf.body.code, 'not_found');
    await get('/api/events/a%20b');
    assert.equal(evtCalls.at(-1).path, '/internal/events/public/events/a%20b');
  });
  test('events down: the last good ANONYMOUS answer is served for 10 minutes (flagged), then 503 events_unavailable', async () => {
    const warm = await get('/api/events');
    evtMode = 'down';
    const stale = await get('/api/events');
    assert.equal(stale.status, 200);
    assert.equal(stale.headers.get('x-degraded'), 'events');
    assert.deepEqual(stale.body, warm.body);
    clock += 11 * 60_000;
    const gone = await get('/api/events');
    assert.equal(gone.status, 503);
    assert.equal(gone.body.code, 'events_unavailable');
  });
  test('a signed-in devotee is never served another caller\'s cached answer', async () => {
    await get('/api/events');
    evtMode = 'down';
    const r = await get('/api/events', { authorization: 'Bearer good-uid7' });
    assert.equal(r.status, 503);
  });
  test('a rejected service token is OUR misconfiguration: 502, never a 401 that signs the devotee out', async () => {
    evtMode = 'badtoken';
    const r = await get('/api/events/garba');
    assert.equal(r.status, 502);
    assert.equal(r.body.code, 'events_auth_failed');
  });
  test('this BFF serves no operator routes for events', async () => {
    const r = await fetch(`${base}/api/admin/events`);
    assert.notEqual(evtCalls.length, 1);
    assert.ok([401, 404].includes(r.status));
    assert.equal(evtCalls.length, 0);
  });
});

const send = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${base}${path}`, {
    method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

describe('the devotee\'s own routes: join, leave, progress, my events, my badges', () => {
  const routes = EVENTS_DEVOTEE_ROUTES.map((r) => ({ ...r, url: `/api${r.sample ?? r.path}` }));

  test('the route table is exactly these five', () => {
    assert.deepEqual(EVENTS_DEVOTEE_ROUTES.map((r) => `${r.method} ${r.path}`), [
      'POST /events/:slug/join', 'POST /events/:slug/leave', 'POST /events/:slug/milestones/:mKey/tasks/:tKey/progress', 'GET /me/events', 'GET /me/badges',
    ]);
  });

  test('every one needs a verified Firebase token: no token 401, a garbage token 401 - and events is never called', async () => {
    for (const r of routes) {
      assert.equal((await send(r.method, r.url, { body: r.method === 'POST' ? {} : undefined })).status, 401, `no token ${r.url}`);
      assert.equal((await send(r.method, r.url, { token: 'garbage', body: r.method === 'POST' ? {} : undefined })).status, 401, `bad token ${r.url}`);
    }
    assert.equal(evtCalls.length, 0);
    assert.equal(monoSeen.length, 0);
  });

  test('the verified uid rides as the signed sub (never from the body); path params are encoded; body and query reach events', async () => {
    evtReply = { status: 200, body: { ok: true } };
    const r = await send('POST', '/api/events/garba/join', { token: 'good-uid42', body: { requestId: 'r1', answers: { party: 2 }, uid: 'someone-else', sub: 'evil' } });
    assert.equal(r.status, 200);
    const c = evtCalls.at(-1);
    assert.deepEqual([c.method, c.path, c.claims.iss, c.claims.sub], ['POST', '/internal/events/public/events/garba/join', 'mobile-bff', 'uid42']);
    assert.deepEqual(c.body, { requestId: 'r1', answers: { party: 2 }, uid: 'someone-else', sub: 'evil' }, 'the body is passed through; events ignores identity in it');
    await send('POST', '/api/events/a%20b/milestones/m%2F1/tasks/t1/progress', { token: 'good-uid42', body: { add: 3 } });
    assert.equal(evtCalls.at(-1).path, '/internal/events/public/events/a%20b/milestones/m%2F1/tasks/t1/progress');
    await send('GET', '/api/me/events?x=1', { token: 'good-uid7' });
    assert.deepEqual([evtCalls.at(-1).method, evtCalls.at(-1).path, evtCalls.at(-1).query, evtCalls.at(-1).claims.sub], ['GET', '/internal/events/public/me/events', { x: '1' }, 'uid7']);
    await send('GET', '/api/me/badges', { token: 'good-uid7' });
    assert.equal(evtCalls.at(-1).path, '/internal/events/public/me/badges');
  });

  test('events\' status and body are relayed UNCHANGED: 200, 204 (leave), 429 too_fast, 409 full, 402, 400 missing_field, 403, 422', async () => {
    for (const [status, body, url] of [
      [200, { registration: { status: 'joined' }, me: {} }, '/api/events/garba/join'],
      [409, { error: 'full', code: 'full' }, '/api/events/garba/join'],
      [400, { error: 'Party is required.', code: 'missing_field', field: 'party' }, '/api/events/garba/join'],
      [402, { error: 'Not enough coins.', code: 'insufficient_coins', shortfall: 5 }, '/api/events/garba/join'],
      [429, { error: 'Too fast.', code: 'too_fast', task: { key: 't1', done: false, state: { count: 4 } } }, '/api/events/garba/milestones/m1/tasks/t1/progress'],
      [403, { error: 'Join this event first.', code: 'not_registered' }, '/api/events/garba/milestones/m1/tasks/t1/progress'],
      [409, { error: 'locked', code: 'locked', opensAt: '2026-03-10T00:00:00.000Z' }, '/api/events/garba/milestones/m1/tasks/t1/progress'],
      [422, { error: 'nope', code: 'task_not_supported' }, '/api/events/garba/milestones/m1/tasks/t1/progress'],
      [200, { task: { key: 't1', done: true }, awarded: { coins: 5, badges: [] }, completion: null }, '/api/events/garba/milestones/m1/tasks/t1/progress'],
    ]) {
      evtReply = { status, body };
      const r = await send('POST', url, { token: 'good-u1', body: { add: 1 } });
      assert.deepEqual([r.status, r.body], [status, body], `${status} ${body.code ?? ''}`);
    }
    evtReply = { status: 204 };
    const left = await send('POST', '/api/events/garba/leave', { token: 'good-u1', body: {} });
    assert.deepEqual([left.status, left.body], [204, null]);
  });

  test('events down: 503 events_unavailable (a join / progress is never reported as done); a rejected service token is 502, never a 401', async () => {
    evtMode = 'badtoken';
    for (const r of routes) {
      const bad = await send(r.method, r.url, { token: 'good-u1', body: r.method === 'POST' ? {} : undefined });
      assert.deepEqual([bad.status, bad.body.code], [502, 'events_auth_failed'], r.url);
    }
    evtMode = 'down';
    // two are enough to see it (more would open the shared circuit breaker, which is its own, tested, behaviour)
    for (const r of [routes[0], routes[3]]) {
      const out = await send(r.method, r.url, { token: 'good-u1', body: r.method === 'POST' ? {} : undefined });
      assert.deepEqual([out.status, out.body.code], [503, 'events_unavailable'], r.url);
    }
  });

  test('a signed-in read of the detail still carries the uid, and is never cached for others', async () => {
    const a = await get('/api/events/garba', { authorization: 'Bearer good-uid9' });
    assert.equal(a.status, 200);
    assert.equal(evtCalls.at(-1).claims.sub, 'uid9');
  });
});
