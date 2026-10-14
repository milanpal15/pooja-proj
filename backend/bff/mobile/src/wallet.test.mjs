// Phase 4: the mobile BFF serves the wallet routes. Stand-ins for the monolith, identity and wallet.
// The Razorpay webhook is checked with a SIGNED fixture: the stand-in wallet verifies the HMAC over the bytes it receives, with the
// secret from the test's own environment - so a signature that is valid at the phone's side only passes if the BFF forwarded the raw
// bytes byte for byte, and a body altered by a single byte is refused.
// Run: node --test --test-concurrency=1 src/wallet.test.mjs   (no database, no Firebase)
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import http from 'node:http';
import { after, before, beforeEach, describe, test } from 'node:test';

import { verifyServiceToken } from '@bhakti/common';

import { createApp } from './app.js';
import { loadConfig } from './config.js';

const SECRET = 'test-secret-test-secret-1234';
const WEBHOOK_SECRET = 'whsec_test_fixture_value';
const logger = { info() {}, warn() {}, error() {} };
const verifyIdToken = async (t) => {
  if (t.startsWith('good-')) return { uid: t.slice(5), phone_number: '+919800000001', firebase: { sign_in_provider: 'phone' } };
  throw new Error('Decoding Firebase ID token failed');
};
const firebase = { ready: () => true, error: () => null, projectId: () => 'p' };
const hmac = (secret, data) => createHmac('sha256', secret).update(data).digest('hex');

