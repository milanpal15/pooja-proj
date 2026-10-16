// Phase 3: the mobile BFF serves the catalog's public surface. Stand-ins for the monolith, identity, engagement and catalog.
// Run: node --test --test-concurrency=1 src/catalog.test.mjs   (no database, no Firebase)
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, beforeEach, describe, test } from 'node:test';

import { CONTENT_KEYS, CONTENT_STALE_MS, FALLBACK_SETTINGS, HOME_STALE_MS, verifyServiceToken } from '@bhakti/common';

import { createApp } from './app.js';
import { loadConfig } from './config.js';

const SECRET = 'test-secret-test-secret-1234';
const MEDIA = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz');
const FILE = '6acf0a7fce86d1f7b8489916.png';
const logger = { info() {}, warn() {}, error() {} };
const verifyIdToken = async (t) => {
  if (t.startsWith('good-')) return { uid: t.slice(5), phone_number: '+919800000001', firebase: { sign_in_provider: 'phone' } };
  throw new Error('Decoding Firebase ID token failed');
};
const firebase = { ready: () => true, error: () => null, projectId: () => 'p' };

let mono; let idn; let eng; let cat; let gw; let base;
let catCalls; let engCalls; let monoSeen; let catMode = 'up'; let engMode = 'up'; let clock = 1_000_000;
let bundle; let blocked = false;
const claimsOf = (req) => { try { return verifyServiceToken(req.headers.authorization?.replace(/^Bearer /, ''), { secret: SECRET }); } catch { return null; } };

function listen(handler) {
  const s = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => handler(req, res, raw, (code, body, headers = {}) => { res.writeHead(code, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(body)); }));
  });
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r(s)));
}

const freshBundle = () => ({
  // deliberately NOT in the order the app expects, and with a stray key: the BFF owns the order
  wallpaperStyles: [{ slug: 'w' }], tones: [{ slug: 't' }], reminders: [{ slug: 'r' }], home: { sections: [] }, hero: [{ slug: 'h' }], faqs: [], knowledge: [], sevas: [],
  festivals: [], aartis: [], temples: [{ slug: 'kashi', name: 'Kashi' }], deities: [{ slug: 'shiva' }], strayKey: 1,
});

