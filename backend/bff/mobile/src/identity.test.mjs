// Phase 2: the mobile BFF is the device auth edge. Stand-ins for the monolith and identity; the Firebase verifier is injected.
// Run: node --test --test-concurrency=1 src/identity.test.mjs   (no database, no Firebase)
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, beforeEach, describe, test } from 'node:test';

import { STATUS_TTL_MS, verifyServiceToken } from '@bhakti/common';

import { createApp } from './app.js';
import { loadConfig } from './config.js';

const SECRET = 'test-secret-test-secret-1234';
let errors;
const logger = { info() {}, warn() {}, error: (m) => errors.push(m) };

/** The fake verifier: 'good-<uid>' verifies; 'aud' fails with the project-mismatch message; anything else is invalid. */
const verifyIdToken = async (t) => {
  if (t.startsWith('good-')) {
    const uid = t.slice(5);
    return { uid, phone_number: '+919800000001', firebase: { sign_in_provider: 'phone' }, ...(uid === 'g' ? { email: 'g@example.com', email_verified: true, name: 'Gita', picture: 'http://p', firebase: { sign_in_provider: 'google.com' } } : {}) };
  }
  if (t === 'aud') throw new Error('Firebase ID token has incorrect "aud" (audience) claim. Expected "proj-a" but got "proj-b".');
  throw new Error('Decoding Firebase ID token failed');
};
let firebaseReady = true;
const firebase = { ready: () => firebaseReady, error: () => 'test', projectId: () => 'proj-a' };

let mono; let idn; let gw; let base;
let monoSeen; let idnCalls; let statusAnswer; let idnMode = 'ok'; let clock = 1_000_000;
const claimsOf = (req) => { try { return verifyServiceToken(req.headers.authorization?.replace(/^Bearer /, ''), { secret: SECRET }); } catch { return null; } };

function listen(handler) {
  const s = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => handler(req, res, raw ? JSON.parse(raw) : undefined, (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); }));
  });
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r(s)));
}

