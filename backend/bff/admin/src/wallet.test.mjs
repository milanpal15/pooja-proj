// Phase 4: the admin BFF applies the area gate to the wallet-owned operator routes, forwards role/perms in the signed token, audits the
// writes, and serves the public coin packs and the Razorpay webhook. Stand-ins for the monolith, identity, engagement and wallet.
// Run: node --test --test-concurrency=1 src/wallet.test.mjs   (no database needed)
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import http from 'node:http';
import { after, before, beforeEach, describe, test } from 'node:test';

import { ENGAGEMENT_ADMIN_ROUTES, IDENTITY_ADMIN_ROUTES, WALLET_ADMIN_ROUTES, areaFor, hasPermission, permissionsFor, verifyServiceToken } from '@bhakti/common';

import { createApp } from './app.js';
import { loadConfig } from './config.js';

const SECRET = 'test-secret-test-secret-1234';
const COOKIE_SECRET = 'cookie-secret-cookie-secret-12';
const WEBHOOK_SECRET = 'whsec_test_fixture_value';
const quiet = { info() {}, warn() {}, error() {} };
const OPS = {
  aaaaaaaaaaaaaaaaaaaaaaaa: { username: 'root', role: 'admin', password: 'root-pass' },
  bbbbbbbbbbbbbbbbbbbbbbbb: { username: 'ed', role: 'editor', password: 'ed-pass' },
  cccccccccccccccccccccccc: { username: 'view', role: 'viewer', password: 'view-pass' },
};
const hmac = (secret, data) => createHmac('sha256', secret).update(data).digest('hex');

let mono; let idn; let wal; let gw; let base;
let walCalls; let audits; let monoSeen; let walMode = 'ok';
let clock = Date.now();
const claimsOf = (req) => { try { return verifyServiceToken(req.headers.authorization?.replace(/^Bearer /, ''), { secret: SECRET }); } catch { return null; } };

function listen(handler) {
  const s = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      handler(req, res, body, (code, b, h = {}) => { res.writeHead(code, { 'content-type': 'application/json', ...h }); res.end(JSON.stringify(b)); });
    });
  });
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r(s)));
}