before(async () => {
  mono = await listen((req, res, raw, json) => {
    if (req.url === '/api/health') return json(200, { ok: true });
    monoSeen.push({ method: req.method, url: req.url, claims: claimsOf(req) });
    json(200, { via: 'monolith', path: req.url.split('?')[0] });
  });
  idn = await listen((req, res, raw, json) => {
    if (req.url === '/health') return json(200, {});
    if (/\/status$/.test(req.url)) return json(200, { exists: true, blocked, name: 'Asha', role: 'devotee' });
    json(200, {});
  });
  eng = await listen((req, res, raw, json) => {
    if (req.url === '/health') return json(engMode === 'down' ? 503 : 200, {});
    engCalls.push(req.url);
    if (engMode === 'down') return req.socket.destroy();
    if (req.url === '/internal/engagement/settings/map') return json(200, { settings: { prasadDelivery: '120', supportEmail: 'a@b.c' } });
    if (req.url === '/internal/engagement/announcements/current') return json(200, { announcement: { title: 'Diwali', body: 'b', severity: 'festival' } });
    json(404, {});
  });
  cat = await listen((req, res, raw, json) => {
    if (req.url === '/health') return json(catMode === 'down' ? 503 : 200, {});
    const u = new URL(req.url, 'http://x');
    catCalls.push({ method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), claims: claimsOf(req), headers: req.headers, body: raw ? JSON.parse(raw) : undefined });
    if (catMode === 'down') return req.socket.destroy();
    if (catMode === 'badtoken') return json(401, { error: 'bad', code: 'bad_signature' });
    if (u.pathname === '/internal/catalog/public/content') return json(200, bundle);
    if (u.pathname === `/internal/catalog/media/${FILE}`) {
      const base = { 'content-type': 'image/png', 'accept-ranges': 'bytes', etag: `"${FILE.split('.')[0]}"`, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff', 'content-security-policy': 'sandbox' };
      if (req.headers['if-none-match'] === base.etag) { res.writeHead(304, base); return res.end(); }
      const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
      if (m && Number(m[1]) < MEDIA.length) {
        const s = Number(m[1]); const e = m[2] ? Number(m[2]) : MEDIA.length - 1;
        res.writeHead(206, { ...base, 'content-range': `bytes ${s}-${e}/${MEDIA.length}`, 'content-length': e - s + 1 });
        return res.end(MEDIA.subarray(s, e + 1));
      }
      if (req.headers.range) { res.writeHead(416, { ...base, 'content-range': `bytes */${MEDIA.length}` }); return res.end(); }
      res.writeHead(200, { ...base, 'content-length': MEDIA.length });
      return res.end(MEDIA);
    }
    if (u.pathname === '/internal/catalog/public/home') return json(200, { version: 4, schemaVersion: 2, publishedAt: '2026-01-01T00:00:00.000Z', layouts: [{ id: 'default', name: 'Default layout', audience: [], startsAt: null, endsAt: null, blocks: [{ id: 'b1', type: 'spacer', lang: u.searchParams.get('lang') }] }] });
    if (u.pathname === '/internal/catalog/poojas') return json(200, { poojas: [{ slug: 'p1' }], q: u.searchParams.get('q') });
    if (u.pathname === '/internal/catalog/poojas/nope') return json(404, { error: 'Pooja not found.', code: 'not_found' });
    if (u.pathname === '/internal/catalog/poojas/p1') return json(200, { pooja: { slug: 'p1', rating: null } });
    if (u.pathname === '/internal/catalog/live') return json(200, { streams: [] });
    if (u.pathname === '/internal/catalog/live/kashi/jai') return claimsOf(req)?.sub === 'devotee1' ? json(200, { jaiCount: 7 }) : json(409, { error: 'no aarti', code: 'no_aarti' });
    if (u.pathname === '/internal/catalog/horoscope') return json(200, { date: u.searchParams.get('date'), readings: [] });
    json(404, { error: 'nope' });
  });
  const config = loadConfig({
    MONOLITH_URL: `http://127.0.0.1:${mono.address().port}`,
    IDENTITY_URL: `http://127.0.0.1:${idn.address().port}`,
    ENGAGEMENT_URL: `http://127.0.0.1:${eng.address().port}`,
    CATALOG_URL: `http://127.0.0.1:${cat.address().port}`,
    INTERNAL_JWT_SECRET: SECRET,
    SERVICE_TIMEOUT_MS: '1000',
  });
  gw = http.createServer(createApp(config, { logger, verifyIdToken, firebase, now: () => clock }));
  await new Promise((r) => gw.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${gw.address().port}`;
});
after(() => { for (const s of [gw, mono, idn, eng, cat]) s.closeAllConnections?.(); for (const s of [gw, mono, idn, eng, cat]) s.close(); });
beforeEach(() => { catCalls = []; engCalls = []; monoSeen = []; catMode = 'up'; engMode = 'up'; bundle = freshBundle(); blocked = false; clock += 2 * CONTENT_STALE_MS; });

async function call(method, path, { token, headers = {}, body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, body: json, text, headers: res.headers };
}

describe('GET /api/content is assembled here', () => {
  test('the body is byte-identical to the monolith\'s: catalog keys in the monolith\'s order, then settings, then announcement', async () => {
    const r = await call('GET', '/api/content');
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body), [...CONTENT_KEYS, 'settings', 'announcement']);
    assert.deepEqual(Object.keys(r.body), ['deities', 'temples', 'aartis', 'festivals', 'sevas', 'knowledge', 'faqs', 'hero', 'home', 'reminders', 'tones', 'wallpaperStyles', 'settings', 'announcement']);
    assert.equal(r.body.strayKey, undefined, 'only the documented keys are served');
    assert.deepEqual(r.body.settings, { prasadDelivery: '120', supportEmail: 'a@b.c' });
    assert.deepEqual(r.body.announcement, { title: 'Diwali', body: 'b', severity: 'festival' });
    assert.equal(r.text, JSON.stringify({ ...Object.fromEntries(CONTENT_KEYS.map((k) => [k, bundle[k]])), settings: r.body.settings, announcement: r.body.announcement }));
    assert.equal(catCalls[0].claims.iss, 'mobile-bff');
    assert.equal(catCalls[0].path, '/internal/catalog/public/content');
  });

  test('it needs no sign-in, and a bad bearer token on a public route changes nothing', async () => {
    assert.equal((await call('GET', '/api/content')).status, 200);
    assert.equal((await call('GET', '/api/content', { token: 'junk' })).status, 200);
  });

  test('engagement down: the last good settings, else the documented defaults - still 200 (the monolith\'s rule)', async () => {
    // a gateway that has never heard from engagement: the defaults
    const c = loadConfig({ MONOLITH_URL: 'http://127.0.0.1:1', IDENTITY_URL: `http://127.0.0.1:${idn.address().port}`, ENGAGEMENT_URL: `http://127.0.0.1:${eng.address().port}`, CATALOG_URL: `http://127.0.0.1:${cat.address().port}`, INTERNAL_JWT_SECRET: SECRET, SERVICE_TIMEOUT_MS: '1000' });
    const g = http.createServer(createApp(c, { logger, verifyIdToken, firebase }));
    await new Promise((r) => g.listen(0, '127.0.0.1', r));
    engMode = 'down';
    const r = await (await fetch(`http://127.0.0.1:${g.address().port}/api/content`)).json();
    assert.deepEqual(r.settings, { ...FALLBACK_SETTINGS });
    assert.equal(r.announcement, null);
    g.closeAllConnections?.();
    g.close();
    // the long-running gateway keeps what it learned
    assert.equal((await call('GET', '/api/content')).status, 200);
  });

  test('catalog down: the LAST GOOD body with x-degraded: catalog, for up to 60 minutes; then a clean 503', async () => {
    const good = await call('GET', '/api/content');
    assert.equal(good.headers.get('x-degraded'), null);
    catMode = 'down';
    const stale = await call('GET', '/api/content');
    assert.equal(stale.status, 200);
    assert.equal(stale.headers.get('x-degraded'), 'catalog');
    assert.equal(stale.text, good.text, 'exactly what was served before');
    clock += CONTENT_STALE_MS - 1000;
    assert.equal((await call('GET', '/api/content')).headers.get('x-degraded'), 'catalog', 'still inside the hour');
    clock += 2000;
    const gone = await call('GET', '/api/content');
    assert.deepEqual([gone.status, gone.body.code], [503, 'catalog_unavailable']);
  });

  test('catalog down and nothing served before: 503 catalog_unavailable (the app falls back to its bundle)', async () => {
    catMode = 'down';
    const r = await call('GET', '/api/content?fresh=1');
    assert.deepEqual([r.status, r.body.code], [503, 'catalog_unavailable']);
  });

  test('our own bad service token is a degraded 503, never the catalog\'s 401 shown to the app', async () => {
    catMode = 'badtoken';
    const r = await call('GET', '/api/content?other=1');
    assert.equal(r.status, 503);
  });
});

