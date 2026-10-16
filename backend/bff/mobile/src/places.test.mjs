// GET /api/places/temples on the mobile BFF (docs/TEMPLE_MAP.md). Stand-ins for the monolith, identity, engagement and catalog.
// Run: node --test --test-concurrency=1 src/places.test.mjs   (no database, no network beyond localhost)
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { after, before, beforeEach, describe, test } from 'node:test';

import { CATALOG_MOBILE_PLACES, createCatalogMount, verifyServiceToken } from '@bhakti/common';

import { createApp } from './app.js';
import { loadConfig } from './config.js';

const SECRET = 'test-secret-test-secret-1234';
const logger = { info() {}, warn() {}, error() {} };
const firebase = { ready: () => true, error: () => null, projectId: () => 'p' };
const verifyIdToken = async () => { throw new Error('no'); };
const claimsOf = (req) => { try { return verifyServiceToken(req.headers.authorization?.replace(/^Bearer /, ''), { secret: SECRET }); } catch { return null; } };

const BODY = { temples: [{ id: 'osm:node/1', name: 'Shri Ram Mandir', nameHi: null, lat: 19, lng: 72.8, address: null, deity: null, distanceM: 10 }], center: { lat: 19, lng: 72.8, radius: 8000 }, attribution: '© OpenStreetMap contributors', source: 'openstreetmap', cachedAt: null, stale: false };

let stubSrv; let cat; let gw; let base; let seen; let mode = 'up'; let clock = 1_000_000;
const listen = (handler) => new Promise((r) => {
  const s = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => handler(req, res, (code, body, headers = {}) => { res.writeHead(code, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(body)); }));
  });
  s.listen(0, '127.0.0.1', () => r(s));
});

before(async () => {
  const stub = await listen((_q, _r, json) => json(200, { ok: true }));
  cat = await listen((req, res, json) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/health') return json(200, {});
    seen.push({ path: u.pathname, query: Object.fromEntries(u.searchParams), claims: claimsOf(req) });
    if (mode === 'down') return req.socket.destroy();
    if (mode === 'unavailable') return json(503, { error: 'Nearby temples are unavailable right now.', code: 'places_unavailable' });
    if (mode === 'too_fast') return json(429, { error: 'slow down', code: 'too_fast', retryAfterSec: 17 });
    if (u.pathname === '/internal/catalog/places/temples') return u.searchParams.get('lat') === 'bad' ? json(400, { error: 'lat must be a number.', code: 'bad_params' }) : json(200, BODY);
    json(404, { error: 'nope' });
  });
  const config = loadConfig({
    MONOLITH_URL: `http://127.0.0.1:${stub.address().port}`, IDENTITY_URL: `http://127.0.0.1:${stub.address().port}`, ENGAGEMENT_URL: `http://127.0.0.1:${stub.address().port}`,
    CATALOG_URL: `http://127.0.0.1:${cat.address().port}`, INTERNAL_JWT_SECRET: SECRET, SERVICE_TIMEOUT_MS: '1000',
  });
  gw = http.createServer(createApp(config, { logger, verifyIdToken, firebase, now: () => clock }));
  await new Promise((r) => gw.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${gw.address().port}`;
  stubSrv = stub;
});
after(() => { for (const s of [gw, cat, stubSrv]) s.closeAllConnections?.(); for (const s of [gw, cat, stubSrv]) s.close(); });
beforeEach(() => { seen = []; mode = 'up'; clock += 2 * CATALOG_MOBILE_PLACES.maxStaleMs; });

const get = async (path, headers = {}) => {
  const res = await fetch(`${base}${path}`, { headers });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* */ }
  return { status: res.status, body, headers: res.headers };
};

describe('GET /api/places/temples', () => {
  test('public (no auth, a junk bearer is ignored): forwards the query to catalog as mobile-bff and returns its body unchanged', async () => {
    const r = await get('/api/places/temples?lat=19.0176&lng=72.8561&radius=5000&junk=1', { authorization: 'Bearer junk' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, BODY);
    assert.equal(seen[0].path, '/internal/catalog/places/temples');
    assert.equal(seen[0].claims.iss, 'mobile-bff');
    assert.equal(seen[0].claims.sub, null);
    assert.deepEqual(seen[0].query, { lat: '19.0176', lng: '72.8561', radius: '5000', junk: '1' });
    assert.ok(seen[0].claims.ctx.ip, 'the phone\'s address rides in the signed token for the per-client limit');
  });

  test('400 bad_params and 429 too_fast (with Retry-After) are catalog\'s answers and pass through; the 429 is not retried', async () => {
    const bad = await get('/api/places/temples?lat=bad&lng=1');
    assert.deepEqual([bad.status, bad.body.code], [400, 'bad_params']);
    mode = 'too_fast';
    seen = [];
    const slow = await get('/api/places/temples?lat=1&lng=1');
    assert.deepEqual([slow.status, slow.body.code, slow.headers.get('retry-after')], [429, 'too_fast', '17']);
    assert.equal(seen.length, 1);
  });

  test('catalog\'s own 503 places_unavailable is relayed as is, once (no retry, no stale invention)', async () => {
    mode = 'unavailable';
    const r = await get('/api/places/temples?lat=2&lng=2');
    assert.deepEqual([r.status, r.body.code], [503, 'places_unavailable']);
    assert.equal(seen.length, 1);
  });

  test('catalog down: the LAST GOOD body with x-degraded: catalog for an hour; then (and when nothing was served) 503 catalog_unavailable', async () => {
    const q = '/api/places/temples?lat=3&lng=3';
    assert.equal((await get(q)).headers.get('x-degraded'), null);
    mode = 'down';
    const stale = await get(q);
    assert.equal(stale.status, 200);
    assert.equal(stale.headers.get('x-degraded'), 'catalog');
    assert.deepEqual(stale.body, BODY);
    clock += CATALOG_MOBILE_PLACES.maxStaleMs + 1000;
    const gone = await get(q);
    assert.deepEqual([gone.status, gone.body.code], [503, 'catalog_unavailable']);
    assert.equal((await get('/api/places/temples?lat=4&lng=4')).status, 503);
  });
});

describe('the admin BFF does not expose it', () => {
  test('createCatalogMount for admin-bff has no /api/places/temples route', async () => {
    const mount = createCatalogMount('admin-bff', { catalogUrl: 'http://127.0.0.1:1', engagementUrl: 'http://127.0.0.1:1', internalJwtSecret: SECRET, monolithUrl: 'http://127.0.0.1:1', serviceTimeoutMs: 500 }, { logger, operator: false });
    const app = express();
    mount.mount(app);
    const s = http.createServer(app);
    await new Promise((r) => s.listen(0, '127.0.0.1', r));
    const res = await fetch(`http://127.0.0.1:${s.address().port}/api/places/temples?lat=1&lng=1`);
    await new Promise((r) => s.close(r));
    assert.equal(res.status, 404);
    // and the shared public table (both BFFs) does not list it
    const { CATALOG_PUBLIC_GETS } = await import('@bhakti/common');
    assert.ok(!CATALOG_PUBLIC_GETS.some((g) => g.path.startsWith('/places')));
  });
});
