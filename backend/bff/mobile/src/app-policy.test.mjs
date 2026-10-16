// The public `GET /api/app/policy` and the version GATE (docs/RELEASES.md sections 3-4): headers, 426 / 503 bodies, exempt paths, the 30 s refresh,
// stale-while-error for an hour, FAIL OPEN, counters flushed every 60 s. Stand-ins for the monolith, engagement and identity; a fake clock.
// Run: node --test --test-concurrency=1 src/app-policy.test.mjs   (no database needed)
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, beforeEach, describe, test } from 'node:test';

import { createAppPolicyMount, verifyServiceToken } from '@bhakti/common';

import { createApp } from './app.js';
import { loadConfig } from './config.js';

const SECRET = 'test-secret-test-secret-1234';
const quiet = { info() {}, warn() {}, error() {} };

let mono; let eng; let idn; let gw; let base;
let monoSeen; let engCalls; let engMode; let policy; let releases; let clock;
const claimsOf = (req) => { try { return verifyServiceToken(req.headers.authorization?.replace(/^Bearer /, ''), { secret: SECRET }); } catch { return null; } };

const EMPTY = () => ({ platform: 'android', minVersionCode: null, recommendedVersionCode: null, blockedVersionCodes: [], minOsApi: null, graceUntil: null, snoozeDays: 3, message: '', messageHi: '', storeUrl: '', maintenance: { enabled: false, message: '', messageHi: '', until: null, allowUids: [] }, blockUnversioned: false, version: 1 });

function listen(handler) {
  const s = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => handler(req, res, raw ? JSON.parse(raw) : undefined, (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); }));
  });
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r(s)));
}

const verifyIdToken = async (t) => { if (t.startsWith('good-')) return { uid: t.slice(5) }; throw new Error('bad token'); };
const firebase = { ready: () => true, error: () => null, projectId: () => 'p' };

