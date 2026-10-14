import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, beforeEach, describe, test } from 'node:test';

import { verifyServiceToken } from '@bhakti/common';

import { createApp } from './app.js';
import { loadConfig } from './config.js';

const SECRET = 'test-secret-test-secret-1234';
let mono;
let eng;
let gw;
let base;
let seen; // last request that reached the monolith
let calls; // requests that reached engagement
let engMode = 'ok'; // ok | down | 503 | 401

before(async () => {
  mono = http.createServer((req, res) => {
    const p = req.url.split('?')[0];
    if (p !== '/api/health') seen = { method: req.method, url: req.url };
    res.writeHead(p === '/api/health' ? 200 : 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ via: 'monolith', path: p }));
  });
  eng = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      if (req.url === '/health') {
        res.writeHead(engMode === 'down' ? 503 : 200);
        return res.end('{}');
      }
      calls.push({ method: req.method, url: req.url, headers: req.headers, body: raw ? JSON.parse(raw) : undefined });
      if (engMode === 'down') return req.socket.destroy();
      const json = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
      if (engMode === '503') return json(503, { error: 'starting' });
      if (engMode === '401') return json(401, { error: 'bad', code: 'bad_signature' });
      const claims = verifyServiceToken(req.headers.authorization?.replace(/^Bearer /, ''), { secret: SECRET });
      assert.equal(claims.iss, 'mobile-bff');
      if (req.url === '/internal/engagement/flags') return json(200, { flags: { bhajan: false, phoneAuth: true } });
      if (req.url === '/internal/engagement/announcements') return json(200, [{ title: 'hi' }]);
      if (req.url === '/internal/engagement/ingest/session' && !JSON.parse(raw || '{}').deviceId) return json(400, { error: 'deviceId required' });
      if (req.url.startsWith('/internal/engagement/ingest/') || req.url === '/internal/engagement/push/register') return json(200, { ok: true });
      json(404, { error: 'nf' });
    });
  });
  for (const s of [mono, eng]) await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const config = loadConfig({
    MONOLITH_URL: `http://127.0.0.1:${mono.address().port}`,
    ENGAGEMENT_URL: `http://127.0.0.1:${eng.address().port}/`,
    INTERNAL_JWT_SECRET: SECRET,
    SERVICE_TIMEOUT_MS: '1000',
  });
  gw = http.createServer(createApp(config, { logger: { info() {}, warn() {}, error() {} } }));
  await new Promise((r) => gw.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${gw.address().port}`;
});
after(() => { for (const s of [gw, eng, mono]) s.closeAllConnections?.(); for (const s of [gw, eng, mono]) s.close(); });
beforeEach(() => { calls = []; seen = null; engMode = 'ok'; });

const post = (path, body) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('config', () => {
  test('ENGAGEMENT_URL without a secret is refused at boot; neither set = phase-0 gateway', () => {
    assert.throws(() => loadConfig({ ENGAGEMENT_URL: 'http://x' }), /INTERNAL_JWT_SECRET/);
    assert.equal(loadConfig({}).engagementUrl, '');
    assert.equal(loadConfig({ ENGAGEMENT_URL: 'http://x///', INTERNAL_JWT_SECRET: SECRET }).engagementUrl, 'http://x');
  });
});

describe('routed to engagement (healthy)', () => {
  test('GET /api/flags: engagement body unchanged, signed by mobile-bff, request id propagated', async () => {
    const r = await fetch(`${base}/api/flags`, { headers: { 'x-request-id': 'rid-1' } });
    assert.equal(r.status, 200);
    assert.equal(await r.text(), '{"flags":{"bhajan":false,"phoneAuth":true}}');
    assert.equal(r.headers.get('x-degraded'), null);
    assert.equal(calls[0].headers['x-request-id'], 'rid-1');
    assert.equal(seen, null, 'the monolith was not called');
  });
  test('GET /api/announcements', async () => {
    assert.deepEqual(await (await fetch(`${base}/api/announcements`)).json(), [{ title: 'hi' }]);
  });
  test('ingest + push register forward the JSON body; engagement 400 passes through unchanged', async () => {
    let r = await post('/api/ingest/session', { deviceId: 'd1', model: 'm' });
    assert.deepEqual(await r.json(), { ok: true });
    assert.deepEqual(calls[0].body, { deviceId: 'd1', model: 'm' });
    assert.equal(calls[0].url, '/internal/engagement/ingest/session');
    r = await post('/api/ingest/session', {});
    assert.equal(r.status, 400);
    assert.deepEqual(await r.json(), { error: 'deviceId required' });
    assert.equal((await post('/api/ingest/screen', { screen: 's' })).status, 200);
    assert.equal((await post('/api/push/register', { deviceId: 'd', pushToken: 't' })).status, 200);
    assert.equal(calls.at(-1).url, '/internal/engagement/push/register');
  });
});

describe('fail-closed allowlist', () => {
  test('only the listed method+path pairs go to engagement; everything else is the monolith\'s call', async () => {
    for (const [m, p] of [
      ['POST', '/api/ingest/payment'], ['GET', '/api/ingest/session'], ['POST', '/api/flags'], ['GET', '/api/content/deities'],
      ['GET', '/api/content'], ['POST', '/api/announcements'], ['GET', '/api/push/register'], ['GET', '/api/flags/full/extra'],
    ]) {
      calls = [];
      seen = null;
      const r = await fetch(`${base}${p}`, { method: m, ...(m === 'GET' ? {} : { headers: { 'content-type': 'application/json' }, body: '{}' }) });
      assert.equal(calls.length, 0, `${m} ${p} must not reach engagement`);
      assert.equal((await r.json()).via, 'monolith', `${m} ${p}`);
    }
  });
});

describe('operator routes (smoke parity: the monolith served them through either BFF in phase 0)', () => {
  test('they are gated here too: no operator session -> 401 and engagement is never called', async () => {
    for (const p of ['/api/flags/full', '/api/visitors', '/api/analytics/summary', '/api/content/settings', '/api/content/announcements']) {
      const r = await fetch(`${base}${p}`);
      assert.equal(r.status, 401, p);
      assert.deepEqual(await r.json(), { error: 'Sign in required' });
    }
    assert.equal(calls.length, 0);
  });
});

describe('engagement unavailable: degrade, never a 5xx for the app reads', () => {
  for (const mode of ['down', '503', '401']) {
    test(`mode ${mode}`, async () => {
      engMode = mode;
      let r = await fetch(`${base}/api/flags`);
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('x-degraded'), 'engagement');
      const { flags } = await r.json();
      assert.equal(flags.bhajan, true);
      assert.equal(flags.phoneAuth, false, 'documented default: phone OTP off');
      r = await fetch(`${base}/api/announcements`);
      assert.equal(r.status, 200);
      assert.deepEqual(await r.json(), []);
      r = await post('/api/ingest/session', { deviceId: 'd' });
      assert.equal(r.status, 503);
      assert.equal((await r.json()).code, 'engagement_unavailable');
      assert.equal((await post('/api/push/register', { deviceId: 'd', pushToken: 't' })).status, 503);
    });
  }
  test('monolith routes are unaffected by an engagement outage', async () => {
    engMode = 'down';
    assert.equal((await (await fetch(`${base}/api/content`)).json()).via, 'monolith');
  });
});

describe('health stays truthful', () => {
  test('/api/health lists degraded services but stays 200 (the BFF can still serve); /health/deps says 503', async () => {
    let r = await fetch(`${base}/api/health`);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).degraded, undefined);
    engMode = 'down';
    r = await fetch(`${base}/api/health`);
    assert.equal(r.status, 200);
    assert.deepEqual((await r.json()).degraded, ['engagement']);
    r = await fetch(`${base}/health/deps`);
    assert.equal(r.status, 503);
    const deps = (await r.json()).deps;
    assert.equal(deps.engagement.ok, false);
    assert.equal(deps.monolith.ok, true);
    assert.equal((await fetch(`${base}/health`)).status, 200, 'readiness depends on the monolith only');
  });
});