const mkConfig = (extra = {}) => loadConfig({
  MONOLITH_URL: `http://127.0.0.1:${mono.address().port}`,
  IDENTITY_URL: `http://127.0.0.1:${idn.address().port}`,
  INTERNAL_JWT_SECRET: SECRET,
  SERVICE_TIMEOUT_MS: '1000',
  ...extra,
});
async function gateway(extra = {}, deps = {}) {
  const g = http.createServer(createApp(mkConfig(extra), { logger, verifyIdToken, firebase, now: () => clock, ...deps }));
  await new Promise((r) => g.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${g.address().port}`, close: () => { g.closeAllConnections?.(); g.close(); } };
}

before(async () => {
  mono = await listen((req, res, body, json) => {
    if (req.url === '/api/health') return json(200, { ok: true });
    monoSeen.push({ method: req.method, url: req.url, headers: req.headers, claims: claimsOf(req), body });
    json(200, { via: 'monolith' });
  });
  idn = await listen((req, res, body, json) => {
    if (req.url === '/health') return json(idnMode === 'down' ? 503 : 200, {});
    if (idnMode === 'down') return req.socket.destroy();
    const u = new URL(req.url, 'http://x');
    idnCalls.push({ method: req.method, path: u.pathname, claims: claimsOf(req), body });
    if (!claimsOf(req)) return json(401, { error: 'bad', code: 'bad_signature' });
    const m = /^\/internal\/identity\/users\/([^/]+)\/status$/.exec(u.pathname);
    if (idnMode === 'badtoken' && !m) return json(401, { error: 'bad', code: 'bad_signature' });
    if (m) return json(200, statusAnswer(m[1]));
    if (u.pathname === '/internal/identity/push/register') {
      const t = body?.token;
      if (typeof t !== 'string' || !t.trim() || t.length > 4096) return json(400, { error: 'A push token is required.', code: 'bad_token' });
      return req.method === 'POST' ? json(201, { ok: true }) : json(200, { ok: true });
    }
    if (u.pathname === '/internal/identity/auth/me') return json(404, { error: 'profile not found — call /auth/sync first' });
    if (u.pathname === '/internal/identity/policy/terms') return json(200, { key: 'terms', version: 2 });
    json(200, { identity: true, method: req.method, path: u.pathname, body });
  });
  const g = await gateway();
  gw = g;
  base = g.base;
});
after(() => { gw.close(); for (const s of [mono, idn]) { s.closeAllConnections?.(); s.close(); } });
beforeEach(() => {
  monoSeen = []; idnCalls = []; errors = []; idnMode = 'ok'; firebaseReady = true;
  clock += 3_600_000; // past every cache
  statusAnswer = (uid) => ({ exists: true, blocked: uid === 'blocked', name: `Name of ${uid}`, role: uid === 'astro' ? 'astrologer' : 'devotee' });
});

async function call(method, path, { token, headers = {}, body, at = base } = {}) {
  const res = await fetch(`${at}${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, body: json, text };
}

describe('requireAuth semantics, now at the edge (same statuses and bodies as pooja-api/src/middleware/require-auth.js)', () => {
  const routes = [['GET', '/api/auth/me'], ['POST', '/api/auth/sync'], ['PUT', '/api/auth/me'], ['GET', '/api/auth/saved-temples'], ['PUT', '/api/auth/saved-temples'], ['POST', '/api/policy/terms/accept'],
    ['POST', '/api/push/register'], ['DELETE', '/api/push/register']];

  test('no token -> 401 "missing bearer token" on every BFF-served authenticated route; identity is never called', async () => {
    for (const [m, p] of routes) {
      const r = await call(m, p, { body: m === 'GET' ? undefined : {} });
      assert.equal(r.status, 401, p);
      assert.deepEqual(r.body, { error: 'missing bearer token' });
    }
    assert.equal((await call('GET', '/api/auth/me', { headers: { authorization: 'Basic abc' } })).status, 401);
    assert.equal(idnCalls.length, 0);
  });

  test('an invalid token -> 401 "invalid token" + detail; a project mismatch is logged for the operator, not explained to the client', async () => {
    const r = await call('GET', '/api/auth/me', { token: 'junk' });
    assert.equal(r.status, 401);
    assert.deepEqual([r.body.error, r.body.detail], ['invalid token', 'Decoding Firebase ID token failed']);
    const mismatch = await call('GET', '/api/auth/me', { token: 'aud' });
    assert.equal(mismatch.status, 401);
    assert.ok(errors.some((e) => /PROJECT MISMATCH/.test(e) && /proj-a/.test(e)), 'the log names the server\'s project');
    assert.equal(idnCalls.length, 0);
  });

  test('no Firebase configured but a token presented -> 503 "auth unavailable", never trusted; no token is still 401', async () => {
    firebaseReady = false;
    const r = await call('GET', '/api/auth/me', { token: 'good-u1' });
    assert.equal(r.status, 503);
    assert.equal(r.body.error, 'auth unavailable');
    assert.equal((await call('GET', '/api/auth/me')).status, 401);
  });

  test('a blocked devotee -> 403 "account blocked" (on served routes AND signed through to the monolith)', async () => {
    const r = await call('GET', '/api/auth/me', { token: 'good-blocked' });
    assert.deepEqual([r.status, r.body], [403, { error: 'account blocked' }]);
    await call('GET', '/api/bookings', { token: 'good-blocked' });
    assert.equal(monoSeen[0].claims.ctx.authError, 'blocked');
    assert.equal(monoSeen[0].claims.sub, null);
  });

  test('identity down -> FAIL CLOSED: a clear 503, not a 500 and not "allowed"; recovery is immediate', async () => {
    idnMode = 'down';
    const g = await gateway();
    const r = await call('GET', '/api/auth/me', { token: 'good-u1', at: g.base });
    assert.equal(r.status, 503);
    assert.deepEqual([r.body.error, r.body.detail], ['auth unavailable', 'identity is unavailable']);
    await call('GET', '/api/bookings', { token: 'good-u1', at: g.base });
    assert.equal(monoSeen[0].claims.ctx.authError, 'unavailable', 'the monolith is told, and answers its own 503');
    assert.equal(errors.length, 0);
    g.close();
  });
});

describe('the blocked check', () => {
  test('asked of identity once per uid per 10 s, with the BFF\'s signed token; concurrent requests share one call', async () => {
    await Promise.all([1, 2, 3, 4].map(() => call('GET', '/api/auth/me', { token: 'good-u9' })));
    assert.equal(idnCalls.filter((c) => c.path.endsWith('/users/u9/status')).length, 1);
    const c = idnCalls[0].claims;
    assert.deepEqual([c.iss, c.sub], ['mobile-bff', null]);
    await call('GET', '/api/auth/me', { token: 'good-u9' });
    assert.equal(idnCalls.filter((x) => x.path.endsWith('/users/u9/status')).length, 1, 'cached');
    clock += STATUS_TTL_MS + 1;
    await call('GET', '/api/auth/me', { token: 'good-u9' });
    assert.equal(idnCalls.filter((x) => x.path.endsWith('/users/u9/status')).length, 2, 'asked again after the TTL');
  });

  test('a block made in the dashboard bites within the TTL; unblocking too; an outage is NOT papered over with the stale "fine"', async () => {
    const g = await gateway();
    assert.equal((await call('GET', '/api/auth/me', { token: 'good-flip', at: g.base })).status, 404, 'identity answered (no profile yet)');
    const was = statusAnswer;
    statusAnswer = (uid) => ({ ...was(uid), blocked: true });
    assert.equal((await call('GET', '/api/auth/me', { token: 'good-flip', at: g.base })).status, 404, 'still within the cache window');
    clock += STATUS_TTL_MS + 1;
    assert.equal((await call('GET', '/api/auth/me', { token: 'good-flip', at: g.base })).status, 403);
    statusAnswer = was;
    clock += STATUS_TTL_MS + 1;
    assert.equal((await call('GET', '/api/auth/me', { token: 'good-flip', at: g.base })).status, 404);
    idnMode = 'down';
    clock += STATUS_TTL_MS + 1;
    assert.equal((await call('GET', '/api/auth/me', { token: 'good-flip', at: g.base })).status, 503);
    g.close();
  });
});

describe('served from identity', () => {
  test('POST /api/auth/sync: the verified token facts and the BFF-vouched name travel in the signed token; the body is relayed', async () => {
    const r = await call('POST', '/api/auth/sync', { token: 'good-g', body: { name: 'Typed', bio: 'b', deviceId: 'd1', uid: 'evil' } });
    assert.equal(r.status, 200);
    const c = idnCalls.find((x) => x.path === '/internal/identity/auth/sync');
    assert.deepEqual([c.claims.iss, c.claims.sub, c.claims.role], ['mobile-bff', 'g', 'devotee']);
    assert.deepEqual(c.claims.ctx.tok, { phone_number: '+919800000001', email: 'g@example.com', email_verified: true, picture: 'http://p', name: 'Gita', provider: 'google.com' });
    assert.deepEqual(c.body, { name: 'Typed', bio: 'b', deviceId: 'd1', uid: 'evil' }, 'the BFF does not interpret the body - identity ignores identity fields in it');
    assert.equal(monoSeen.length, 0, 'the monolith is not involved');
  });

  test('the other auth routes and policy routes map to identity paths', async () => {
    await call('GET', '/api/auth/me', { token: 'good-u1' });
    await call('PUT', '/api/auth/me', { token: 'good-u1', body: { name: 'N' } });
    await call('GET', '/api/auth/saved-temples', { token: 'good-u1' });
    await call('PUT', '/api/auth/saved-temples', { token: 'good-u1', body: { slugs: ['a'] } });
    await call('POST', '/api/policy/terms/accept', { token: 'good-u1', body: { version: 2 } });
    const paths = idnCalls.filter((c) => !c.path.endsWith('/status')).map((c) => `${c.method} ${c.path}`);
    assert.deepEqual(paths, [
      'GET /internal/identity/auth/me', 'PUT /internal/identity/auth/me', 'GET /internal/identity/auth/saved-temples',
      'PUT /internal/identity/auth/saved-temples', 'POST /internal/identity/policy/terms/accept',
    ]);
  });

  test('GET /api/policy/:key is public (a stale/garbage token is ignored)', async () => {
    assert.deepEqual((await call('GET', '/api/policy/terms')).body, { key: 'terms', version: 2 });
    assert.equal((await call('GET', '/api/policy/terms', { token: 'junk' })).status, 200);
    assert.equal(idnCalls.filter((c) => c.path.endsWith('/status')).length, 0);
  });

  test('identity\'s 4xx answers pass through unchanged (404 "call /auth/sync first")', async () => {
    const r = await call('GET', '/api/auth/me', { token: 'good-u1' });
    assert.deepEqual([r.status, r.body.error], [404, 'profile not found — call /auth/sync first']);
  });

  test('a rejected BFF token is OUR misconfiguration: 502, never 401 (the app would sign the devotee out)', async () => {
    idnMode = 'badtoken';
    const r = await call('GET', '/api/auth/me', { token: 'good-u77' });
    assert.equal(r.status, 502);
    assert.equal(r.body.code, 'identity_auth_failed');
  });

  test('an astrologer\'s role is vouched in the token', async () => {
    await call('POST', '/api/auth/sync', { token: 'good-astro', body: {} });
    const c = idnCalls.find((x) => x.path === '/internal/identity/auth/sync');
    assert.deepEqual([c.claims.role, c.claims.ctx.role, c.claims.ctx.name], ['astrologer', 'astrologer', 'Name of astro']);
  });
});

describe('push registration (FCM token) is served from identity', () => {
  test('POST /api/push/register -> 201 {ok:true}; the account is the verified uid (signed sub), never the body', async () => {
    const r = await call('POST', '/api/push/register', { token: 'good-astro', body: { token: 'fcm-token-1', platform: 'android', uid: 'evil' } });
    assert.deepEqual([r.status, r.body], [201, { ok: true }]);
    const c = idnCalls.find((x) => x.path === '/internal/identity/push/register');
    assert.deepEqual([c.method, c.claims.iss, c.claims.sub, c.claims.role], ['POST', 'mobile-bff', 'astro', 'astrologer']);
    assert.equal(c.body.token, 'fcm-token-1');
    assert.equal(monoSeen.length, 0, 'the monolith is not involved');
  });

  test('DELETE /api/push/register -> 200 {ok:true}', async () => {
    const r = await call('DELETE', '/api/push/register', { token: 'good-u1', body: { token: 'fcm-token-1' } });
    assert.deepEqual([r.status, r.body], [200, { ok: true }]);
    const c = idnCalls.find((x) => x.path === '/internal/identity/push/register');
    assert.deepEqual([c.method, c.claims.sub, c.body], ['DELETE', 'u1', { token: 'fcm-token-1' }]);
  });

  test('a missing, blank or oversized token is 400 {error, code:"bad_token"} (identity\'s answer, relayed) on both verbs', async () => {
    for (const method of ['POST', 'DELETE']) {
      for (const body of [{}, { token: '   ' }, { token: 'x'.repeat(4097) }, { token: 5 }]) {
        const r = await call(method, '/api/push/register', { token: 'good-u1', body });
        assert.equal(r.status, 400, `${method} ${JSON.stringify(body).slice(0, 30)}`);
        assert.equal(r.body.code, 'bad_token');
        assert.equal(typeof r.body.error, 'string');
      }
    }
  });

  test('a blocked devotee is refused 403 and an invalid token 401; identity is not asked to register anything', async () => {
    assert.equal((await call('POST', '/api/push/register', { token: 'good-blocked', body: { token: 't' } })).status, 403);
    assert.equal((await call('POST', '/api/push/register', { token: 'junk', body: { token: 't' } })).status, 401);
    assert.equal(idnCalls.filter((c) => c.path.endsWith('/push/register')).length, 0);
  });

  test('identity down is a clear 503 (never a fake success)', async () => {
    idnMode = 'down';
    const r = await call('POST', '/api/push/register', { token: 'good-u9', body: { token: 't' } });
    assert.equal(r.status, 503);
  });

  test('the path is shared with engagement\'s anonymous Expo registration: with engagement mounted too, {deviceId, pushToken} without a bearer is still ITS call, and an unauthenticated {token} is a 401', async () => {
    const engSeen = [];
    const eng = await listen((req, res, body, json) => {
      if (req.url === '/health') return json(200, {});
      engSeen.push({ url: req.url, body });
      json(200, { ok: true, engagement: true });
    });
    const g = await gateway({ ENGAGEMENT_URL: `http://127.0.0.1:${eng.address().port}` });
    try {
      const legacy = await call('POST', '/api/push/register', { at: g.base, body: { deviceId: 'd1', pushToken: 'ExponentPushToken[x]' } });
      assert.deepEqual([legacy.status, engSeen.at(-1).url, engSeen.at(-1).body.deviceId], [200, '/internal/engagement/push/register', 'd1']);
      const anon = await call('POST', '/api/push/register', { at: g.base, body: { token: 'fcm-token' } });
      assert.deepEqual([anon.status, anon.body], [401, { error: 'missing bearer token' }]);
      const authed = await call('POST', '/api/push/register', { at: g.base, token: 'good-u1', body: { token: 'fcm-token' } });
      assert.equal(authed.status, 201);
      assert.equal(engSeen.length, 1, 'engagement saw only the legacy call');
      assert.equal(idnCalls.filter((c) => c.path === '/internal/identity/push/register').length, 1);
    } finally {
      g.close();
      eng.closeAllConnections?.();
      eng.close();
    }
  });
});

describe('forwarding to the monolith', () => {
  test('a verified devotee reaches a monolith route with a signed token - the Firebase token and any cookie never do', async () => {
    const r = await call('GET', '/api/bookings', { token: 'good-u1', headers: { cookie: 'pooja_admin=whatever' } });
    assert.equal(r.status, 200);
    const s = monoSeen[0];
    assert.equal(s.headers.cookie, undefined);
    assert.ok(!String(s.headers.authorization).includes('good-u1'));
    assert.deepEqual([s.claims.iss, s.claims.sub, s.claims.role, s.claims.ctx.name, s.claims.ctx.role], ['mobile-bff', 'u1', 'devotee', 'Name of u1', 'devotee']);
    assert.ok(s.claims.reqId, 'request id propagated');
  });

  test('no token -> no Authorization at all (the monolith answers 401 itself)', async () => {
    await call('GET', '/api/bookings', { headers: { authorization: 'Basic abc', cookie: 'x=y' } });
    assert.equal(monoSeen[0].headers.authorization, undefined);
    assert.equal(monoSeen[0].headers.cookie, undefined);
  });

  test('an invalid token is signed as such so the monolith answers requireAuth\'s 401; a PUBLIC route ignores it', async () => {
    await call('GET', '/api/bookings', { token: 'junk' });
    assert.equal(monoSeen[0].claims.ctx.authError, 'invalid');
    const pub = await call('GET', '/api/content', { token: 'junk' });
    assert.equal(pub.status, 200);
  });

  test('an operator can NOT act through this BFF: the operator routes left it, and a mobile token is no operator token', async () => {
    for (const [m, p] of [['GET', '/api/users'], ['GET', '/api/flags/full'], ['POST', '/api/admin/login'], ['GET', '/api/admin/session']]) {
      monoSeen.length = 0;
      await call(m, p, { token: 'good-u1', body: m === 'POST' ? {} : undefined });
      assert.equal(monoSeen[0].claims.iss, 'mobile-bff', `${p} reaches the monolith (which refuses it) with a devotee token only`);
      assert.equal(monoSeen[0].claims.perms.length, 0);
    }
    assert.equal(idnCalls.filter((c) => !c.path.endsWith('/status')).length, 0, 'identity serves no operator route through the mobile BFF');
  });

  test('uploads are forwarded without credentials', async () => {
    await call('GET', '/uploads/abc.png', { token: 'good-u1', headers: { cookie: 'a=b' } });
    assert.equal(monoSeen[0].headers.authorization, undefined);
    assert.equal(monoSeen[0].headers.cookie, undefined);
  });
});

describe('health and the switch', () => {
  test('identity down: /api/health stays 200 with degraded ["identity"]; /health/deps is 503; public routes keep working', async () => {
    idnMode = 'down';
    const g = await gateway();
    const h = await call('GET', '/api/health', { at: g.base });
    assert.equal(h.status, 200);
    assert.deepEqual(h.body.degraded, ['identity']);
    assert.equal((await call('GET', '/health/deps', { at: g.base })).status, 503);
    assert.equal((await call('GET', '/api/content', { at: g.base })).status, 200);
    g.close();
  });

  test('IDENTITY_URL unset: phase 1 exactly - the Firebase token goes to the monolith untouched', async () => {
    const g = http.createServer(createApp(loadConfig({ MONOLITH_URL: `http://127.0.0.1:${mono.address().port}` }), { logger }));
    await new Promise((r) => g.listen(0, '127.0.0.1', r));
    await fetch(`http://127.0.0.1:${g.address().port}/api/bookings`, { headers: { authorization: 'Bearer firebase-token', cookie: 'a=b' } });
    g.close();
    assert.equal(monoSeen[0].headers.authorization, 'Bearer firebase-token');
    assert.equal(monoSeen[0].headers.cookie, 'a=b');
  });

  test('config: the Firebase settings are read here and only here', () => {
    const c = loadConfig({ IDENTITY_URL: 'http://i:1', INTERNAL_JWT_SECRET: SECRET, FIREBASE_PROJECT_ID: 'p', FIREBASE_SERVICE_ACCOUNT_PATH: '/x.json' });
    assert.deepEqual([c.firebaseProjectId, c.firebaseServiceAccountPath, c.identityUrl], ['p', '/x.json', 'http://i:1']);
  });
});