function mkConfig(extra = {}) {
  return loadConfig({
    MONOLITH_URL: `http://127.0.0.1:${mono.address().port}`, ENGAGEMENT_URL: `http://127.0.0.1:${eng.address().port}`, INTERNAL_JWT_SECRET: SECRET, SERVICE_TIMEOUT_MS: '1000', ...extra,
  });
}
async function gateway(extra = {}, deps = {}) {
  const g = http.createServer(createApp(mkConfig(extra), { logger: quiet, now: () => clock, ...deps }));
  await new Promise((r) => g.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${g.address().port}`, close: () => { g.closeAllConnections?.(); g.close(); } };
}

before(async () => {
  mono = await listen((req, res, body, json) => {
    if (req.url === '/api/health') return json(200, { ok: true });
    monoSeen.push(req.url);
    json(200, { via: 'monolith' });
  });
  eng = await listen((req, res, body, json) => {
    if (req.url === '/health') return json(200, {});
    const u = new URL(req.url, 'http://x');
    engCalls.push({ method: req.method, path: u.pathname, claims: claimsOf(req), body });
    if (engMode === 'down') return req.socket.destroy();
    if (engMode === '500') return json(500, { error: 'boom' });
    if (u.pathname === '/internal/engagement/policy') return engMode === 'garbage' ? json(200, { nope: true }) : json(200, { policy, releases });
    if (u.pathname === '/internal/engagement/policy/evaluate') return engMode === 'badeval' ? json(200, { weird: 1 }) : json(200, { status: policy.__eval ?? 'ok', message: 'm', messageHi: '', storeUrl: '', minVersionName: null, recommendedVersionName: null, graceUntil: null, snoozeDays: 3, maintenanceUntil: null, seen: body });
    if (u.pathname === '/internal/engagement/policy/blocked-counts') return json(200, { ok: true });
    json(200, { engagement: true });
  });
  idn = await listen((req, res, body, json) => {
    if (req.url === '/health') return json(200, {});
    if (/\/status$/.test(req.url)) return json(200, { exists: true, blocked: false, name: 'N', role: 'devotee' });
    json(200, { identity: true });
  });
});
after(() => { gw.close(); for (const s of [mono, eng, idn]) { s.closeAllConnections?.(); s.close(); } });
beforeEach(async () => {
  gw?.close(); // a fresh gateway per test: its policy cache, counters and breaker are its own
  gw = await gateway();
  base = gw.base;
  monoSeen = []; engCalls = []; engMode = 'ok'; policy = EMPTY(); releases = [{ versionCode: 8, versionName: '1.5.0' }];
  clock = 10_000_000_000; // each test is far past every cache of the shared gateway
});

async function call(method, path, { headers = {}, body, at = base } = {}) {
  const res = await fetch(`${at}${path}`, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, body: json, text, headers: res.headers };
}
const app = (code, extra = {}) => ({ 'x-app-platform': 'android', 'x-app-version': 'v', 'x-app-version-code': String(code), 'x-os-api': '34', ...extra });
const gated = (n = 1) => engCalls.filter((c) => c.path === '/internal/engagement/policy').length === n;

describe('the gate: blocking statuses', () => {
  test('a build below the minimum gets 426 app_outdated with the message in both languages, the store link and the minimum\'s name; engagement and the monolith are not reached', async () => {
    policy = { ...EMPTY(), minVersionCode: 8, message: 'Please update', messageHi: 'अपडेट करें', storeUrl: 'https://play.google.com/x' };
    const r = await call('GET', '/api/content', { headers: app(3) });
    assert.equal(r.status, 426);
    assert.deepEqual(r.body, { error: 'Please update', code: 'app_outdated', status: 'update_required', message: 'Please update', messageHi: 'अपडेट करें', storeUrl: 'https://play.google.com/x', minVersionName: '1.5.0' });
    assert.deepEqual(monoSeen, []);
  });

  test('a blocked build is 426 with status "blocked"; builds around it pass', async () => {
    policy = { ...EMPTY(), blockedVersionCodes: [5], message: 'Bad build' };
    const r = await call('GET', '/api/flags', { headers: app(5) });
    assert.deepEqual([r.status, r.body.status, r.body.code], [426, 'blocked', 'app_outdated']);
    assert.equal((await call('GET', '/api/whatever', { headers: app(6) })).status, 200);
    assert.equal((await call('GET', '/api/whatever', { headers: app(4) })).status, 200);
  });

  test('maintenance is 503 with the message, its end time and Retry-After; "until" in the past means it is over', async () => {
    policy = { ...EMPTY(), maintenance: { enabled: true, message: 'Back soon', messageHi: 'जल्द', until: new Date(clock + 600_000).toISOString(), allowUids: [] } };
    const r = await call('POST', '/api/anything', { headers: app(1), body: {} });
    assert.equal(r.status, 503);
    assert.deepEqual(r.body, { error: 'Back soon', code: 'maintenance', status: 'maintenance', message: 'Back soon', messageHi: 'जल्द', maintenanceUntil: new Date(clock + 600_000).toISOString() });
    assert.equal(r.headers.get('retry-after'), '600');
    policy = { ...policy, maintenance: { ...policy.maintenance, until: new Date(clock - 1000).toISOString() } };
    clock += 31_000;
    await call('GET', '/api/anything', { headers: app(1) }); // triggers the background refresh
    await new Promise((r) => setTimeout(r, 80));
    assert.equal((await call('GET', '/api/anything', { headers: app(1) })).status, 200);
  });

  test('a grace period nudges instead of blocking; unsupported OS and update_available pass through', async () => {
    policy = { ...EMPTY(), minVersionCode: 9, graceUntil: new Date(clock + 86_400_000).toISOString(), minOsApi: 40, recommendedVersionCode: 10 };
    assert.equal((await call('GET', '/api/x', { headers: app(5) })).status, 200);
  });

  test('no version headers: let through, unless the operator refuses unversioned callers', async () => {
    policy = { ...EMPTY(), minVersionCode: 9 };
    assert.equal((await call('GET', '/api/x')).status, 200);
    policy = { ...policy, blockUnversioned: true };
    clock += 31_000;
    await call('GET', '/api/x'); // triggers the background refresh
    await new Promise((r) => setTimeout(r, 80));
    const r = await call('GET', '/api/x');
    assert.deepEqual([r.status, r.body.status], [426, 'update_required']);
    assert.equal((await call('GET', '/api/x', { headers: app(9) })).status, 200);
    assert.equal((await call('GET', '/api/x', { headers: { 'x-app-version-code': 'junk' } })).status, 426);
  });

  test('another platform has no policy here and passes', async () => {
    policy = { ...EMPTY(), minVersionCode: 9 };
    assert.equal((await call('GET', '/api/x', { headers: app(1, { 'x-app-platform': 'ios' }) })).status, 200);
  });
});

describe('the gate: what it never touches', () => {
  test('the policy route, health, uploads, webhooks and CORS preflights are exempt even while everything else is blocked', async () => {
    policy = { ...EMPTY(), minVersionCode: 99, maintenance: { enabled: true, message: 'm', until: null, allowUids: [] } };
    assert.equal((await call('GET', '/api/app/policy?platform=android&versionCode=1', { headers: app(1) })).status, 200);
    assert.equal((await call('GET', '/api/health', { headers: app(1) })).status, 200);
    assert.equal((await call('GET', '/health', { headers: app(1) })).status, 200);
    assert.equal((await call('GET', '/uploads/x.png', { headers: app(1) })).status, 200);
    assert.equal((await call('POST', '/api/webhooks/razorpay', { headers: app(1), body: {} })).status, 200);
    assert.equal((await call('OPTIONS', '/api/content', { headers: { origin: 'http://localhost', 'access-control-request-method': 'GET' } })).status < 400, true);
    assert.equal((await call('GET', '/api/content', { headers: app(1) })).status, 503);
    assert.equal((await call('GET', '/api/app/policyx', { headers: app(1) })).status, 503, 'the exemption is exact');
  });
});

describe('the gate: FAIL OPEN', () => {
  for (const mode of ['down', '500', 'garbage']) {
    test(`engagement ${mode} and no policy loaded: every request passes`, async () => {
      engMode = mode;
      policy = { ...EMPTY(), minVersionCode: 99 };
      const r = await call('GET', '/api/content', { headers: app(1) });
      assert.equal(r.status, 200);
      assert.deepEqual(monoSeen, ['/api/content']);
    });
  }

  test('a policy loaded, then engagement dies: the last good policy keeps being applied for an hour (stale-while-error), then the gate opens', async () => {
    policy = { ...EMPTY(), minVersionCode: 9 };
    assert.equal((await call('GET', '/api/x', { headers: app(1) })).status, 426);
    engMode = 'down';
    clock += 31_000;
    assert.equal((await call('GET', '/api/x', { headers: app(1) })).status, 426, 'refresh fails in the background; the stale policy still applies');
    clock += 30 * 60_000;
    assert.equal((await call('GET', '/api/x', { headers: app(1) })).status, 426, '31 minutes after the last good policy');
    clock += 40 * 60_000;
    assert.equal((await call('GET', '/api/x', { headers: app(1) })).status, 200, 'more than an hour stale: fail open');
    engMode = 'ok';
    clock += 31_000;
    await call('GET', '/api/x', { headers: app(1) });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal((await call('GET', '/api/x', { headers: app(1) })).status, 426, 'recovered on the next refresh');
  });

  test('a throwing resolver or a broken release list never stops a request', async () => {
    policy = { ...EMPTY(), maintenance: { enabled: true, message: 'm', allowUids: ['u'] } };
    releases = 'nonsense';
    assert.equal((await call('GET', '/api/x', { headers: app(1), })).status, 503);
  });
});

describe('the gate: refresh every 30 s', () => {
  test('the policy is fetched once, then again only after 30 s - never per request - and the change shows from the next request after the refresh', async () => {
    const g = await gateway();
    try {
      policy = { ...EMPTY(), minVersionCode: 9 };
      engCalls = [];
      for (let i = 0; i < 5; i++) assert.equal((await call('GET', '/api/x', { headers: app(1), at: g.base })).status, 426);
      assert.equal(engCalls.filter((c) => c.path === '/internal/engagement/policy').length, 1);
      policy = { ...EMPTY() };
      clock += 29_000;
      assert.equal((await call('GET', '/api/x', { headers: app(1), at: g.base })).status, 426, 'inside 30 s: cached');
      clock += 2_000;
      assert.equal((await call('GET', '/api/x', { headers: app(1), at: g.base })).status, 426, 'the request that triggers the refresh is not delayed');
      await new Promise((r) => setTimeout(r, 80));
      assert.equal((await call('GET', '/api/x', { headers: app(1), at: g.base })).status, 200, 'the refreshed policy applies');
      assert.equal(engCalls.filter((c) => c.path === '/internal/engagement/policy').length, 2);
      assert.equal(engCalls[0].claims.iss, 'mobile-bff');
    } finally { g.close(); }
  });
});

describe('the gate: counters', () => {
  const fakeRes = () => { const r = { code: 200, headers: {}, setHeader(k, v) { r.headers[k] = v; }, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
  const run = async (m, code) => { const res = fakeRes(); let passed = false; await m.gate({ method: 'GET', path: '/api/x', headers: code === undefined ? {} : { 'x-app-version-code': String(code) }, id: 'r' }, res, () => { passed = true; }); return { res, passed }; };
  const mkFetch = (log, { failFlush = false } = {}) => async (url, init) => {
    const p = new URL(url).pathname;
    log.push({ p, body: init.body ? JSON.parse(init.body) : undefined });
    if (p.endsWith('blocked-counts') && failFlush) throw new Error('down');
    const body = p.endsWith('/policy') ? { policy: { ...EMPTY(), minVersionCode: 9, blockedVersionCodes: [7] }, releases: [] } : { ok: true };
    return { status: 200, headers: { get: () => null }, text: async () => JSON.stringify(body) };
  };

  test('refusals are counted in memory per build, flushed in ONE call (not per request), and the buffer starts again', async () => {
    const log = [];
    const m = createAppPolicyMount({ engagementUrl: 'http://eng', internalJwtSecret: SECRET, serviceTimeoutMs: 1000 }, { fetchImpl: mkFetch(log), now: () => clock, flushEveryMs: 0, logger: quiet });
    for (const c of [1, 1, 1, 7, 7, undefined]) await run(m, c);
    assert.equal((await run(m, 10)).passed, true, 'a current build is not counted');
    assert.deepEqual(log.filter((x) => x.p.endsWith('blocked-counts')), [], 'nothing flushed per request');
    await m.flush();
    const sent = log.filter((x) => x.p.endsWith('blocked-counts'));
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].body.counts.sort((a, b) => (a.versionCode ?? -1) - (b.versionCode ?? -1)), [{ platform: 'android', versionCode: 1, count: 3 }, { platform: 'android', versionCode: 7, count: 2 }]);
    await m.flush();
    assert.equal(log.filter((x) => x.p.endsWith('blocked-counts')).length, 1, 'empty buffer: no call');
  });

  test('a failed flush keeps the counts for the next one; the timer flushes by itself', async () => {
    const log = [];
    let fail = true;
    const f = mkFetch(log, { failFlush: true });
    const m = createAppPolicyMount({ engagementUrl: 'http://eng', internalJwtSecret: SECRET, serviceTimeoutMs: 1000 }, { fetchImpl: (u, i) => (fail ? f(u, i) : mkFetch(log)(u, i)), now: () => clock, flushEveryMs: 30, logger: quiet });
    await run(m, 1);
    await new Promise((r) => setTimeout(r, 120)); // the timer fired, the flush failed, it re-armed
    fail = false;
    await new Promise((r) => setTimeout(r, 120));
    const ok = log.filter((x) => x.p.endsWith('blocked-counts')).at(-1);
    assert.deepEqual(ok.body.counts, [{ platform: 'android', versionCode: 1, count: 1 }]);
    assert.deepEqual(m._state().counts, {});
  });

  test('maintenance refusals are not counted as version refusals', async () => {
    const log = [];
    const f = async (url, init) => {
      const p = new URL(url).pathname;
      log.push(p);
      const body = p.endsWith('/policy') ? { policy: { ...EMPTY(), maintenance: { enabled: true, message: 'x', allowUids: [] } }, releases: [] } : { ok: true };
      return { status: 200, headers: { get: () => null }, text: async () => JSON.stringify(body) };
    };
    const m = createAppPolicyMount({ engagementUrl: 'http://eng', internalJwtSecret: SECRET, serviceTimeoutMs: 1000 }, { fetchImpl: f, now: () => clock, flushEveryMs: 0, logger: quiet });
    assert.equal((await run(m, 3)).res.code, 503);
    assert.deepEqual(m._state().counts, {});
  });
});

describe('GET /api/app/policy', () => {
  test('answers 200 with the decision from engagement plus serverTime; the device, build and OS are forwarded', async () => {
    policy.__eval = 'update_available';
    const r = await call('GET', '/api/app/policy?platform=android&versionCode=7&osApi=33', { headers: { 'x-device-id': 'dev-1', 'x-app-version': '1.4.0', 'x-device-model': 'Pixel' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'update_available');
    assert.equal(r.body.serverTime, new Date(clock).toISOString());
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const sent = engCalls.find((c) => c.path.endsWith('/evaluate'));
    assert.deepEqual(sent.body, { platform: 'android', versionCode: '7', osApi: '33', uid: null, deviceId: 'dev-1', versionName: '1.4.0', model: 'Pixel' });
    assert.equal(sent.claims.iss, 'mobile-bff');
  });

  test('headers stand in for a missing query', async () => {
    await call('GET', '/api/app/policy', { headers: app(12, { 'x-device-id': 'd' }) });
    const sent = engCalls.find((c) => c.path.endsWith('/evaluate')).body;
    assert.deepEqual([sent.platform, sent.versionCode, sent.osApi, sent.versionName], ['android', '12', '34', 'v']);
  });

  for (const mode of ['down', '500', 'badeval']) {
    test(`NEVER a 5xx: engagement ${mode} is 200 {status:"ok", degraded:true}`, async () => {
      engMode = mode;
      const r = await call('GET', '/api/app/policy?versionCode=1', { headers: app(1) });
      assert.equal(r.status, 200);
      assert.deepEqual([r.body.status, r.body.degraded], ['ok', true]);
      assert.equal(r.headers.get('x-degraded'), 'engagement');
      assert.ok(r.body.serverTime);
    });
  }

  test('degraded but with a cached policy that blocks this build: the answer says so (still 200)', async () => {
    policy = { ...EMPTY(), minVersionCode: 9, message: 'Update' };
    await call('GET', '/api/x', { headers: app(1) }); // loads the gate's cache
    engMode = 'down';
    const r = await call('GET', '/api/app/policy?versionCode=1', { headers: app(1) });
    assert.deepEqual([r.status, r.body.status, r.body.degraded, r.body.minVersionName], [200, 'update_required', true, 'build 9']);
  });

  test('without ENGAGEMENT_URL the route still answers (degraded ok) and there is no gate - the phone is never locked out of a half-built stack', async () => {
    const g = http.createServer(createApp(loadConfig({ MONOLITH_URL: `http://127.0.0.1:${mono.address().port}` }), { logger: quiet }));
    await new Promise((r) => g.listen(0, '127.0.0.1', r));
    const at = `http://127.0.0.1:${g.address().port}`;
    try {
      const r = await call('GET', '/api/app/policy?versionCode=1', { at });
      assert.deepEqual([r.status, r.body.status, r.body.degraded], [200, 'ok', true]);
      assert.equal((await call('GET', '/api/x', { at, headers: app(1) })).status, 200);
    } finally { g.closeAllConnections?.(); g.close(); }
  });
});

