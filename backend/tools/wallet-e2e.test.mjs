// The Razorpay path end to end across REAL code: mobile BFF (raw streaming) -> the real wallet service (signature over the raw bytes,
// idempotent credit, ledger) on a throwaway MongoDB. The only stand-ins are the monolith / identity (never reached by these routes) and
// Razorpay's order API. Test values only - no key here is real and no request leaves the machine.
// Run: TEST_MONGODB_URI=mongodb://127.0.0.1:27231/x node --test --test-concurrency=1 tools/wallet-e2e.test.mjs
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import http from 'node:http';
import { after, before, describe, test } from 'node:test';

import mongoose from 'mongoose';

import { createApp as createMobile } from '../bff/mobile/src/app.js';
import { loadConfig as mobileConfig } from '../bff/mobile/src/config.js';
import { createApp as createAdmin } from '../bff/admin/src/app.js';
import { loadConfig as adminConfig } from '../bff/admin/src/config.js';
import { seedWallet } from '../services/wallet/src/seed.js';
import { WalletTxn, CoinOrder } from '../services/wallet/src/models.js';
import { SECRET, boot } from '../services/wallet/src/test-kit.mjs';

const KEY_ID = 'rzp_test_e2efixture';
const KEY_SECRET = 'e2e-key-secret-fixture';
const WEBHOOK = 'e2e-webhook-secret-fixture';
const hmac = (secret, data) => createHmac('sha256', secret).update(data).digest('hex');
const quiet = { info() {}, warn() {}, error() {} };
const listen = (handler) => new Promise((ok) => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => ok(s)); });

let wallet; let mobile; let admin; let mono; let idn; let mBase; let aBase; let n = 0;

before(async () => {
  const razorpay = async (_u, init) => new Response(JSON.stringify({ id: `order_E2E${++n}`, amount: JSON.parse(init.body).amount }), { status: 200 });
  wallet = await boot('wallet_e2e_tests', { fetchImpl: razorpay, extra: { PAYMENTS_PROVIDER: 'razorpay', RAZORPAY_KEY_ID: KEY_ID, RAZORPAY_KEY_SECRET: KEY_SECRET, RAZORPAY_WEBHOOK_SECRET: WEBHOOK } });
  await seedWallet();
  mono = await listen((req, res) => { req.resume(); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"via":"monolith"}'); });
  idn = await listen((req, res) => { req.resume(); res.writeHead(200, { 'content-type': 'application/json' }); res.end(/status$/.test(req.url) ? '{"exists":true,"blocked":false,"name":"Asha","role":"devotee"}' : '{}'); });
  const common = { MONOLITH_URL: `http://127.0.0.1:${mono.address().port}`, IDENTITY_URL: `http://127.0.0.1:${idn.address().port}`, WALLET_URL: wallet.url, INTERNAL_JWT_SECRET: SECRET, SERVICE_TIMEOUT_MS: '3000' };
  const verifyIdToken = async (t) => { if (t.startsWith('good-')) return { uid: t.slice(5), firebase: { sign_in_provider: 'phone' } }; throw new Error('bad token'); };
  const firebase = { ready: () => true, error: () => null, projectId: () => 'p' };
  mobile = http.createServer(createMobile(mobileConfig(common), { logger: quiet, verifyIdToken, firebase }));
  admin = http.createServer(createAdmin(adminConfig({ ...common, ADMIN_SESSION_SECRET: 'cookie-secret-cookie-secret-12' }), { logger: quiet }));
  await Promise.all([mobile, admin].map((s) => new Promise((ok) => s.listen(0, '127.0.0.1', ok))));
  mBase = `http://127.0.0.1:${mobile.address().port}`;
  aBase = `http://127.0.0.1:${admin.address().port}`;
});
after(async () => {
  for (const s of [mobile, admin, mono, idn]) { s.closeAllConnections?.(); s.close(); }
  await wallet.stop();
});

const api = async (base, method, path, { token, raw, body, headers = {} } = {}) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, body: json, headers: res.headers };
};
const buy = async (token, coins = 120) => {
  const packs = (await api(mBase, 'GET', '/api/coins/packs')).body.packs;
  return (await api(mBase, 'POST', '/api/wallet/orders', { token, body: { packId: packs.find((p) => p.coins === coins).id } })).body;
};
const captured = (o, id = 'pay_e2e', amount = o.amountPaise) => `{ "entity":"event", "event":"payment.captured",\n  "payload": { "payment": { "entity": { "id": "${id}", "order_id": "${o.razorpayOrderId}", "amount": ${amount} } } } }\n`;
const balance = async (token) => (await api(mBase, 'GET', '/api/wallet', { token })).body.balance;

