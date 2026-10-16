// docs/USERS.md section 3: what the phone sees when an account or a device is blocked, and the support contact it is given.
// Stand-ins for the monolith, identity and engagement (the settings table). Run: node --test --test-concurrency=1 src/blocked.test.mjs
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, beforeEach, describe, test } from 'node:test';

import { DEFAULT_BLOCK_MESSAGE, DEVICE_TTL_MS, SUPPORT_TTL_MS, STATUS_TTL_MS, blockedBody, supportFrom, verifyServiceToken } from '@bhakti/common';

import { createApp } from './app.js';
import { loadConfig } from './config.js';

const SECRET = 'test-secret-test-secret-1234';
const logger = { info() {}, warn() {}, error() {} };
const verifyIdToken = async (t) => {
  if (t.startsWith('good-')) return { uid: t.slice(5), phone_number: '+919800000001', firebase: { sign_in_provider: 'phone' } };
  throw new Error('Decoding Firebase ID token failed');
};
const firebase = { ready: () => true, error: () => null, projectId: () => 'proj-a' };

let mono; let idn; let eng; let base; let gw;
let monoSeen; let deviceAsks; let settingsAsks; let clock = 1_000_000;
let statusAnswer; let deviceAnswer; let deviceMode; let settingsAnswer; let settingsMode;
const claimsOf = (req) => { try { return verifyServiceToken(req.headers.authorization?.replace(/^Bearer /, ''), { secret: SECRET }); } catch { return null; } };

function listen(handler) {
  const s = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => handler(req, res, raw ? JSON.parse(raw) : undefined, (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); }));
  });
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r(s)));
}