before(async () => {
  mono = await listen((req, res, body, json) => {
    if (req.url === '/api/health') return json(200, { ok: true });
    monoSeen.push({ method: req.method, url: req.url, claims: claimsOf(req) });
    json(200, { via: 'monolith', path: req.url.split('?')[0] });
  });
  idn = await listen((req, res, body, json) => {
    if (req.url === '/health') return json(200, {});
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/internal/identity/operators/session') {
      const o = OPS[u.searchParams.get('id')];
      return json(200, o ? { required: true, authed: true, id: u.searchParams.get('id'), username: o.username, role: o.role, permissions: permissionsFor(o.role) } : { required: true, authed: false });
    }
    if (u.pathname === '/internal/identity/operators/login') {
      const b = JSON.parse(body.toString());
      const e = Object.entries(OPS).find(([, o]) => o.username === b.username && o.password === b.password);
      return e ? json(200, { id: e[0], username: e[1].username, role: e[1].role, permissions: permissionsFor(e[1].role) }) : json(401, { error: 'Wrong username or password', code: 'bad_credentials' });
    }
    if (u.pathname === '/internal/identity/audit') { audits.push({ claims: claimsOf(req), body: JSON.parse(body.toString()) }); return json(200, { ok: true }); }
    json(200, { identity: true });
  });
  wal = await listen((req, res, body, json) => {
    if (req.url === '/health') return json(walMode === 'down' ? 503 : 200, {});
    const u = new URL(req.url, 'http://x');
    const text = body.toString('utf8');
    walCalls.push({ method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), claims: claimsOf(req), headers: req.headers, raw: body, body: /json/.test(req.headers['content-type'] || '') && text ? JSON.parse(text) : undefined });
    if (walMode === 'down') return req.socket.destroy();
    if (walMode === 'badtoken') return json(401, { error: 'bad', code: 'bad_signature' });
    if (walMode === 'invalid' && req.method !== 'GET') return json(400, { error: 'A reason is required for every adjustment.', code: 'reason_required' });
    if (u.pathname === '/internal/wallet/coins/packs') return json(200, { coinsPerRupee: 1, packs: [{ id: 'p1' }] });
    if (u.pathname === '/internal/wallet/webhooks/razorpay') {
      const sig = req.headers['x-razorpay-signature'];
      return sig && sig === hmac(WEBHOOK_SECRET, body) ? json(200, { ok: true, credited: true }) : json(400, { error: 'Bad signature.', code: 'bad_signature' });
    }
    if (req.method === 'GET' || req.method === 'DELETE') return json(200, { wallet: true, method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams) });
    json(200, { wallet: true, method: req.method, path: u.pathname, echoed: text ? JSON.parse(text) : undefined });
  });
  const config = loadConfig({
    MONOLITH_URL: `http://127.0.0.1:${mono.address().port}`,
    IDENTITY_URL: `http://127.0.0.1:${idn.address().port}`,
    WALLET_URL: `http://127.0.0.1:${wal.address().port}`,
    INTERNAL_JWT_SECRET: SECRET, ADMIN_SESSION_SECRET: COOKIE_SECRET, SERVICE_TIMEOUT_MS: '1000',
  });
  gw = http.createServer(createApp(config, { logger: quiet, now: () => clock }));
  await new Promise((r) => gw.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${gw.address().port}`;
});
after(() => { for (const s of [gw, mono, idn, wal]) s.closeAllConnections?.(); for (const s of [gw, mono, idn, wal]) s.close(); });
beforeEach(() => { walCalls = []; audits = []; monoSeen = []; walMode = 'ok'; clock += 60_000; });

const settle = () => new Promise((r) => setTimeout(r, 80)); // audit POSTs are fire-and-forget
async function call(method, path, { headers = {}, body, raw } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, body: json, headers: res.headers, text };
}
const cookies = {};
async function as(role) {
  if (cookies[role]) return { cookie: cookies[role] };
  const name = { admin: 'root', editor: 'ed', viewer: 'view' }[role];
  const r = await call('POST', '/api/admin/login', { body: { username: name, password: `${name}-pass` } });
  assert.equal(r.status, 200, r.text);
  cookies[role] = r.headers.get('set-cookie').split(';')[0];
  return { cookie: cookies[role] };
}

describe('the route table (what this BFF hands to wallet)', () => {
  test('every route resolves to a MAPPED area, the one the table declares, with the right level; the wallet search also needs devotees:view', () => {
    for (const r of WALLET_ADMIN_ROUTES) {
      const a = areaFor(r.method, r.sample ?? r.path);
      assert.ok(a.mapped, `${r.method} ${r.path} has no entry in access/routes.js (it would be admin-only)`);
      assert.equal(a.area, r.area, `${r.method} ${r.path}`);
      assert.equal(a.level, r.method === 'GET' ? 'view' : 'edit');
    }
    assert.equal(areaFor('GET', '/admin/wallets').also, 'devotees:view');
    assert.equal(areaFor('GET', '/admin/wallet-transactions').also, undefined);
  });

  test('it does not take engagement\'s or identity\'s paths, and has the whole wallet/coins dashboard surface', () => {
    const mine = new Set(WALLET_ADMIN_ROUTES.map((r) => `${r.method} ${r.path}`));
    for (const other of [...ENGAGEMENT_ADMIN_ROUTES, ...IDENTITY_ADMIN_ROUTES]) assert.ok(!mine.has(`${other.method} ${other.path}`), `${other.method} ${other.path} belongs to another service`);
    assert.deepEqual([...mine].sort(), [
      'DELETE /admin/coin-packs/:id', 'GET /admin/billing/rules', 'GET /admin/coin-orders', 'GET /admin/coin-packs', 'GET /admin/coin-stats', 'GET /admin/wallet-transactions', 'GET /admin/wallets',
      'POST /admin/coin-packs', 'POST /admin/wallet/adjust', 'PUT /admin/billing/rules', 'PUT /admin/coin-packs/:id',
    ]);
  });
});

describe('the area gate, role by role, over every wallet route', () => {
  test('the full role x route matrix: admin everything; editor and viewer READ money / orders but never write, and never search devotees or the wallet ledger; a stranger 401', async () => {
    for (const r of WALLET_ADMIN_ROUTES) {
      const sample = r.sample ?? r.path;
      for (const role of ['admin', 'editor', 'viewer']) {
        const held = permissionsFor(role);
        const a = areaFor(r.method, sample);
        const allowed = hasPermission(held, `${a.area}:${a.level}`) && (!a.also || hasPermission(held, a.also));
        walCalls = [];
        const res = await call(r.method, `/api${sample}`, { headers: await as(role), body: r.method === 'GET' || r.method === 'DELETE' ? undefined : {} });
        if (allowed) {
          assert.equal(res.status, r.successStatus ?? 200, `${role} ${r.method} ${r.path}`);
          assert.equal(walCalls.length, 1);
        } else {
          assert.equal(res.status, 403, `${role} ${r.method} ${r.path}`);
          assert.equal(res.body.code, 'forbidden');
          assert.equal(walCalls.length, 0, 'a refused call never reaches wallet');
        }
      }
      const anon = await call(r.method, `/api${sample}`, { body: r.method === 'GET' ? undefined : {} });
      assert.equal(anon.status, 401, `anon ${r.method} ${r.path}`);
    }
  });

  test('the money-affecting writes are admin only (the roles the monolith enforces): adjust, packs, billing rules', async () => {
    for (const role of ['editor', 'viewer']) {
      for (const [m, p] of [['POST', '/api/admin/wallet/adjust'], ['POST', '/api/admin/coin-packs'], ['PUT', '/api/admin/coin-packs/000000000000000000000001'], ['DELETE', '/api/admin/coin-packs/000000000000000000000001'], ['PUT', '/api/admin/billing/rules']]) {
        const r = await call(m, p, { headers: await as(role), body: m === 'DELETE' ? undefined : { uid: 'u', amount: 99999, reason: 'x' } });
        assert.equal(r.status, 403, `${role} ${m} ${p}`);
      }
      assert.equal((await call('GET', '/api/admin/wallets?q=a', { headers: await as(role) })).status, 403, 'a wallet search is a search over names and phones');
      assert.equal((await call('GET', '/api/admin/wallet-transactions', { headers: await as(role) })).status, 200, 'the ledger is readable (masked by wallet)');
    }
    assert.equal(walCalls.filter((c) => c.method !== 'GET').length, 0);
  });
});

describe('forwarding', () => {
  test('wallet receives a token from admin-bff carrying the operator\'s id, role, perms and username; the body arrives as parsed JSON, the query string intact', async () => {
    const r = await call('POST', '/api/admin/wallet/adjust', { headers: await as('admin'), body: { uid: 'u1', amount: -5, reason: 'Reversal', requestId: 'r1' } });
    assert.equal(r.status, 200);
    const c = walCalls[0];
    assert.equal(c.path, '/internal/wallet/admin/wallet/adjust');
    assert.deepEqual([c.claims.iss, c.claims.sub, c.claims.role, c.claims.ctx.username], ['admin-bff', 'aaaaaaaaaaaaaaaaaaaaaaaa', 'admin', 'root']);
    assert.deepEqual(c.claims.perms, permissionsFor('admin'));
    assert.deepEqual(c.body, { uid: 'u1', amount: -5, reason: 'Reversal', requestId: 'r1' });
    const g = await call('GET', '/api/admin/wallet-transactions?type=adjustment&limit=5&uid=u1', { headers: await as('viewer') });
    assert.deepEqual(g.body.query, { type: 'adjustment', limit: '5', uid: 'u1' });
    assert.equal(walCalls.at(-1).claims.role, 'viewer');
    assert.deepEqual(walCalls.at(-1).claims.perms, permissionsFor('viewer'));
    const post = await call('POST', '/api/admin/coin-packs', { headers: await as('admin'), body: { coins: 30, price: 20 } });
    assert.equal(post.status, 201, 'a create answers 201 as the monolith does');
  });

  test('wallet\'s validation answers pass through unchanged (status, message, code)', async () => {
    walMode = 'invalid';
    const a = await call('POST', '/api/admin/wallet/adjust', { headers: await as('admin'), body: { uid: 'u1', amount: 5 } });
    assert.deepEqual([a.status, a.body], [400, { error: 'A reason is required for every adjustment.', code: 'reason_required' }]);
  });

  test('a token wallet rejects is OUR problem: 502, never a 401 that would sign the operator out; wallet down: a JSON 502 and the session is untouched', async () => {
    walMode = 'badtoken';
    const r = await call('GET', '/api/admin/coin-packs', { headers: await as('admin') });
    assert.equal(r.status, 502);
    walMode = 'down';
    clock += 20_000;
    const d = await call('GET', '/api/admin/coin-packs', { headers: await as('admin') });
    assert.deepEqual([d.status, d.body.code], [502, 'upstream_unavailable']);
    walMode = 'ok';
    clock += 20_000;
    assert.equal((await call('GET', '/api/admin/session', { headers: await as('admin') })).body.authed, true);
  });
});

describe('audit (every successful write, through identity)', () => {
  test('an adjustment is recorded with operator, role, area, method, path and status - and no body (the reason stays out of the log)', async () => {
    await call('POST', '/api/admin/wallet/adjust', { headers: await as('admin'), body: { uid: 'u1', amount: 50, reason: 'Goodwill for Priya', requestId: 'r2' } });
    await settle();
    const a = audits.find((x) => x.body.path === '/api/admin/wallet/adjust');
    assert.ok(a, JSON.stringify(audits));
    assert.deepEqual(a.body, { operator: 'root', role: 'admin', area: 'wallets', method: 'POST', path: '/api/admin/wallet/adjust', status: 200 });
    assert.equal(JSON.stringify(a).includes('Priya'), false);
    assert.equal(a.claims.iss, 'admin-bff');
  });

  test('pack and billing-rule writes are audited; reads, refusals and failures are not', async () => {
    const id = '6acf0a7fce86d1f7b8489916';
    await call('PUT', `/api/admin/coin-packs/${id}`, { headers: await as('admin'), body: { price: 25 } });
    await call('PUT', '/api/admin/billing/rules', { headers: await as('admin'), body: { minMinutes: 4 } });
    await settle();
    assert.deepEqual(audits.map((a) => [a.body.area, a.body.method, a.body.path, a.body.targetId]), [['money', 'PUT', `/api/admin/coin-packs/${id}`, id], ['money', 'PUT', '/api/admin/billing/rules', undefined]]);
    audits.length = 0;
    await call('GET', '/api/admin/coin-packs', { headers: await as('admin') });
    await call('POST', '/api/admin/wallet/adjust', { headers: await as('viewer'), body: {} });
    walMode = 'invalid';
    await call('POST', '/api/admin/wallet/adjust', { headers: await as('admin'), body: {} });
    await settle();
    assert.equal(audits.length, 0);
  });
});

describe('public: coin packs and the Razorpay webhook work here too (no session)', () => {
  test('GET /api/coins/packs needs no cookie and is served from wallet, stale-while-error', async () => {
    const r = await call('GET', '/api/coins/packs');
    assert.deepEqual([r.status, r.body.packs[0].id], [200, 'p1']);
    assert.equal(walCalls[0].claims.iss, 'admin-bff');
    walMode = 'down';
    const stale = await call('GET', '/api/coins/packs');
    assert.deepEqual([stale.status, stale.headers.get('x-degraded')], [200, 'wallet']);
  });

  test('the webhook is streamed byte for byte with its signature header: a signed fixture credits, an altered body is refused', async () => {
    const raw = `{ "event" : "payment.captured",\n "payload":{"payment":{"entity":{"order_id":"o","amount":2000}}} }\n`;
    const ok = await call('POST', '/api/webhooks/razorpay', { raw, headers: { 'content-type': 'application/json', 'x-razorpay-signature': hmac(WEBHOOK_SECRET, raw) } });
    assert.deepEqual([ok.status, ok.body], [200, { ok: true, credited: true }]);
    assert.ok(walCalls.at(-1).raw.equals(Buffer.from(raw)));
    assert.equal(walCalls.at(-1).claims.iss, 'admin-bff');
    const bad = await call('POST', '/api/webhooks/razorpay', { raw: raw.replace('2000', '2001'), headers: { 'content-type': 'application/json', 'x-razorpay-signature': hmac(WEBHOOK_SECRET, raw) } });
    assert.deepEqual([bad.status, bad.body.code], [400, 'bad_signature']);
    walMode = 'down';
    const down = await call('POST', '/api/webhooks/razorpay', { raw, headers: { 'content-type': 'application/json', 'x-razorpay-signature': hmac(WEBHOOK_SECRET, raw) } });
    assert.deepEqual([down.status, down.body.code], [503, 'wallet_unavailable']);
  });

  test('the devotee wallet routes are the mobile BFF\'s: here they reach the monolith\'s gate (a stranger meets a 401/404), never wallet', async () => {
    for (const [m, p] of [['GET', '/api/wallet'], ['POST', '/api/wallet/orders'], ['POST', '/api/wallet/orders/o1/verify']]) {
      await call(m, p, { body: m === 'POST' ? {} : undefined });
    }
    assert.equal(walCalls.length, 0);
    assert.equal(monoSeen.length, 3);
  });
});

describe('without IDENTITY_URL (legacy): the monolith still owns the session and the audit log', () => {
  let legacyMono; let legacy; let lbase; let monoAudits;
  before(async () => {
    legacyMono = await listen((req, res, body, json) => {
      if (req.url === '/api/health') return json(200, { ok: true });
      if (req.url === '/api/admin/session') return json(200, /pooja_admin=ed/.test(req.headers.cookie || '') ? { required: true, authed: true, username: 'ed', role: 'editor', permissions: permissionsFor('editor') } : { required: true, authed: false });
      if (req.url === '/internal/audit') { monoAudits.push(JSON.parse(body.toString())); return json(200, { ok: true }); }
      json(200, { via: 'monolith' });
    });
    const config = loadConfig({ MONOLITH_URL: `http://127.0.0.1:${legacyMono.address().port}`, WALLET_URL: `http://127.0.0.1:${wal.address().port}`, INTERNAL_JWT_SECRET: SECRET, SERVICE_TIMEOUT_MS: '1000' });
    legacy = http.createServer(createApp(config, { logger: quiet }));
    await new Promise((r) => legacy.listen(0, '127.0.0.1', r));
    lbase = `http://127.0.0.1:${legacy.address().port}`;
    monoAudits = [];
  });
  after(() => { for (const s of [legacy, legacyMono]) s.closeAllConnections?.(); for (const s of [legacy, legacyMono]) s.close(); });

  test('gate here, session from the monolith, audit through the monolith', async () => {
    const ed = { cookie: 'pooja_admin=ed' };
    assert.equal((await fetch(`${lbase}/api/admin/coin-packs`)).status, 401);
    assert.equal((await fetch(`${lbase}/api/admin/coin-packs`, { headers: ed })).status, 200);
    assert.equal((await fetch(`${lbase}/api/admin/coin-packs`, { method: 'POST', headers: { ...ed, 'content-type': 'application/json' }, body: '{}' })).status, 403, 'an editor never writes money');
    assert.equal((await fetch(`${lbase}/api/admin/wallet-transactions`, { headers: ed })).status, 200);
    await settle();
    assert.equal(monoAudits.length, 0);
  });
});