describe('GET /api/home (the server-driven Home layout)', () => {
  test('public, no auth: passes lang (en|hi only) to catalog as mobile-bff and returns the body with ETag + Cache-Control', async () => {
    const r = await call('GET', '/api/home?lang=hi');
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.version, r.body.layouts[0].blocks[0].lang], [4, 'hi']);
    assert.equal(r.headers.get('cache-control'), 'public, max-age=60');
    assert.match(r.headers.get('etag'), /^W\/"[0-9a-f]{20}"$/);
    assert.deepEqual([catCalls.at(-1).path, catCalls.at(-1).query, catCalls.at(-1).claims.iss], ['/internal/catalog/public/home', { lang: 'hi' }, 'mobile-bff']);
    assert.equal((await call('GET', '/api/home?lang=<script>')).body.layouts[0].blocks[0].lang, null);
    assert.deepEqual(catCalls.at(-1).query, {}, 'an unknown lang is dropped, not forwarded');
    assert.equal((await call('GET', '/api/home', { token: 'junk' })).status, 200, 'a bad bearer token on a public route changes nothing');
  });

  test('If-None-Match: 304 with the ETag and no body, also with Cache-Control: no-cache (a reload); a stale tag gets the body', async () => {
    const first = await call('GET', '/api/home?lang=en');
    const etag = first.headers.get('etag');
    for (const inm of [etag, `"x", ${etag}`, '*']) {
      const r = await call('GET', '/api/home?lang=en', { headers: { 'if-none-match': inm } });
      assert.equal(r.status, 304, inm);
      assert.equal(r.text, '');
      assert.equal(r.headers.get('etag'), etag);
    }
    assert.equal((await call('GET', '/api/home?lang=en', { headers: { 'if-none-match': 'W/"stale"' } })).status, 200);
    assert.notEqual((await call('GET', '/api/home?lang=hi')).headers.get('etag'), etag, 'the body differs per language, so does the tag');
  });

  test('catalog down: the last good layout for THAT language, flagged, ETag intact, for up to an hour; else 503 catalog_unavailable', async () => {
    const good = await call('GET', '/api/home?lang=en');
    catMode = 'down';
    const stale = await call('GET', '/api/home?lang=en');
    assert.equal(stale.status, 200);
    assert.equal(stale.headers.get('x-degraded'), 'catalog');
    assert.equal(stale.text, good.text);
    assert.equal(stale.headers.get('etag'), good.headers.get('etag'));
    assert.equal((await call('GET', '/api/home?lang=en', { headers: { 'if-none-match': good.headers.get('etag') } })).status, 304);
    assert.deepEqual([(await call('GET', '/api/home?lang=hi')).status], [503], 'never served for hi before');
    clock += HOME_STALE_MS + 1;
    const gone = await call('GET', '/api/home?lang=en');
    assert.deepEqual([gone.status, gone.body.code], [503, 'catalog_unavailable']);
  });

  test('our own bad service token is a degraded 503, never the catalog 401 shown to the app', async () => {
    catMode = 'badtoken';
    assert.equal((await call('GET', '/api/home?lang=fr')).status, 503);
  });
});

