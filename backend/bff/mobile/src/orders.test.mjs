// Phase 5: the mobile BFF serves the devotee booking / chadhava-order routes, the retired POST /api/chadhava (410) and the public review list from
// the orders service. Stand-ins for the monolith, identity and orders.
// Run: node --test --test-concurrency=1 src/orders.test.mjs   (no database, no Firebase)
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, beforeEach, describe, test } from 'node:test';

import { ORDERS_DEVOTEE_ROUTES, ORDERS_PUBLIC_GETS, verifyServiceToken } from '@bhakti/common';

import { createApp } from './app.js';
import { loadConfig } from './config.js';

const SECRET = 'test-secret-test-secret-1234';
const logger = { info() {}, warn() {}, error() {} };
const verifyIdToken = async (t) => {
  if (t.startsWith('good-')) return { uid: t.slice(5), phone_number: '+919800000001', firebase: { sign_in_provider: 'phone' } };
  throw new Error('Decoding Firebase ID token failed');
};
const firebase = { ready: () => true, error: () => null, projectId: () => 'p' };

let mono; let idn; let ord; let gw; let base;
let ordCalls; let monoSeen; let ordMode = 'up'; let blocked = false; let clock = 1_000_000; let delayMs = 0;
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
    if (/\/status$/.test(req.url)) return json(200, { exists: true, blocked, name: 'Asha Rao', role: 'devotee' });
    json(200, {});
  });
  ord = await listen(async (req, res, raw, json) => {
    if (req.url === '/health') return json(ordMode === 'down' ? 503 : 200, {});
    const u = new URL(req.url, 'http://x');
    const text = raw.toString('utf8');
    ordCalls.push({ method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), claims: claimsOf(req), body: text ? JSON.parse(text) : undefined });
    if (ordMode === 'down') return req.socket.destroy();
    if (ordMode === 'broken') return json(500, { error: 'Something went wrong.', code: 'internal' });
    if (ordMode === 'badtoken') return json(401, { error: 'bad', code: 'bad_signature' });
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    const p = u.pathname.replace('/internal/orders', '');
    const b = text ? JSON.parse(text) : {};
    if (ordMode === 'wallet') return json(503, { error: 'Coins are temporarily unavailable. Please try again in a moment.', code: 'wallet_unavailable' });
    if (ordMode === 'catalog') return json(503, { error: 'This is temporarily unavailable. Please try again in a moment.', code: 'catalog_unavailable' });
    if (p === '/chadhava' && req.method === 'POST') return json(410, { error: 'This chadhava is no longer offered. Please update the app.', code: 'gone' });
    if (p === '/bookings' && req.method === 'POST') {
      if (b.requestId === 'short') return json(402, { error: 'Not enough coins.', code: 'insufficient_coins', needed: 1251, balance: 100, shortfall: 1151, type: 'booking_debit' });
      return json(b.requestId === 'again-again' ? 200 : 201, { booking: { id: 'b1', bookingRef: 'BKT-AAAAA', requestId: b.requestId }, balance: 650 });
    }
    if (p === '/bookings' && req.method === 'GET') return json(200, { bookings: [{ id: 'b1' }], q: Object.fromEntries(u.searchParams) });
    if (/^\/bookings\/[^/]+\/review$/.test(p)) return json(201, { booking: { id: p.split('/')[2], review: { rating: b.rating } } });
    if (/^\/bookings\/[^/]+\/cancel$/.test(p)) return json(200, { booking: { id: p.split('/')[2], status: 'cancelled' }, balance: 2000 });
    if (/^\/bookings\/[^/]+$/.test(p)) return p.endsWith('/nope') ? json(404, { error: 'Booking not found.', code: 'not_found' }) : json(200, { booking: { id: p.split('/')[2] } });
    if (p === '/chadhava/orders' && req.method === 'POST') return json(201, { order: { id: 'o1' }, balance: 57 });
    if (p === '/chadhava/orders') return json(200, { orders: [] });
    if (/^\/chadhava\/orders\/[^/]+\/cancel$/.test(p)) return json(409, { error: 'This order can no longer be cancelled.', code: 'cannot_cancel' });
    if (/^\/poojas\/[^/]+\/reviews$/.test(p)) return p.includes('ghost') ? json(404, { error: 'Pooja not found.', code: 'not_found' }) : json(200, { reviews: [{ id: 'r1', name: 'Meera', q: Object.fromEntries(u.searchParams) }] });
    json(404, { error: 'nope', code: 'not_found' });
  });
  const config = loadConfig({
    MONOLITH_URL: `http://127.0.0.1:${mono.address().port}`,
    IDENTITY_URL: `http://127.0.0.1:${idn.address().port}`,
    ORDERS_URL: `http://127.0.0.1:${ord.address().port}`,
    INTERNAL_JWT_SECRET: SECRET,
    SERVICE_TIMEOUT_MS: '400',
    ORDERS_TIMEOUT_MS: '3000',
  });
  gw = http.createServer(createApp(config, { logger, verifyIdToken, firebase, now: () => clock }));
  await new Promise((r) => gw.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${gw.address().port}`;
});
after(() => { for (const s of [gw, mono, idn, ord]) s.closeAllConnections?.(); for (const s of [gw, mono, idn, ord]) s.close(); });
beforeEach(() => { ordCalls = []; monoSeen = []; ordMode = 'up'; blocked = false; delayMs = 0; clock += 60_000; });

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

describe('the devotee routes (the uid is the signed sub, the name rides as ctx.name; nothing reaches the monolith)', () => {
  test('every route in the table is served here, signed as this BFF for THIS devotee, with the profile name vouched for', async () => {
    for (const r of ORDERS_DEVOTEE_ROUTES) {
      ordCalls.length = 0;
      const p = `/api${r.sample ?? r.path}`;
      const x = await call(r.method, p, { token: 'good-devotee1', body: r.method === 'GET' ? undefined : { requestId: 'req-xyz-123' } });
      assert.ok(x.status < 500 && x.status !== 401, `${r.method} ${p} -> ${x.status}`);
      assert.equal(ordCalls.length, 1, `${r.method} ${p}`);
      assert.deepEqual([ordCalls[0].claims.iss, ordCalls[0].claims.sub, ordCalls[0].claims.role, ordCalls[0].claims.ctx.name], ['mobile-bff', 'devotee1', 'devotee', 'Asha Rao'], `${r.method} ${p}`);
      assert.equal(ordCalls[0].path, `/internal/orders${r.sample ?? r.path}`);
    }
    assert.equal(monoSeen.length, 0, 'the monolith was not involved');
  });

  test('a booking: 201 when created and 200 when a retry found it are RELAYED; the body goes through untouched; the balance comes back', async () => {
    const made = await call('POST', '/api/bookings', { token: 'good-devotee1', body: { poojaSlug: 'navratri', packageKey: 'family', names: [{ name: 'A' }], requestId: 'req-first-1', price: 1 } });
    assert.deepEqual([made.status, made.body.balance, made.body.booking.id], [201, 650, 'b1']);
    assert.deepEqual(ordCalls[0].body, { poojaSlug: 'navratri', packageKey: 'family', names: [{ name: 'A' }], requestId: 'req-first-1', price: 1 });
    const again = await call('POST', '/api/bookings', { token: 'good-devotee1', body: { requestId: 'again-again' } });
    assert.equal(again.status, 200);
    assert.deepEqual((await call('POST', '/api/bookings/b9/review', { token: 'good-devotee1', body: { rating: 5 } })).status, 201);
    assert.equal((await call('POST', '/api/bookings/b9/cancel', { token: 'good-devotee1', body: {} })).body.booking.status, 'cancelled');
    assert.equal((await call('POST', '/api/chadhava/orders', { token: 'good-devotee1', body: { requestId: 'req-c-1' } })).status, 201);
    assert.deepEqual((await call('GET', '/api/bookings?x=1', { token: 'good-devotee1' })).body.q, { x: '1' });
  });

  test('orders\' business answers pass through UNCHANGED: 402 insufficient_coins with its shortfall, 404, 409', async () => {
    const r = await call('POST', '/api/bookings', { token: 'good-devotee1', body: { requestId: 'short' } });
    assert.deepEqual([r.status, r.body], [402, { error: 'Not enough coins.', code: 'insufficient_coins', needed: 1251, balance: 100, shortfall: 1151, type: 'booking_debit' }]);
    assert.deepEqual((await call('GET', '/api/bookings/nope', { token: 'good-devotee1' })).body, { error: 'Booking not found.', code: 'not_found' });
    const c = await call('POST', '/api/chadhava/orders/o1/cancel', { token: 'good-devotee1', body: {} });
    assert.deepEqual([c.status, c.body.code], [409, 'cannot_cancel']);
  });

  test('a wallet / catalog outage inside orders is orders ANSWERING: 503 wallet_unavailable / catalog_unavailable relayed with their bodies - and 40 of them never open the circuit on the reads', async () => {
    ordMode = 'wallet';
    for (let i = 0; i < 40; i++) {
      const r = await call('POST', '/api/bookings', { token: 'good-devotee1', body: { requestId: `req-${i}` } });
      assert.deepEqual([r.status, r.body.code], [503, 'wallet_unavailable']);
    }
    ordMode = 'catalog';
    assert.deepEqual((await call('POST', '/api/chadhava/orders', { token: 'good-devotee1', body: {} })).body.code, 'catalog_unavailable');
    ordMode = 'up';
    assert.equal((await call('GET', '/api/bookings', { token: 'good-devotee1' })).status, 200, 'reads are unaffected');
  });

  test('no token -> 401 "missing bearer token"; a bad one -> 401; blocked -> 403 - and orders is never called', async () => {
    assert.deepEqual((await call('GET', '/api/bookings')).body, { error: 'missing bearer token' });
    for (const r of ORDERS_DEVOTEE_ROUTES) {
      assert.equal((await call(r.method, `/api${r.sample ?? r.path}`, { token: 'junk', body: r.method === 'GET' ? undefined : {} })).status, 401, `${r.method} ${r.path}`);
    }
    blocked = true;
    clock += 3_600_000;
    for (const [m, p] of [['GET', '/api/bookings'], ['POST', '/api/bookings'], ['POST', '/api/chadhava/orders']]) {
      const r = await call(m, p, { token: 'good-devotee1', body: m === 'POST' ? {} : undefined });
      assert.deepEqual([r.status, r.body], [403, { error: 'account blocked' }]);
    }
    assert.equal(ordCalls.length, 0);
  });

  test('orders unreachable -> 503 orders_unavailable (a purchase is never reported as made); a broken orders is the same; our rejected token is a 502, never a 401', async () => {
    ordMode = 'down';
    for (const [m, p] of [['POST', '/api/bookings'], ['GET', '/api/bookings'], ['POST', '/api/chadhava/orders']]) {
      const r = await call(m, p, { token: 'good-devotee1', body: m === 'POST' ? { requestId: 'req-down-1' } : undefined });
      assert.deepEqual([r.status, r.body], [503, { error: 'orders_unavailable', code: 'orders_unavailable' }], `${m} ${p}`);
    }
    ordMode = 'broken';
    assert.equal((await call('POST', '/api/bookings', { token: 'good-devotee1', body: {} })).status, 503);
    ordMode = 'badtoken';
    const bad = await call('GET', '/api/bookings', { token: 'good-devotee1' });
    assert.deepEqual([bad.status, bad.body.code], [502, 'orders_auth_failed']);
    assert.equal(monoSeen.length, 0, 'never fell back to the monolith');
  });

  test('a PURCHASE gets the long timeout (orders calls catalog and the wallet inside it); a read does not', async () => {
    delayMs = 900; // longer than SERVICE_TIMEOUT_MS (400), shorter than ORDERS_TIMEOUT_MS (3000)
    const slow = await call('POST', '/api/bookings', { token: 'good-devotee1', body: { requestId: 'req-slow-1' } });
    assert.equal(slow.status, 201);
    assert.equal((await call('POST', '/api/chadhava/orders/o1/cancel', { token: 'good-devotee1', body: {} })).status, 409, 'a cancel waits too');
    const read = await call('GET', '/api/bookings', { token: 'good-devotee1' });
    assert.deepEqual([read.status, read.body.code], [503, 'orders_unavailable']);
  });
});

describe('POST /api/chadhava (the retired free-amount chadhava)', () => {
  test('answers 410 from orders, with no token at all', async () => {
    const r = await call('POST', '/api/chadhava', { body: { templeSlug: 'x', amount: 21 } });
    assert.deepEqual([r.status, r.body], [410, { error: 'This chadhava is no longer offered. Please update the app.', code: 'gone' }]);
    assert.equal(ordCalls[0].path, '/internal/orders/chadhava');
    assert.equal(monoSeen.length, 0);
  });
});

describe('GET /api/poojas/:slug/reviews (public)', () => {
  test('served from orders with the query string, no token needed; 404 passes through; orders down serves the last good body flagged, then 503 once it is too old', async () => {
    assert.deepEqual(ORDERS_PUBLIC_GETS.map((g) => g.path), ['/poojas/:slug/reviews']);
    const r = await call('GET', '/api/poojas/navratri/reviews?limit=2&before=2026-01-01');
    assert.deepEqual([r.status, r.body.reviews[0].q], [200, { limit: '2', before: '2026-01-01' }]);
    assert.equal(ordCalls[0].claims.iss, 'mobile-bff');
    assert.equal((await call('GET', '/api/poojas/ghost/reviews')).status, 404);
    ordMode = 'down';
    const stale = await call('GET', '/api/poojas/navratri/reviews?limit=2&before=2026-01-01');
    assert.deepEqual([stale.status, stale.headers.get('x-degraded'), stale.body.reviews[0].id], [200, 'orders', 'r1']);
    assert.equal((await call('GET', '/api/poojas/other/reviews')).status, 503, 'never answered before: nothing to serve');
    clock += 2 * 3_600_000;
    assert.deepEqual([(await call('GET', '/api/poojas/navratri/reviews?limit=2&before=2026-01-01')).status], [503], 'older than an hour');
    assert.equal(monoSeen.length, 0);
  });
});

describe('what stays with the monolith, and the switch', () => {
  test('paths orders does not own still go to the monolith', async () => {
    await call('GET', '/api/horoscope');
    assert.equal(monoSeen.length, 1);
  });

  test('configuration: ORDERS_URL needs the secret and (on this BFF) IDENTITY_URL; unset leaves the BFF exactly as before', async () => {
    const env = { MONOLITH_URL: 'http://m', INTERNAL_JWT_SECRET: SECRET, IDENTITY_URL: 'http://i' };
    assert.throws(() => loadConfig({ ...env, INTERNAL_JWT_SECRET: '', ORDERS_URL: 'http://o' }), /INTERNAL_JWT_SECRET/);
    assert.throws(() => loadConfig({ MONOLITH_URL: 'http://m', INTERNAL_JWT_SECRET: SECRET, ORDERS_URL: 'http://o' }), /IDENTITY_URL/);
    assert.equal(loadConfig({ ...env, ORDERS_URL: 'http://o/' }).ordersUrl, 'http://o');
    assert.deepEqual([loadConfig(env).ordersUrl, loadConfig(env).ordersTimeoutMs], ['', 15000]);

    const c = loadConfig({ MONOLITH_URL: `http://127.0.0.1:${mono.address().port}`, INTERNAL_JWT_SECRET: SECRET, IDENTITY_URL: `http://127.0.0.1:${idn.address().port}` });
    const g = http.createServer(createApp(c, { logger, verifyIdToken, firebase }));
    await new Promise((r) => g.listen(0, '127.0.0.1', r));
    const b = `http://127.0.0.1:${g.address().port}`;
    const before = ordCalls.length;
    assert.equal((await (await fetch(`${b}/api/poojas/x/reviews`)).json()).via, 'monolith', 'unset: the monolith serves it');
    assert.equal((await fetch(`${b}/api/chadhava`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 200);
    assert.equal(ordCalls.length, before);
    g.closeAllConnections?.();
    g.close();
  });

  test('/api/health reports degraded:["orders"] while it is down', async () => {
    ordMode = 'down';
    const h = await call('GET', '/api/health');
    assert.deepEqual([h.status, h.body.degraded], [200, ['orders']]);
  });
});
