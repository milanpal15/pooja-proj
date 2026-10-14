// Phase 6: the mobile BFF serves the devotee call routes, the astrologer's own routes and the public astrologer list from the calls service.
// Stand-ins for the monolith, identity and calls.
// Run: node --test --test-concurrency=1 src/calls.test.mjs   (no database, no Firebase)
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, beforeEach, describe, test } from 'node:test';

import { CALLS_DEVOTEE_ROUTES, CALLS_PUBLIC_GETS, verifyServiceToken } from '@bhakti/common';

import { createApp } from './app.js';
import { loadConfig } from './config.js';

const SECRET = 'test-secret-test-secret-1234';
const logger = { info() {}, warn() {}, error() {} };
const verifyIdToken = async (t) => {
  if (t.startsWith('good-')) return { uid: t.slice(5), phone_number: '+919800000001', firebase: { sign_in_provider: 'phone' } };
  throw new Error('Decoding Firebase ID token failed');
};
const firebase = { ready: () => true, error: () => null, projectId: () => 'p' };

let mono; let idn; let cls; let gw; let base;
let callCalls; let monoSeen; let mode = 'up'; let blocked = false; let clock = 1_000_000; let delayMs = 0;
const claimsOf = (req) => { try { return verifyServiceToken(req.headers.authorization?.replace(/^Bearer /, ''), { secret: SECRET }); } catch { return null; } };

function listen(handler) {
  const s = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => handler(req, res, Buffer.concat(chunks), (code, body, headers = {}) => { res.writeHead(code, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(body)); }));
  });
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r(s)));
}