describe('the app\'s read routes', () => {
  test('pass through unchanged: path, query string, body, and 404s from catalog', async () => {
    const r = await call('GET', '/api/poojas?q=rudra');
    assert.deepEqual(r.body, { poojas: [{ slug: 'p1' }], q: 'rudra' });
    assert.deepEqual(catCalls.at(-1).query, { q: 'rudra' });
    assert.equal(catCalls.at(-1).claims.iss, 'mobile-bff');
    assert.deepEqual((await call('GET', '/api/poojas/nope')).body, { error: 'Pooja not found.', code: 'not_found' });
    assert.equal((await call('GET', '/api/poojas/nope')).status, 404);
    assert.equal((await call('GET', '/api/horoscope?date=2026-01-01')).body.date, '2026-01-01');
    assert.equal((await call('GET', '/api/live')).status, 200);
  });

  test('catalog down: the last good answer for THAT request, flagged; a request never made before is a clean 503', async () => {
    const good = await call('GET', '/api/poojas/p1');
    catMode = 'down';
    const stale = await call('GET', '/api/poojas/p1');
    assert.equal(stale.status, 200);
    assert.equal(stale.headers.get('x-degraded'), 'catalog');
    assert.equal(stale.text, good.text);
    const fresh = await call('GET', '/api/poojas?q=never');
    assert.deepEqual([fresh.status, fresh.body.code], [503, 'catalog_unavailable']);
    clock += CONTENT_STALE_MS + 1;
    assert.equal((await call('GET', '/api/poojas/p1')).status, 503, 'older than an hour is not served');
  });

  test('live ("is it on air") goes stale in 2 minutes, not an hour', async () => {
    await call('GET', '/api/live');
    catMode = 'down';
    clock += 60_000;
    assert.equal((await call('GET', '/api/live')).headers.get('x-degraded'), 'catalog');
    clock += 90_000;
    assert.equal((await call('GET', '/api/live')).status, 503);
  });

  test('what catalog does not own is still the monolith\'s: reviews, orders, bookings', async () => {
    const r = await call('GET', '/api/poojas/p1/reviews');
    assert.equal(r.body.via, 'monolith');
    assert.equal(monoSeen.at(-1).url, '/api/poojas/p1/reviews');
    assert.equal(catCalls.length, 0);
    assert.equal((await call('GET', '/api/chadhava/orders', { token: 'good-u1' })).body.via, 'monolith');
  });

  test('this BFF serves no operator route: the dashboard\'s paths fall through to the monolith (which refuses them)', async () => {
    const r = await call('GET', '/api/content/deities');
    assert.equal(r.body.via, 'monolith');
    assert.equal(catCalls.length, 0);
    assert.equal((await call('POST', '/api/content/upload')).body.via, 'monolith');
  });
});

describe('POST /api/live/:slug/jai (needs a devotee; the uid is the signed sub)', () => {
  test('no token -> 401 "missing bearer token"; bad -> 401; blocked -> 403; catalog is not called for any of them', async () => {
    assert.deepEqual((await call('POST', '/api/live/kashi/jai')).body, { error: 'missing bearer token' });
    assert.equal((await call('POST', '/api/live/kashi/jai', { token: 'junk' })).status, 401);
    blocked = true;
    clock += 3_600_000;
    assert.deepEqual((await call('POST', '/api/live/kashi/jai', { token: 'good-devotee1' })).body, { error: 'account blocked' });
    assert.equal(catCalls.length, 0);
  });

  test('a verified devotee: catalog gets their uid as sub, its answer (and its 409) pass through', async () => {
    const r = await call('POST', '/api/live/kashi/jai', { token: 'good-devotee1' });
    assert.deepEqual([r.status, r.body], [200, { jaiCount: 7 }]);
    assert.equal(catCalls.at(-1).claims.sub, 'devotee1');
    assert.equal(catCalls.at(-1).claims.iss, 'mobile-bff');
    const other = await call('POST', '/api/live/kashi/jai', { token: 'good-someone' });
    assert.deepEqual([other.status, other.body.code], [409, 'no_aarti']);
  });

  test('catalog down: 503 catalog_unavailable', async () => {
    catMode = 'down';
    assert.deepEqual((await call('POST', '/api/live/kashi/jai', { token: 'good-devotee1' })).body.code, 'catalog_unavailable');
  });
});