describe('configuration', () => {
  test('WALLET_URL needs the secret; unset leaves the BFF as before', () => {
    const env = { MONOLITH_URL: 'http://m', INTERNAL_JWT_SECRET: SECRET };
    assert.throws(() => loadConfig({ ...env, INTERNAL_JWT_SECRET: '', WALLET_URL: 'http://w' }), /INTERNAL_JWT_SECRET/);
    assert.equal(loadConfig({ ...env, WALLET_URL: 'http://w/' }).walletUrl, 'http://w');
    assert.equal(loadConfig(env).walletUrl, '');
  });

  test('unset: the wallet paths are the monolith\'s', async () => {
    const c = loadConfig({ MONOLITH_URL: `http://127.0.0.1:${mono.address().port}`, INTERNAL_JWT_SECRET: SECRET });
    const g = http.createServer(createApp(c, { logger: quiet }));
    await new Promise((r) => g.listen(0, '127.0.0.1', r));
    const b = `http://127.0.0.1:${g.address().port}`;
    assert.equal((await (await fetch(`${b}/api/coins/packs`)).json()).via, 'monolith');
    g.closeAllConnections?.();
    g.close();
  });

  test('/api/health reports degraded:["wallet"] while it is down', async () => {
    walMode = 'down';
    const h = await call('GET', '/api/health');
    assert.deepEqual([h.status, h.body.degraded], [200, ['wallet']]);
  });
});