describe('identity edge: the signed-in uid honours the maintenance allow-list', () => {
  test('a listed uid passes maintenance, an unlisted or anonymous caller gets 503; a bad token is just anonymous', async () => {
    policy = { ...EMPTY(), maintenance: { enabled: true, message: 'down', allowUids: ['uid-tester'] } };
    const g = await gateway({ IDENTITY_URL: `http://127.0.0.1:${idn.address().port}` }, { verifyIdToken, firebase });
    try {
      const withTok = (t) => ({ ...app(1), authorization: `Bearer ${t}` });
      assert.equal((await call('GET', '/api/x', { at: g.base, headers: withTok('good-uid-tester') })).status, 200);
      assert.equal((await call('GET', '/api/x', { at: g.base, headers: withTok('good-someone') })).status, 503);
      assert.equal((await call('GET', '/api/x', { at: g.base, headers: withTok('garbage') })).status, 503);
      assert.equal((await call('GET', '/api/x', { at: g.base, headers: app(1) })).status, 503);
      const p = await call('GET', '/api/app/policy?versionCode=1', { at: g.base, headers: withTok('good-uid-tester') });
      assert.equal(p.status, 200);
      assert.equal(engCalls.filter((c) => c.path.endsWith('/evaluate')).at(-1).body.uid, 'uid-tester');
    } finally { g.close(); }
  });
});