describe('buying coins and the webhook, through the real BFF and the real wallet service', () => {
  test('packs and order creation come back in the monolith\'s shapes', async () => {
    const packs = await api(mBase, 'GET', '/api/coins/packs');
    assert.deepEqual([packs.status, packs.body.packs.length, packs.body.coinsPerRupee], [200, 6, 1]);
    const o = await buy('good-e2e1');
    assert.deepEqual(Object.keys(o), ['orderId', 'provider', 'razorpayOrderId', 'keyId', 'amountPaise', 'currency', 'coins', 'price']);
    assert.deepEqual([o.provider, o.keyId, o.amountPaise], ['razorpay', KEY_ID, 10000]);
  });

  test('a SIGNED webhook credits exactly once; a replay (and a parallel burst) credits nothing more', async () => {
    const o = await buy('good-e2e2');
    const raw = captured(o);
    const sig = hmac(WEBHOOK, raw);
    const send = () => api(mBase, 'POST', '/api/webhooks/razorpay', { raw, headers: { 'content-type': 'application/json', 'x-razorpay-signature': sig } });
    const first = await send();
    assert.deepEqual([first.status, first.body], [200, { ok: true, credited: true }]);
    assert.equal(await balance('good-e2e2'), 120);
    const burst = await Promise.all([send(), send(), send(), send()]);
    for (const r of burst) assert.deepEqual([r.status, r.body], [200, { ok: true, credited: false }]);
    assert.equal(await balance('good-e2e2'), 120);
    assert.equal(await WalletTxn.countDocuments({ uid: 'e2e2', type: 'recharge', status: 'posted' }), 1);
    assert.equal((await CoinOrder.findById(o.orderId)).status, 'paid');
  });

  test('a bad signature, an altered body and a missing signature are refused (400 bad_signature) and credit nothing', async () => {
    const o = await buy('good-e2e3');
    const raw = captured(o);
    const sig = hmac(WEBHOOK, raw);
    const post = (r, s) => api(mBase, 'POST', '/api/webhooks/razorpay', { raw: r, headers: { 'content-type': 'application/json', ...(s ? { 'x-razorpay-signature': s } : {}) } });
    for (const [r, s] of [[raw, 'deadbeef'], [raw.replace('payment.captured', 'payment.capturee'), sig], [raw.trimEnd(), sig], [raw, undefined], [raw, hmac('another-secret', raw)]]) {
      const x = await post(r, s);
      assert.deepEqual([x.status, x.body.code], [400, 'bad_signature']);
    }
    assert.equal(await balance('good-e2e3'), 0);
    assert.equal((await CoinOrder.findById(o.orderId)).status, 'created');
  });

  test('the webhook reaches the wallet through the ADMIN BFF too (the URL Razorpay was given may point at either), with the same result', async () => {
    const o = await buy('good-e2e4');
    const raw = captured(o);
    const ok = await api(aBase, 'POST', '/api/webhooks/razorpay', { raw, headers: { 'content-type': 'application/json', 'x-razorpay-signature': hmac(WEBHOOK, raw) } });
    assert.deepEqual([ok.status, ok.body], [200, { ok: true, credited: true }]);
    const bad = await api(aBase, 'POST', '/api/webhooks/razorpay', { raw, headers: { 'content-type': 'application/json', 'x-razorpay-signature': 'x' } });
    assert.equal(bad.status, 400);
    assert.equal(await balance('good-e2e4'), 120);
  });

  test('verify and the webhook both firing credit once, whichever arrives first', async () => {
    for (const verifyFirst of [true, false]) {
      const token = `good-e2e5${verifyFirst}`;
      const o = await buy(token);
      const raw = captured(o, 'pay_vf');
      const hook = () => api(mBase, 'POST', '/api/webhooks/razorpay', { raw, headers: { 'content-type': 'application/json', 'x-razorpay-signature': hmac(WEBHOOK, raw) } });
      const verify = () => api(mBase, 'POST', `/api/wallet/orders/${o.orderId}/verify`, { token, body: { razorpayPaymentId: 'pay_vf', razorpaySignature: hmac(KEY_SECRET, `${o.razorpayOrderId}|pay_vf`) } });
      if (verifyFirst) { await verify(); await hook(); } else { await hook(); await verify(); }
      await Promise.all([verify(), hook()]);
      assert.equal(await balance(token), 120, `verifyFirst=${verifyFirst}`);
      assert.equal(await WalletTxn.countDocuments({ uid: `e2e5${verifyFirst}`, type: 'recharge' }), 1);
    }
  });

  test('the monolith is never asked for any of it', async () => {
    const seen = [];
    mono.on('request', (req) => seen.push(req.url));
    await balance('good-e2e1');
    await api(mBase, 'GET', '/api/wallet/transactions', { token: 'good-e2e1' });
    await api(mBase, 'GET', '/api/coins/packs');
    assert.deepEqual(seen, []);
  });
});