before(async () => {
  mono = await listen((req, _res, body, json) => {
    if (req.url === '/api/health') return json(200, { ok: true });
    monoSeen.push({ url: req.url, claims: claimsOf(req) });
    json(200, { via: 'monolith' });
  });
  idn = await listen((req, _res, body, json) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/health') return json(200, {});
    let m = /^\/internal\/identity\/users\/([^/]+)\/status$/.exec(u.pathname);
    if (m) return json(200, statusAnswer(m[1]));
    m = /^\/internal\/identity\/devices\/([^/]+)\/status$/.exec(u.pathname);
    if (m) {
      deviceAsks.push(decodeURIComponent(m[1]));
      if (deviceMode === 'down') return req.socket.destroy();
      return json(200, deviceAnswer(decodeURIComponent(m[1])));
    }
    if (u.pathname === '/internal/identity/auth/sync') {
      // identity's own second line for a blocked account (the BFF normally answers first)
      if (body?.simulateBlocked) return json(403, { error: 'account blocked', code: 'account_blocked', message: 'From identity', messageHi: '', until: null, support: {} });
      return json(200, { synced: true });
    }
    json(200, { identity: true, path: u.pathname });
  });
  eng = await listen((req, _res, body, json) => {
    if (req.url === '/health') return json(200, {});
    if (req.url.startsWith('/internal/engagement/settings/map')) {
      settingsAsks.push(claimsOf(req)?.iss);
      if (settingsMode === 'down') return req.socket.destroy();
      return json(200, { settings: settingsAnswer });
    }
    json(404, { error: 'nope' });
  });
  const config = loadConfig({
    MONOLITH_URL: `http://127.0.0.1:${mono.address().port}`,
    IDENTITY_URL: `http://127.0.0.1:${idn.address().port}`,
    ENGAGEMENT_URL: `http://127.0.0.1:${eng.address().port}`,
    INTERNAL_JWT_SECRET: SECRET,
    SERVICE_TIMEOUT_MS: '1000',
  });
  gw = http.createServer(createApp(config, { logger, verifyIdToken, firebase, now: () => clock }));
  await new Promise((r) => gw.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${gw.address().port}`;
});
after(() => { gw.closeAllConnections?.(); gw.close(); for (const s of [mono, idn, eng]) { s.closeAllConnections?.(); s.close(); } });
beforeEach(() => {
  monoSeen = []; deviceAsks = []; settingsAsks = []; deviceMode = 'ok'; settingsMode = 'ok';
  clock += SUPPORT_TTL_MS + DEVICE_TTL_MS + STATUS_TTL_MS + 1; // past every cache
  statusAnswer = (uid) => ({ exists: true, blocked: uid === 'blocked', name: 'N', role: 'devotee', ...(uid === 'blocked' ? { block: { message: 'You were rude to an astrologer.', messageHi: 'आपने अशिष्टता की।', until: '2026-12-01T00:00:00.000Z' } } : {}) });
  deviceAnswer = (id) => (id === 'bad-phone' ? { blocked: true, message: 'This phone is blocked.', messageHi: '', until: null } : { blocked: false });
  settingsAnswer = { supportEmail: ' help@bhakti.example ', supportPhone: '', supportHours: '9-5' };
});

async function call(method, path, { token, device, body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...(device ? { 'x-device-id': device } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, body: json };
}

describe('account blocked: 403 account_blocked with the operator\'s words and the support contact', () => {
  test('POST /api/auth/sync and every authenticated route answer the same body; blank support values are hidden, the rest trimmed', async () => {
    const expected = {
      error: 'account blocked', code: 'account_blocked', message: 'You were rude to an astrologer.', messageHi: 'आपने अशिष्टता की।',
      until: '2026-12-01T00:00:00.000Z', support: { email: 'help@bhakti.example' },
    };
    for (const [m, p] of [['POST', '/api/auth/sync'], ['GET', '/api/auth/me'], ['PUT', '/api/auth/me'], ['GET', '/api/auth/saved-temples'], ['POST', '/api/policy/terms/accept'], ['POST', '/api/push/register'], ['GET', '/api/bookings'], ['POST', '/api/anything-else']]) {
      const r = await call(m, p, { token: 'good-blocked', body: m === 'GET' ? undefined : {} });
      assert.deepEqual([r.status, r.body], [403, expected], `${m} ${p}`);
    }
    assert.equal(monoSeen.length, 0, 'private monolith routes never see a blocked caller');
  });

  test('the support contact comes from the settings table (engagement), is cached, and a failing settings lookup just means no buttons', async () => {
    settingsAnswer = { supportEmail: 'a@b.c', supportPhone: '+911800123456' };
    assert.deepEqual((await call('GET', '/api/auth/me', { token: 'good-blocked' })).body.support, { email: 'a@b.c', phone: '+911800123456' });
    await call('GET', '/api/auth/me', { token: 'good-blocked' });
    assert.equal(settingsAsks.length, 1, 'cached');
    assert.deepEqual(settingsAsks, ['mobile-bff']);
    clock += SUPPORT_TTL_MS + 1;
    settingsMode = 'down';
    assert.deepEqual((await call('GET', '/api/auth/me', { token: 'good-blocked' })).body.support, { email: 'a@b.c', phone: '+911800123456' }, 'the last good contact survives an outage');
    settingsAnswer = {};
  });

  test('identity\'s own refusal (the second line) is relayed with the support contact added', async () => {
    const r = await call('POST', '/api/auth/sync', { token: 'good-u1', body: { simulateBlocked: true } });
    assert.deepEqual([r.status, r.body.code, r.body.message, r.body.support], [403, 'account_blocked', 'From identity', { email: 'help@bhakti.example' }]);
  });

  test('the monolith\'s open routes stay open for a blocked account; a public policy read is untouched', async () => {
    assert.equal((await call('GET', '/api/content', { token: 'good-blocked' })).status, 200);
    assert.equal((await call('GET', '/api/policy/terms', { token: 'good-blocked' })).status, 200);
    assert.equal(monoSeen[0].claims.ctx.authError, 'blocked');
  });

  test('a blocked answer with no message at all (an older identity) falls back to the stock text', async () => {
    statusAnswer = () => ({ exists: true, blocked: true, name: '', role: 'devotee' });
    const r = await call('GET', '/api/auth/me', { token: 'good-u1' });
    assert.deepEqual([r.body.message, r.body.until], [DEFAULT_BLOCK_MESSAGE, null]);
  });
});

describe('device blocked: 403 device_blocked from X-Device-Id, cached 30 s, FAILS OPEN', () => {
  test('a blocked device is refused on sync and on authenticated routes, even for an account that is fine; other devices and no device pass', async () => {
    const want = { error: 'device blocked', code: 'device_blocked', message: 'This phone is blocked.', messageHi: '', until: null, support: { email: 'help@bhakti.example' } };
    for (const [m, p] of [['POST', '/api/auth/sync'], ['GET', '/api/auth/me'], ['GET', '/api/bookings']]) {
      const r = await call(m, p, { token: 'good-u1', device: 'bad-phone', body: m === 'POST' ? {} : undefined });
      assert.deepEqual([r.status, r.body], [403, want], `${m} ${p}`);
    }
    assert.equal((await call('POST', '/api/auth/sync', { token: 'good-u1', device: 'fine-phone', body: {} })).status, 200);
    assert.equal((await call('POST', '/api/auth/sync', { token: 'good-u1', body: {} })).status, 200, 'no X-Device-Id = nothing to check');
    assert.equal((await call('GET', '/api/content', { token: 'good-u1', device: 'bad-phone' })).status, 200, 'public routes are not gated by a device block');
  });

  test('an account block wins over a device block', async () => {
    const r = await call('GET', '/api/auth/me', { token: 'good-blocked', device: 'bad-phone' });
    assert.equal(r.body.code, 'account_blocked');
  });

  test('cached for DEVICE_TTL_MS, then asked again; a removed block is picked up after the TTL', async () => {
    await call('GET', '/api/auth/me', { token: 'good-u1', device: 'bad-phone' });
    await call('GET', '/api/auth/me', { token: 'good-u1', device: 'bad-phone' });
    await call('GET', '/api/auth/me', { token: 'good-u2', device: 'bad-phone' });
    assert.equal(deviceAsks.length, 1);
    deviceAnswer = () => ({ blocked: false });
    clock += DEVICE_TTL_MS - 1;
    assert.equal((await call('GET', '/api/auth/me', { token: 'good-u1', device: 'bad-phone' })).status, 403, 'still cached');
    clock += 2;
    assert.notEqual((await call('GET', '/api/auth/me', { token: 'good-u1', device: 'bad-phone' })).status, 403);
    assert.equal(deviceAsks.length, 2);
  });

  test('a device lookup that fails lets the request through (a deterrent, not the control) and is retried soon', async () => {
    deviceMode = 'down';
    const r = await call('POST', '/api/auth/sync', { token: 'good-u1', device: 'bad-phone', body: {} });
    assert.equal(r.status, 200);
    deviceMode = 'ok';
    assert.equal((await call('GET', '/api/auth/me', { token: 'good-u1', device: 'bad-phone' })).status, 200, 'the failure is remembered only briefly...');
    clock += 6000;
    assert.equal((await call('GET', '/api/auth/me', { token: 'good-u1', device: 'bad-phone' })).status, 403, '...then the real answer applies');
  });
});

describe('the shared helpers', () => {
  test('blockedBody never invents an until, defaults the text, and keeps only non-blank support values', () => {
    assert.deepEqual(blockedBody('account', {}, {}), { error: 'account blocked', code: 'account_blocked', message: DEFAULT_BLOCK_MESSAGE, messageHi: blockedBody('account').messageHi, until: null, support: {} });
    assert.equal(blockedBody('device', { message: 'x', until: 'garbage' }).until, null);
    assert.equal(blockedBody('device', { message: 'x' }).code, 'device_blocked');
    assert.equal(blockedBody('account', { message: 'English only' }).messageHi, '', 'an English-only message is not paired with a stock Hindi one');
    assert.deepEqual(supportFrom({ supportEmail: '  ', supportPhone: ' +91 ' }), { phone: '+91' });
    assert.deepEqual(supportFrom(null), {});
    assert.deepEqual(blockedBody('account', {}, { email: '', phone: '1' }).support, { phone: '1' });
  });
});