before(async () => {
  mono = await listen((req, res, raw, json) => {
    if (req.url === '/api/health') return json(200, { ok: true });
    monoSeen.push({ method: req.method, url: req.url });
    json(200, { via: 'monolith', path: req.url.split('?')[0] });
  });
  idn = await listen((req, res, raw, json) => {
    if (req.url === '/health') return json(200, {});
    if (/\/status$/.test(req.url)) return json(200, { exists: true, blocked, name: 'Asha Rao', role: req.url.includes('astro') ? 'astrologer' : 'devotee' });
    json(200, {});
  });
  cls = await listen(async (req, res, raw, json) => {
    if (req.url === '/health') return json(mode === 'down' ? 503 : 200, {});
    const u = new URL(req.url, 'http://x');
    const text = raw.toString('utf8');
    callCalls.push({ method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), claims: claimsOf(req), body: text ? JSON.parse(text) : undefined });
    if (mode === 'down') return req.socket.destroy();
    if (mode === 'broken') return json(500, { error: 'Something went wrong.', code: 'internal' });
    if (mode === 'badtoken') return json(401, { error: 'bad', code: 'bad_signature' });
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    const p = u.pathname.replace('/internal/calls', '');
    const b = text ? JSON.parse(text) : {};
    if (mode === 'wallet') return json(503, { error: 'Coins are temporarily unavailable. Please try again in a moment.', code: 'wallet_unavailable' });
    if (mode === 'rtc') return json(503, { error: 'Calls are not available right now (the mock audio provider is refused in production).', code: 'calls_unavailable' });
    if (p === '/astrologers') return json(200, { astrologers: [{ id: 'a1', name: 'Pt. Sharma', presence: 'online', q: Object.fromEntries(u.searchParams) }] });
    if (/^\/astrologers\/[^/]+$/.test(p)) return p.endsWith('nope') ? json(404, { error: 'Astrologer not found.', code: 'astrologer_not_found' }) : json(200, { astrologer: { id: p.split('/')[2] } });
    if (p === '/calls' && req.method === 'POST') {
      if (b.requestId === 'short') return json(402, { error: 'Not enough coins to start this call.', code: 'insufficient_coins', needed: 30, balance: 20, shortfall: 10 });
      if (b.requestId === 'busy') return json(409, { error: 'This astrologer is not available right now.', code: 'astrologer_unavailable', presence: 'busy' });
      return json(201, { call: { id: 'c1', status: 'requested' } });
    }
    if (/^\/calls\/[^/]+\/accept$/.test(p)) return json(200, { call: { id: p.split('/')[2], status: 'connected' } });
    if (/^\/calls\/[^/]+\/rating$/.test(p)) return json(200, { call: { id: p.split('/')[2], rated: true, rating: b.rating } });
    if (/^\/calls\/[^/]+(\/(cancel|end|decline))?$/.test(p)) return p.includes('ghost') ? json(404, { error: 'Call not found.', code: 'call_not_found' }) : json(200, { call: { id: p.split('/')[2], status: 'x' } });
    if (p === '/astrologer/me') return json(200, { astrologer: { id: 'a1' } });
    if (p === '/astrologer/me/presence') return json(200, { presence: b.online ? 'online' : 'offline' });
    if (p === '/astrologer/me/heartbeat') return json(200, { ok: true });
    if (p === '/astrologer/me/incoming') return json(200, { call: null });
    if (p === '/astrologer/me/calls') return json(200, { calls: [], q: Object.fromEntries(u.searchParams) });
    if (p === '/astrologer/me/earnings') return json(200, { today: { earnedPaise: 0 } });
    if (p === '/directory/astrologers/claim') return json(200, { astrologer: null });
    json(404, { error: 'nope', code: 'not_found' });
  });
  const config = loadConfig({
    MONOLITH_URL: `http://127.0.0.1:${mono.address().port}`,
    IDENTITY_URL: `http://127.0.0.1:${idn.address().port}`,
    CALLS_URL: `http://127.0.0.1:${cls.address().port}`,
    INTERNAL_JWT_SECRET: SECRET,
    SERVICE_TIMEOUT_MS: '400',
    CALLS_TIMEOUT_MS: '3000',
  });
  gw = http.createServer(createApp(config, { logger, verifyIdToken, firebase, now: () => clock }));
  await new Promise((r) => gw.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${gw.address().port}`;
});
after(() => { for (const s of [gw, mono, idn, cls]) s.closeAllConnections?.(); for (const s of [gw, mono, idn, cls]) s.close(); });
beforeEach(() => { callCalls = []; monoSeen = []; mode = 'up'; blocked = false; delayMs = 0; clock += 60_000; });

async function call(method, path, { token, headers = {}, body, raw } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { ...(body !== undefined || raw !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, body: json, text, headers: res.headers };
}

describe('the devotee and astrologer routes (the uid is the signed sub, the name rides as ctx.name; nothing reaches the monolith)', () => {
  test('every route in the table is served here, signed as this BFF for THIS user, with the profile name vouched for', async () => {
    assert.equal(CALLS_DEVOTEE_ROUTES.length, 13);
    for (const r of CALLS_DEVOTEE_ROUTES) {
      callCalls.length = 0;
      const p = `/api${r.sample ?? r.path}`;
      const x = await call(r.method, p, { token: 'good-devotee1', body: r.method === 'GET' ? undefined : { requestId: 'req-xyz-123', online: true, rating: 4 } });
      assert.ok(x.status < 500 && x.status !== 401, `${r.method} ${p} -> ${x.status}`);
      assert.equal(callCalls.length, 1, `${r.method} ${p}`);
      assert.deepEqual([callCalls[0].claims.iss, callCalls[0].claims.sub, callCalls[0].claims.role, callCalls[0].claims.ctx.name], ['mobile-bff', 'devotee1', 'devotee', 'Asha Rao'], `${r.method} ${p}`);
      assert.equal(callCalls[0].path, `/internal/calls${r.sample ?? r.path}`);
    }
    assert.equal(monoSeen.length, 0, 'the monolith was not involved');
  });

  test('a call request: 201 is relayed; the body goes through untouched; business answers pass UNCHANGED (402 + shortfall, 409 + presence, 404)', async () => {
    const made = await call('POST', '/api/calls', { token: 'good-devotee1', body: { astrologerId: 'a1', requestId: 'req-first-1' } });
    assert.deepEqual([made.status, made.body], [201, { call: { id: 'c1', status: 'requested' } }]);
    assert.deepEqual(callCalls[0].body, { astrologerId: 'a1', requestId: 'req-first-1' });
    const short = await call('POST', '/api/calls', { token: 'good-devotee1', body: { requestId: 'short' } });
    assert.deepEqual([short.status, short.body], [402, { error: 'Not enough coins to start this call.', code: 'insufficient_coins', needed: 30, balance: 20, shortfall: 10 }]);
    const busy = await call('POST', '/api/calls', { token: 'good-devotee1', body: { requestId: 'busy' } });
    assert.deepEqual([busy.status, busy.body.code, busy.body.presence], [409, 'astrologer_unavailable', 'busy']);
    assert.deepEqual((await call('GET', '/api/calls/ghost', { token: 'good-devotee1' })).body, { error: 'Call not found.', code: 'call_not_found' });
    assert.equal((await call('POST', '/api/calls/c9/rating', { token: 'good-devotee1', body: { rating: 4 } })).body.call.rating, 4);
    assert.deepEqual((await call('GET', '/api/astrologer/me/calls?before=2026-01-01&limit=5', { token: 'good-devotee1' })).body.q, { before: '2026-01-01', limit: '5' });
  });

  test('a wallet outage or an unusable audio provider inside calls is calls ANSWERING: 503 wallet_unavailable / calls_unavailable relayed with their bodies - 40 of them never open the circuit on the polling reads', async () => {
    mode = 'wallet';
    for (let i = 0; i < 40; i++) {
      const r = await call('POST', '/api/calls', { token: 'good-devotee1', body: { requestId: `req-${i}` } });
      assert.deepEqual([r.status, r.body.code], [503, 'wallet_unavailable']);
    }
    mode = 'rtc';
    const r = await call('POST', '/api/calls/c1/accept', { token: 'good-devotee1', body: {} });
    assert.deepEqual([r.status, r.body.code], [503, 'calls_unavailable']);
    assert.match(r.body.error, /audio provider/);
    mode = 'up';
    assert.equal((await call('GET', '/api/calls/c1', { token: 'good-devotee1' })).status, 200, 'polling is unaffected');
  });

  test('no token -> 401 "missing bearer token"; a bad one -> 401; blocked -> 403 - and calls is never called', async () => {
    assert.deepEqual((await call('GET', '/api/calls/c1')).body, { error: 'missing bearer token' });
    for (const r of CALLS_DEVOTEE_ROUTES) {
      assert.equal((await call(r.method, `/api${r.sample ?? r.path}`, { token: 'junk', body: r.method === 'GET' ? undefined : {} })).status, 401, `${r.method} ${r.path}`);
    }
    blocked = true;
    clock += 3_600_000;
    for (const [m, p] of [['GET', '/api/calls/c1'], ['POST', '/api/calls'], ['GET', '/api/astrologer/me'], ['PUT', '/api/astrologer/me/presence']]) {
      const r = await call(m, p, { token: 'good-devotee1', body: m === 'GET' ? undefined : {} });
      assert.deepEqual([r.status, r.body], [403, { error: 'account blocked' }]);
    }
    assert.equal(callCalls.length, 0);
  });

  test('calls unreachable -> 503 calls_unavailable (a request is never reported as made); a broken calls is the same; our rejected token is a 502, never a 401', async () => {
    mode = 'down';
    for (const [m, p] of [['POST', '/api/calls'], ['GET', '/api/calls/c1'], ['POST', '/api/calls/c1/accept'], ['GET', '/api/astrologer/me/earnings']]) {
      const r = await call(m, p, { token: 'good-devotee1', body: m === 'POST' ? { requestId: 'req-down-1' } : undefined });
      assert.deepEqual([r.status, r.body], [503, { error: 'calls_unavailable', code: 'calls_unavailable' }], `${m} ${p}`);
    }
    mode = 'broken';
    assert.equal((await call('POST', '/api/calls', { token: 'good-devotee1', body: {} })).status, 503);
    mode = 'badtoken';
    const bad = await call('GET', '/api/calls/c1', { token: 'good-devotee1' });
    assert.deepEqual([bad.status, bad.body.code], [502, 'calls_auth_failed']);
    assert.equal(monoSeen.length, 0, 'never fell back to the monolith');
  });

  test('placing and answering a call get the long timeout (calls asks the settings and the wallet inside them); a poll does not', async () => {
    delayMs = 900; // longer than SERVICE_TIMEOUT_MS (400), shorter than CALLS_TIMEOUT_MS (3000)
    assert.equal((await call('POST', '/api/calls', { token: 'good-devotee1', body: { requestId: 'req-slow-1' } })).status, 201);
    assert.equal((await call('POST', '/api/calls/c1/accept', { token: 'good-devotee1', body: {} })).status, 200);
    const read = await call('GET', '/api/calls/c1', { token: 'good-devotee1' });
    assert.deepEqual([read.status, read.body.code], [503, 'calls_unavailable']);
  });
});

describe('GET /api/astrologers (public)', () => {
  test('served from calls with the query string, no token needed; 404 passes through; calls down is a 503 - no stale copy of a presence list', async () => {
    assert.deepEqual(CALLS_PUBLIC_GETS.map((g) => g.path), ['/astrologers', '/astrologers/:id']);
    const r = await call('GET', '/api/astrologers?x=1');
    assert.deepEqual([r.status, r.body.astrologers[0].name, r.body.astrologers[0].q], [200, 'Pt. Sharma', { x: '1' }]);
    assert.equal(callCalls[0].claims.iss, 'mobile-bff');
    assert.equal((await call('GET', '/api/astrologers/a77')).body.astrologer.id, 'a77');
    assert.deepEqual((await call('GET', '/api/astrologers/nope')).body, { error: 'Astrologer not found.', code: 'astrologer_not_found' });
    mode = 'down';
    const d = await call('GET', '/api/astrologers');
    assert.deepEqual([d.status, d.body.code, d.headers.get('x-degraded')], [503, 'calls_unavailable', null]);
    assert.equal(monoSeen.length, 0);
  });

  test('a signed-in devotee sending a bad token to the public list is still served (the list wants no identity)', async () => {
    assert.equal((await call('GET', '/api/astrologers', { token: 'junk' })).status, 200);
  });
});

describe('what stays with the monolith, and the switch', () => {
  test('paths calls does not own still go to the monolith', async () => {
    await call('GET', '/api/horoscope');
    assert.equal(monoSeen.length, 1);
  });

  test('configuration: CALLS_URL needs the secret and (on this BFF) IDENTITY_URL; unset leaves the BFF exactly as before', async () => {
    const env = { MONOLITH_URL: 'http://m', INTERNAL_JWT_SECRET: SECRET, IDENTITY_URL: 'http://i' };
    assert.throws(() => loadConfig({ ...env, INTERNAL_JWT_SECRET: '', CALLS_URL: 'http://c' }), /INTERNAL_JWT_SECRET/);
    assert.throws(() => loadConfig({ MONOLITH_URL: 'http://m', INTERNAL_JWT_SECRET: SECRET, CALLS_URL: 'http://c' }), /IDENTITY_URL/);
    assert.equal(loadConfig({ ...env, CALLS_URL: 'http://c/' }).callsUrl, 'http://c');
    assert.deepEqual([loadConfig(env).callsUrl, loadConfig(env).callsTimeoutMs], ['', 15000]);

    const c = loadConfig({ MONOLITH_URL: `http://127.0.0.1:${mono.address().port}`, INTERNAL_JWT_SECRET: SECRET, IDENTITY_URL: `http://127.0.0.1:${idn.address().port}` });
    const g = http.createServer(createApp(c, { logger, verifyIdToken, firebase }));
    await new Promise((r) => g.listen(0, '127.0.0.1', r));
    const b = `http://127.0.0.1:${g.address().port}`;
    const before = callCalls.length;
    assert.equal((await (await fetch(`${b}/api/astrologers`)).json()).via, 'monolith', 'unset: the monolith serves it');
    assert.equal((await (await fetch(`${b}/api/calls/c1`, { headers: { authorization: 'Bearer good-devotee1' } })).json()).via, 'monolith');
    assert.equal(callCalls.length, before);
    g.closeAllConnections?.();
    g.close();
  });

  test('the sign-in claim and the identity directory are not reachable through this BFF: /directory/... is nobody\'s public path', async () => {
    const r = await call('POST', '/api/directory/astrologers/claim', { token: 'good-devotee1', body: { decoded: { uid: 'x' } } });
    assert.equal(callCalls.length, 0, 'never forwarded to calls');
    assert.equal(r.body.via, 'monolith');
  });

  test('/api/health reports degraded:["calls"] while it is down', async () => {
    mode = 'down';
    const h = await call('GET', '/api/health');
    assert.deepEqual([h.status, h.body.degraded], [200, ['calls']]);
  });
});