describe('/uploads is streamed from catalog', () => {
  const get = (headers = {}, method = 'GET') => fetch(`${base}/uploads/${FILE}`, { method, headers });

  test('whole file: bytes, type, immutable cache, nosniff, sandbox, ETag - exactly catalog\'s', async () => {
    const r = await get();
    assert.equal(r.status, 200);
    assert.ok(Buffer.from(await r.arrayBuffer()).equals(MEDIA));
    assert.deepEqual(
      ['content-type', 'accept-ranges', 'cache-control', 'x-content-type-options', 'content-security-policy', 'etag'].map((h) => r.headers.get(h)),
      ['image/png', 'bytes', 'public, max-age=31536000, immutable', 'nosniff', 'sandbox', `"${FILE.split('.')[0]}"`],
    );
    assert.equal(catCalls.at(-1).path, `/internal/catalog/media/${FILE}`);
    assert.equal(catCalls.at(-1).claims.iss, 'mobile-bff');
  });

  test('Range 206 (the exact slice and Content-Range), suffix, 416, and 304 on a matching ETag', async () => {
    const r = await get({ range: 'bytes=10-19' });
    assert.equal(r.status, 206);
    assert.equal(r.headers.get('content-range'), `bytes 10-19/${MEDIA.length}`);
    assert.ok(Buffer.from(await r.arrayBuffer()).equals(MEDIA.subarray(10, 20)));
    assert.equal((await get({ range: 'bytes=999-' })).status, 416);
    assert.equal((await get({ 'if-none-match': `"${FILE.split('.')[0]}"` })).status, 304);
  });

  test('the visitor\'s cookie and Authorization never reach catalog; catalog gets this BFF\'s own token', async () => {
    await get({ cookie: 'pooja_admin=secret', authorization: 'Bearer good-u1' });
    const seen = catCalls.at(-1).headers;
    assert.equal(seen.cookie, undefined);
    assert.equal(claimsOf({ headers: { authorization: seen.authorization } }).iss, 'mobile-bff');
  });

  test('catalog down: 503 { error, code: "catalog_unavailable" }', async () => {
    catMode = 'down';
    const r = await get();
    assert.equal(r.status, 503);
    assert.deepEqual(await r.json(), { error: 'catalog_unavailable', code: 'catalog_unavailable' });
  });

  test('nothing but GET /uploads/<file> exists', async () => {
    assert.equal((await fetch(`${base}/uploads/${FILE}/extra`)).status, 404);
    assert.equal((await fetch(`${base}/uploads/`, { method: 'POST' })).status, 404);
  });
});

describe('configuration', () => {
  const env = { MONOLITH_URL: 'http://m', INTERNAL_JWT_SECRET: SECRET };
  test('CATALOG_URL needs the secret, engagement and (on this BFF) identity', () => {
    assert.throws(() => loadConfig({ ...env, CATALOG_URL: 'http://c', INTERNAL_JWT_SECRET: 'short', ENGAGEMENT_URL: 'http://e', IDENTITY_URL: 'http://i' }), /INTERNAL_JWT_SECRET/);
    assert.throws(() => loadConfig({ ...env, CATALOG_URL: 'http://c', IDENTITY_URL: 'http://i' }), /ENGAGEMENT_URL/);
    assert.throws(() => loadConfig({ ...env, CATALOG_URL: 'http://c', ENGAGEMENT_URL: 'http://e' }), /IDENTITY_URL/);
    assert.equal(loadConfig({ ...env, CATALOG_URL: 'http://c/', ENGAGEMENT_URL: 'http://e', IDENTITY_URL: 'http://i' }).catalogUrl, 'http://c');
  });

  test('unset: the BFF is exactly the phase-2 one (no catalog route, no probe)', async () => {
    const c = loadConfig({ MONOLITH_URL: `http://127.0.0.1:${mono.address().port}`, INTERNAL_JWT_SECRET: SECRET });
    const g = http.createServer(createApp(c, { logger }));
    await new Promise((r) => g.listen(0, '127.0.0.1', r));
    const b = `http://127.0.0.1:${g.address().port}`;
    for (const p of ['/api/content', '/api/poojas', '/uploads/x.png']) assert.equal((await (await fetch(b + p)).json()).via ?? 'monolith', 'monolith', p);
    assert.equal(c.catalogUrl, '');
    g.closeAllConnections?.();
    g.close();
  });
});