let mono; let idn; let wal; let gw; let base;
let walCalls; let monoSeen; let walMode = 'up'; let blocked = false; let clock = 1_000_000;
let credits; // order id -> times credited (the stand-in wallet's own idempotency)
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
    if (/\/status$/.test(req.url)) return json(200, { exists: true, blocked, name: 'Asha', role: 'devotee' });
    json(200, {});
  });
  wal = await listen((req, res, raw, json) => {
    if (req.url === '/health') return json(walMode === 'down' ? 503 : 200, {});
    const u = new URL(req.url, 'http://x');
    const text = raw.toString('utf8');
    walCalls.push({ method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), claims: claimsOf(req), headers: req.headers, raw, body: /json/.test(req.headers['content-type'] || '') && text ? JSON.parse(text) : undefined });
    if (walMode === 'down') return req.socket.destroy();
    if (walMode === 'broken') return json(500, { error: 'Something went wrong.', code: 'internal' });
    if (walMode === 'badtoken') return json(401, { error: 'bad', code: 'bad_signature' });
    const uid = claimsOf(req)?.sub;
    if (u.pathname === '/internal/wallet/wallet') return json(200, { balance: uid === 'devotee1' ? 120 : 0 });
    if (u.pathname === '/internal/wallet/wallet/transactions') return json(200, { transactions: [{ id: '1', type: 'recharge', amount: 20, q: u.searchParams.get('limit') }] });
    if (u.pathname === '/internal/wallet/coins/packs') return json(200, { coinsPerRupee: 1, packs: [{ id: 'p1', coins: 30, price: 20 }] });
    if (u.pathname === '/internal/wallet/wallet/orders' && req.method === 'POST') {
      if (walMode === 'rzdown') return json(502, { error: 'Could not start the payment. Please try again.', code: 'payments_failed' });
      if (walMode === 'nopay') return json(503, { error: 'Buying coins is not available right now.', code: 'payments_unavailable' });
      return json(404 * (JSON.parse(text).packId === 'nope' ? 1 : 0) || 200, JSON.parse(text).packId === 'nope' ? { error: 'That coin pack is not available.', code: 'pack_not_found' } : { orderId: 'o1', provider: 'mock', amountPaise: 2000, currency: 'INR', coins: 30, price: 20 });
    }
    if (/^\/internal\/wallet\/wallet\/orders\/[^/]+\/verify$/.test(u.pathname)) {
      const b = JSON.parse(text || '{}');
      if (b.razorpaySignature === 'bad') return json(400, { error: 'Payment could not be verified.', code: 'bad_signature' });
      return json(200, { ok: true, balance: 150, coinsAdded: 30, forUid: uid });
    }
    if (u.pathname === '/internal/wallet/webhooks/razorpay' && req.method === 'POST') {
      // What the real wallet service does: HMAC over the RAW bytes it received, with the shared fixture secret; replay credits once.
      const sig = req.headers['x-razorpay-signature'];
      if (!sig || sig !== hmac(WEBHOOK_SECRET, raw)) return json(400, { error: 'Bad signature.', code: 'bad_signature' });
      const evt = JSON.parse(text);
      credits.set(evt.id, (credits.get(evt.id) ?? 0) + 1);
      return json(200, { ok: true, credited: credits.get(evt.id) === 1 });
    }
    json(404, { error: 'nope', code: 'not_found' });
  });
  const config = loadConfig({
    MONOLITH_URL: `http://127.0.0.1:${mono.address().port}`,
    IDENTITY_URL: `http://127.0.0.1:${idn.address().port}`,
    WALLET_URL: `http://127.0.0.1:${wal.address().port}`,
    INTERNAL_JWT_SECRET: SECRET,
    SERVICE_TIMEOUT_MS: '1000',
  });
  gw = http.createServer(createApp(config, { logger, verifyIdToken, firebase, now: () => clock }));
  await new Promise((r) => gw.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${gw.address().port}`;
});
after(() => { for (const s of [gw, mono, idn, wal]) s.closeAllConnections?.(); for (const s of [gw, mono, idn, wal]) s.close(); });
beforeEach(() => { walCalls = []; monoSeen = []; walMode = 'up'; blocked = false; credits = new Map(); clock += 60_000; });

async function call(method, path, { token, headers = {}, body, raw } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, body: json, text, headers: res.headers };
}

describe('the devotee routes (the uid is the signed sub; nothing reaches the monolith)', () => {
  test('GET /api/wallet and /api/wallet/transactions: the wallet\'s body, signed as this BFF for THIS devotee, query string kept', async () => {
    const r = await call('GET', '/api/wallet', { token: 'good-devotee1' });
    assert.deepEqual([r.status, r.body], [200, { balance: 120 }]);
    assert.deepEqual([walCalls[0].claims.iss, walCalls[0].claims.sub, walCalls[0].claims.role], ['mobile-bff', 'devotee1', 'devotee']);
    assert.equal(walCalls[0].path, '/internal/wallet/wallet');
    const t = await call('GET', '/api/wallet/transactions?limit=5&before=2026-01-01', { token: 'good-devotee1' });
    assert.equal(t.body.transactions[0].q, '5');
    assert.deepEqual(walCalls.at(-1).query, { limit: '5', before: '2026-01-01' });
    assert.equal(monoSeen.length, 0, 'the monolith was not involved');
  });

  test('a devotee only ever sees their own wallet: another token, another sub', async () => {
    assert.equal((await call('GET', '/api/wallet', { token: 'good-someone-else' })).body.balance, 0);
    assert.equal(walCalls.at(-1).claims.sub, 'someone-else');
  });

  test('no token -> 401 "missing bearer token"; a bad one -> 401; blocked -> 403; unavailable identity -> 503 - and the wallet is never called', async () => {
    assert.deepEqual((await call('GET', '/api/wallet')).body, { error: 'missing bearer token' });
    for (const [m, p] of [['GET', '/api/wallet'], ['GET', '/api/wallet/transactions'], ['POST', '/api/wallet/orders'], ['POST', '/api/wallet/orders/o1/verify']]) {
      assert.equal((await call(m, p, { token: 'junk', body: m === 'POST' ? {} : undefined })).status, 401, `${m} ${p}`);
    }
    blocked = true;
    clock += 3_600_000;
    for (const [m, p] of [['GET', '/api/wallet'], ['POST', '/api/wallet/orders']]) {
      const r = await call(m, p, { token: 'good-devotee1', body: m === 'POST' ? {} : undefined });
      assert.deepEqual([r.status, r.body], [403, { error: 'account blocked' }]);
    }
    assert.equal(walCalls.length, 0);
  });

  test('POST /api/wallet/orders and /verify: the body goes through untouched, the wallet\'s answer comes back unchanged (200 and every business error)', async () => {
    const o = await call('POST', '/api/wallet/orders', { token: 'good-devotee1', body: { packId: 'p1' } });
    assert.deepEqual([o.status, o.body.orderId, o.body.provider], [200, 'o1', 'mock']);
    assert.deepEqual(walCalls.at(-1).body, { packId: 'p1' });
    const nope = await call('POST', '/api/wallet/orders', { token: 'good-devotee1', body: { packId: 'nope' } });
    assert.deepEqual([nope.status, nope.body], [404, { error: 'That coin pack is not available.', code: 'pack_not_found' }]);
    const v = await call('POST', '/api/wallet/orders/o1/verify', { token: 'good-devotee1', body: { mock: true } });
    assert.deepEqual([v.status, v.body.ok, v.body.coinsAdded, v.body.forUid], [200, true, 30, 'devotee1']);
    assert.equal(walCalls.at(-1).path, '/internal/wallet/wallet/orders/o1/verify');
    const bad = await call('POST', '/api/wallet/orders/o1/verify', { token: 'good-devotee1', body: { razorpaySignature: 'bad' } });
    assert.deepEqual([bad.status, bad.body.code], [400, 'bad_signature']);
  });

  test('wallet answers that are NOT "unavailable" pass through with their status: 502 payments_failed, 503 payments_unavailable', async () => {
    walMode = 'rzdown';
    const a = await call('POST', '/api/wallet/orders', { token: 'good-devotee1', body: { packId: 'p1' } });
    assert.deepEqual([a.status, a.body.code], [502, 'payments_failed']);
    walMode = 'nopay';
    const b = await call('POST', '/api/wallet/orders', { token: 'good-devotee1', body: { packId: 'p1' } });
    assert.deepEqual([b.status, b.body.code], [503, 'payments_unavailable']);
  });

  test('wallet DOWN: every devotee route is 503 {error, code: "wallet_unavailable"} - not 500, not an empty balance - and a write is sent ONCE', async () => {
    for (const mode of ['down', 'broken']) {
      walMode = mode;
      walCalls = [];
      for (const [m, p] of [['GET', '/api/wallet'], ['GET', '/api/wallet/transactions'], ['POST', '/api/wallet/orders'], ['POST', '/api/wallet/orders/o1/verify']]) {
        const r = await call(m, p, { token: 'good-devotee1', body: m === 'POST' ? { packId: 'p1' } : undefined });
        assert.deepEqual([r.status, r.body], [503, { error: 'wallet_unavailable', code: 'wallet_unavailable' }], `${mode} ${m} ${p}`);
      }
      assert.equal(walCalls.filter((c) => c.method === 'POST').length, 2, `${mode}: the two POSTs were each sent once (a write is never retried here)`);
    }
  });

  test('OUR bad service token is a 502 wallet_auth_failed - never the wallet\'s 401 shown to the phone (the app would sign the devotee out)', async () => {
    walMode = 'badtoken';
    const r = await call('GET', '/api/wallet', { token: 'good-devotee1' });
    assert.deepEqual([r.status, r.body.code], [502, 'wallet_auth_failed']);
  });

  test('paths the wallet does not own still go to the monolith: bookings, chadhava orders, calls', async () => {
    assert.equal((await call('GET', '/api/bookings', { token: 'good-devotee1' })).body.via, 'monolith');
    assert.equal((await call('POST', '/api/chadhava/orders', { token: 'good-devotee1', body: {} })).body.via, 'monolith');
    assert.equal(walCalls.length, 0);
  });
});

describe('GET /api/coins/packs (public)', () => {
  test('needs no sign-in, ignores a bad bearer token, passes the wallet\'s body through', async () => {
    const r = await call('GET', '/api/coins/packs');
    assert.deepEqual([r.status, r.body.packs[0].coins, r.body.coinsPerRupee], [200, 30, 1]);
    assert.equal(walCalls.at(-1).claims.iss, 'mobile-bff');
    assert.equal((await call('GET', '/api/coins/packs', { token: 'junk' })).status, 200);
  });

  test('wallet down: the last good list for up to an hour, flagged x-degraded: wallet; never served after that, never for a list never seen', async () => {
    const good = await call('GET', '/api/coins/packs');
    walMode = 'down';
    const stale = await call('GET', '/api/coins/packs');
    assert.equal(stale.status, 200);
    assert.equal(stale.headers.get('x-degraded'), 'wallet');
    assert.equal(stale.text, good.text);
    clock += 3_600_000 + 1;
    const gone = await call('GET', '/api/coins/packs');
    assert.deepEqual([gone.status, gone.body.code], [503, 'wallet_unavailable']);
  });
});

describe('POST /api/webhooks/razorpay: raw bytes, signature header, nothing else', () => {
  const event = (id) => JSON.stringify({ id, event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1', amount: 2000 } } } });
  const post = (raw, signature, headers = {}) => call('POST', '/api/webhooks/razorpay', { raw, headers: { 'content-type': 'application/json', ...(signature ? { 'x-razorpay-signature': signature } : {}), ...headers } });

  test('a SIGNED fixture is valid through the BFF: the wallet received exactly the bytes that were signed, and the header unchanged', async () => {
    const raw = event('evt_1');
    const sig = hmac(WEBHOOK_SECRET, raw);
    const r = await post(raw, sig);
    assert.deepEqual([r.status, r.body], [200, { ok: true, credited: true }]);
    const seen = walCalls.at(-1);
    assert.ok(seen.raw.equals(Buffer.from(raw)), 'byte for byte');
    assert.equal(seen.headers['x-razorpay-signature'], sig);
    assert.equal(seen.headers['content-type'], 'application/json');
    assert.deepEqual([seen.claims.iss, seen.path], ['mobile-bff', '/internal/wallet/webhooks/razorpay']);
    assert.equal(monoSeen.length, 0);
  });

  test('bytes a JSON parser would change survive: odd whitespace, key order, unicode, a trailing newline, CRLF', async () => {
    for (const raw of [
      `{ "id" : "evt_ws",\n  "event":"payment.captured"  ,"payload":{}}\n`,
      '{"payload":{},"event":"order.paid","id":"evt_order"}',
      JSON.stringify({ id: 'evt_uni', event: 'x', note: 'भक्ति ☃', big: 12345678901234567890 }),
      '{"id":"evt_crlf",\r\n"event":"payment.captured"}\r\n',
    ]) {
      const r = await post(raw, hmac(WEBHOOK_SECRET, raw));
      assert.equal(r.status, 200, raw);
      assert.ok(walCalls.at(-1).raw.equals(Buffer.from(raw)));
    }
  });

  test('a body altered by ONE byte, a wrong signature or none are all refused by the wallet (400 bad_signature relayed unchanged) and credit nothing', async () => {
    const raw = event('evt_2');
    const sig = hmac(WEBHOOK_SECRET, raw);
    for (const [body, s] of [[raw.replace('2000', '2001'), sig], [raw, `${sig.slice(0, -1)}0`], [raw, 'nope'], [raw, undefined], [`${raw} `, sig]]) {
      const r = await post(body, s);
      assert.deepEqual([r.status, r.body], [400, { error: 'Bad signature.', code: 'bad_signature' }]);
    }
    assert.equal(credits.size, 0);
  });

  test('a replayed webhook is delivered every time and credits once (the wallet\'s idempotency, not the BFF\'s)', async () => {
    const raw = event('evt_replay');
    const sig = hmac(WEBHOOK_SECRET, raw);
    const rs = await Promise.all([post(raw, sig), post(raw, sig), post(raw, sig)]);
    assert.ok(rs.every((r) => r.status === 200));
    assert.equal(rs.filter((r) => r.body.credited).length, 1);
    assert.equal(credits.get('evt_replay'), 3, 'all three deliveries reached the wallet');
    assert.equal(walCalls.filter((c) => c.path.endsWith('/webhooks/razorpay')).length, 3);
  });

  test('a large and a chunked body arrive intact', async () => {
    const raw = JSON.stringify({ id: 'evt_big', event: 'x', pad: 'é'.repeat(200_000) });
    assert.equal((await post(raw, hmac(WEBHOOK_SECRET, raw))).status, 200);
    assert.ok(walCalls.at(-1).raw.equals(Buffer.from(raw)));
    const chunked = event('evt_chunked');
    const sig = hmac(WEBHOOK_SECRET, chunked);
    const r = await new Promise((resolve, reject) => {
      const u = new URL(`${base}/api/webhooks/razorpay`);
      const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { 'content-type': 'application/json', 'x-razorpay-signature': sig, 'transfer-encoding': 'chunked' } }, (res) => {
        let t = '';
        res.on('data', (c) => (t += c));
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(t) }));
      });
      req.on('error', reject);
      req.write(chunked.slice(0, 10));
      setTimeout(() => { req.write(chunked.slice(10)); req.end(); }, 30);
    });
    assert.deepEqual([r.status, r.body.ok], [200, true]);
  });

  test('the sender\'s cookie / authorization never reach the wallet - only this BFF\'s own signed token does', async () => {
    const raw = event('evt_hdr');
    await post(raw, hmac(WEBHOOK_SECRET, raw), { cookie: 'pooja_admin=secret', authorization: 'Bearer good-devotee1' });
    const seen = walCalls.at(-1).headers;
    assert.equal(seen.cookie, undefined);
    assert.deepEqual([claimsOf({ headers: { authorization: seen.authorization } }).iss, claimsOf({ headers: { authorization: seen.authorization } }).sub], ['mobile-bff', null]);
  });

  test('wallet down: 503 wallet_unavailable (so Razorpay retries); only POST exists', async () => {
    walMode = 'down';
    const raw = event('evt_down');
    const r = await post(raw, hmac(WEBHOOK_SECRET, raw));
    assert.deepEqual([r.status, r.body], [503, { error: 'wallet_unavailable', code: 'wallet_unavailable' }]);
    walMode = 'up';
    walCalls = [];
    assert.equal((await call('GET', '/api/webhooks/razorpay')).body.via, 'monolith', 'any other method falls through (to a monolith that answers 404)');
    assert.equal(walCalls.length, 0);
  });
});

describe('operator routes do not live on this BFF', () => {
  test('the dashboard\'s wallet paths fall through to the monolith (which refuses them)', async () => {
    for (const p of ['/api/admin/wallets', '/api/admin/coin-packs', '/api/admin/billing/rules', '/api/admin/coin-stats']) assert.equal((await call('GET', p)).body.via, 'monolith', p);
    assert.equal(walCalls.length, 0);
  });
});

describe('health and configuration', () => {
  test('/api/health reports degraded:["wallet"] while it is down (still 200), /health/deps is 503', async () => {
    assert.equal((await call('GET', '/api/health')).body.degraded, undefined);
    walMode = 'down';
    const h = await call('GET', '/api/health');
    assert.deepEqual([h.status, h.body.degraded], [200, ['wallet']]);
    assert.equal((await call('GET', '/health/deps')).status, 503);
  });

  const env = { MONOLITH_URL: 'http://m', INTERNAL_JWT_SECRET: SECRET };
  test('WALLET_URL needs the secret and (on this BFF) identity', () => {
    assert.throws(() => loadConfig({ ...env, WALLET_URL: 'http://w', INTERNAL_JWT_SECRET: 'short', IDENTITY_URL: 'http://i' }), /INTERNAL_JWT_SECRET/);
    assert.throws(() => loadConfig({ ...env, WALLET_URL: 'http://w' }), /IDENTITY_URL/);
    assert.equal(loadConfig({ ...env, WALLET_URL: 'http://w/', IDENTITY_URL: 'http://i' }).walletUrl, 'http://w');
  });

  test('unset: exactly the phase-3 BFF - the wallet paths are the monolith\'s', async () => {
    const c = loadConfig({ MONOLITH_URL: `http://127.0.0.1:${mono.address().port}`, INTERNAL_JWT_SECRET: SECRET });
    const g = http.createServer(createApp(c, { logger }));
    await new Promise((r) => g.listen(0, '127.0.0.1', r));
    const b = `http://127.0.0.1:${g.address().port}`;
    for (const p of ['/api/coins/packs', '/api/wallet', '/api/webhooks/razorpay']) assert.equal((await (await fetch(b + p, { method: p.includes('webhooks') ? 'POST' : 'GET' })).json()).via, 'monolith', p);
    assert.equal(c.walletUrl, '');
    g.closeAllConnections?.();
    g.close();
  });
});
