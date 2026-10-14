// The outbound clients, with a fake fetch: identity directory (cache, degrade to absent, the best-effort role write), the settings reader (money
// rules fail closed, the ring timeout is lenient), push (device -> token -> Expo, never throws), wallet (ambiguity, business answers, the refund proof).
// Run: node --test src/clients.test.mjs   (no database needed)
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createIdentityDirectory } from './lib/identity.js';
import { createPush } from './lib/push.js';
import { createSettingsReader } from './lib/settings.js';
import { createWalletClient } from './lib/wallet.js';
import { loadConfig } from './config.js';
import { testConfig } from './test-kit.mjs';

const cfg = { ...testConfig('clients_unused'), walletTimeoutMs: 150, serviceTimeoutMs: 150 };
const res = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
const log = () => { const l = []; return { l, warn: (m) => l.push(['warn', m]), error: (m) => l.push(['error', m]), info() {} }; };

describe('config', () => {
  test('the required services are required; the audio settings are read here (and trimmed), not by process.env elsewhere', () => {
    const base = { INTERNAL_JWT_SECRET: 'x'.repeat(16), WALLET_URL: 'http://w/', IDENTITY_URL: 'http://i', ENGAGEMENT_URL: 'http://e' };
    for (const k of ['WALLET_URL', 'IDENTITY_URL', 'ENGAGEMENT_URL', 'INTERNAL_JWT_SECRET']) {
      const { [k]: _gone, ...rest } = base;
      assert.throws(() => loadConfig(rest), new RegExp(k));
    }
    assert.throws(() => loadConfig({ ...base, INTERNAL_JWT_SECRET: 'short' }), /16 characters/);
    const c = loadConfig({ ...base, RTC_PROVIDER: 'agora', AGORA_APP_ID: ' abc ', AGORA_APP_CERTIFICATE: ' def ', NODE_ENV: 'production' });
    assert.equal(c.walletUrl, 'http://w');
    assert.deepEqual({ ...c.rtcEnv }, { NODE_ENV: 'production', RTC_PROVIDER: 'agora', AGORA_APP_ID: 'abc', AGORA_APP_CERTIFICATE: 'def' });
    assert.deepEqual([c.port, c.dbName, c.tickEveryMs, c.silenceMs, c.allowedIssuers], [4080, 'calls', 5000, 90_000, ['mobile-bff', 'admin-bff', 'identity']]);
    assert.ok(Object.isFrozen(c));
  });
});

describe('identity directory', () => {
  test('names / device ids are cached 15 s; the signed token\'s name needs no call; an unknown uid is cached too', async () => {
    const calls = [];
    let t = 1_000_000;
    const d = createIdentityDirectory(cfg, { now: () => t, fetchImpl: async (u) => { calls.push(String(u)); return /unknown/.test(u) ? res(404, { error: 'nf', code: 'not_found' }) : res(200, { user: { uid: 'u1', name: 'Asha', deviceId: 'dev1' } }); } });
    assert.equal(await d.userName('u1', 'Hint Name'), 'Hint Name');
    assert.equal(calls.length, 0);
    assert.equal(await d.userName('u1', ''), 'Asha');
    assert.equal(await d.deviceIdOf('u1'), 'dev1');
    assert.equal(calls.length, 1);
    assert.equal(await d.userName('unknown', undefined), '');
    assert.equal(await d.userName('unknown', undefined), '');
    assert.equal(calls.length, 2);
    t += 16_000;
    await d.userName('u1');
    assert.equal(calls.length, 3);
    assert.match(calls[0], /\/internal\/identity\/directory\/users\/u1$/);
  });

  test('setRole is a signed PUT to identity\'s directory, best effort: identity down is logged, never thrown', async () => {
    let seen;
    const d = createIdentityDirectory(cfg, { fetchImpl: async (u, init) => { seen = { u: String(u), init }; return res(200, { ok: true }); } });
    await d.setRole('uid 1', 'astrologer');
    assert.match(seen.u, /\/internal\/identity\/directory\/users\/uid%201\/role$/);
    assert.equal(seen.init.method, 'PUT');
    assert.deepEqual(JSON.parse(seen.init.body), { role: 'astrologer' });
    assert.equal(JSON.parse(Buffer.from(seen.init.headers.authorization.split('.')[1], 'base64url')).iss, 'calls');
    const l = log();
    const down = createIdentityDirectory(cfg, { logger: l, fetchImpl: async () => { throw new Error('refused'); } });
    await down.setRole('u1', 'devotee');
    await down.setRole('', 'devotee');
    assert.ok(l.l.some(([k, m]) => k === 'error' && /could not set the devotee role for u1/.test(m)));
  });

  test('identity down: stale value kept, else absent; the next 5 s skip the network - never an error', async () => {
    let up = true; let n = 0; let t = 5_000_000;
    const d = createIdentityDirectory(cfg, { logger: log(), now: () => t, fetchImpl: async () => { n++; if (!up) throw new Error('refused'); return res(200, { user: { uid: 'u1', name: 'Asha' } }); } });
    assert.equal(await d.userName('u1'), 'Asha');
    up = false; t += 16_000;
    assert.equal(await d.userName('u1'), 'Asha', 'stale on error');
    assert.equal(await d.userName('never-cached'), '');
    const before = n;
    assert.equal(await d.userName('another'), '');
    assert.equal(n, before, 'inside the back-off window the network is not touched');
  });
});

describe('settings reader', () => {
  const mk = (handler, o = {}) => {
    let t = 10_000_000;
    const r = createSettingsReader(cfg, { logger: log(), now: () => t, fetchImpl: handler, ...o });
    return { r, tick: (ms) => { t += ms; } };
  };

  test('fresh reads: cached 15 s, then asked again; engagement down = 503 settings_unavailable (never a default) once the answer is stale or absent', async () => {
    let n = 0; let up = true;
    const { r, tick } = mk(async () => { n++; if (!up) throw new Error('down'); return res(200, { settings: { minMinutes: '5', callsEnabled: 'false', ringTimeoutSec: 'junk' } }); });
    assert.equal(await r.getNumber('minMinutes', 3), 5);
    assert.equal(await r.getBool('callsEnabled', true), false);
    assert.equal(n, 1);
    assert.equal(await r.getNumber('ringTimeoutSec', 25), 25, 'a value that is present but unparseable = the documented default (operator state, not a guess)');
    assert.equal(await r.getNumber('payoutPaisePerCoin', 100), 100, 'absent from a map that WAS read = the default');
    up = false; tick(16_000);
    await assert.rejects(() => r.getNumber('minMinutes', 3), (e) => e.status === 503 && e.code === 'settings_unavailable');
    await assert.rejects(() => r.getBool('callsEnabled', true), (e) => e.code === 'settings_unavailable');
    const fresh = mk(async () => { throw new Error('down'); });
    await assert.rejects(() => fresh.r.getNumber('minMinutes', 3), (e) => e.code === 'settings_unavailable');
  });

  test('lenient reads (the ring timeout): the last answer of ANY age, else the fallback - never throws', async () => {
    let up = true;
    const { r, tick } = mk(async () => { if (!up) throw new Error('down'); return res(200, { settings: { ringTimeoutSec: '40' } }); });
    assert.equal(await r.getNumber('ringTimeoutSec', 25, { lenient: true }), 40);
    up = false; tick(60_000);
    assert.equal(await r.getNumber('ringTimeoutSec', 25, { lenient: true }), 40, 'stale but known');
    await new Promise((ok) => setTimeout(ok, 20));
    const never = mk(async () => { throw new Error('down'); });
    assert.equal(await never.r.getNumber('ringTimeoutSec', 25, { lenient: true }), 25, 'nothing ever read: the documented default');
  });

  test('pushToken: a device\'s token, or null on any failure', async () => {
    assert.equal(await mk(async () => res(200, { pushToken: 'ExponentPushToken[x]' })).r.pushToken('d 1'), 'ExponentPushToken[x]');
    assert.equal(await mk(async () => { throw new Error('x'); }).r.pushToken('d1'), null);
    let url; await mk(async (u) => { url = String(u); return res(200, { pushToken: null }); }).r.pushToken('d 1');
    assert.match(url, /\/internal\/engagement\/visitors\/d%201\/push-token$/);
  });
});

describe('push', () => {
  const mk = (handler, { throwingIdentity = false, token = 'ExponentPushToken[abc]' } = {}) => {
    const seen = [];
    const identity = { deviceIdOf: async (uid) => { if (throwingIdentity) throw new Error('boom'); return uid === 'a1' ? 'dev1' : undefined; } };
    const settings = { pushToken: async () => token };
    const push = createPush({ ...cfg, expoPushUrl: 'http://expo.test/send' }, { identity, settings, logger: log(), fetchImpl: async (u, init) => { seen.push({ u: String(u), init }); return handler(String(u), init); } });
    return { push, seen };
  };

  test('device -> token -> Expo: the body names the first name; no device or no ExponentPushToken means nothing is sent', async () => {
    const m = mk(() => res(200, {}));
    await m.push._send('a1', 'Asha');
    assert.equal(m.seen.length, 1);
    assert.deepEqual(JSON.parse(m.seen[0].init.body), { to: 'ExponentPushToken[abc]', title: 'Incoming call', body: 'Asha is calling', data: { type: 'incoming_call' }, priority: 'high' });
    await m.push._send('a1', '');
    assert.equal(JSON.parse(m.seen[1].init.body).body, 'A devotee is calling');
    await m.push._send('nobody', 'X');
    await mk(() => res(200, {}), { token: 'not-a-token' }).push._send('a1', 'X');
    assert.equal(m.seen.length, 2);
  });

  test('notifyIncomingCall never throws and never rejects: Expo down, identity exploding', async () => {
    for (const m of [mk(() => { throw new Error('expo down'); }), mk(() => res(200, {}), { throwingIdentity: true })]) {
      assert.equal(m.push.notifyIncomingCall('a1', 'Asha'), undefined);
      await new Promise((r) => setTimeout(r, 30));
    }
  });
});

describe('wallet client', () => {
  test('a refund needs ofKey (or, for the monolith\'s legacy goodwill only, a reason); a debit needs a key; the token is signed by `calls`', async () => {
    let seen;
    const w = createWalletClient(cfg, { fetchImpl: async (u, init) => { seen = { u: String(u), init }; return res(200, { txn: { id: 't1' }, balance: 5 }); } });
    await assert.rejects(() => w.refund({ uid: 'u', amount: 1, idempotencyKey: 'k' }), (e) => e.status === 400 && e.code === 'ofkey_required');
    await assert.rejects(() => w.debit({ uid: 'u', amount: 1, type: 'call_debit' }), (e) => e.code === 'no_key');
    assert.equal(seen, undefined, 'a call with no proof never leaves the process');
    const out = await w.refund({ uid: 'u', amount: 1, idempotencyKey: 'k', ofKey: 'd', refType: 'call', refId: 'c1' });
    assert.deepEqual([out.txn._id, out.balance, out.duplicate], ['t1', 5, false]);
    assert.deepEqual(JSON.parse(seen.init.body), { uid: 'u', amount: 1, key: 'k', ofKey: 'd', refType: 'call', refId: 'c1' });
    assert.equal(JSON.parse(Buffer.from(seen.init.headers.authorization.split('.')[1], 'base64url')).iss, 'calls');
    await w.refund({ uid: 'u', amount: 4, idempotencyKey: 'call:c:goodwill:r', reason: 'echo', refType: 'call' });
    assert.deepEqual(JSON.parse(seen.init.body), { uid: 'u', amount: 4, key: 'call:c:goodwill:r', reason: 'echo', refType: 'call' });
  });

  test('a debit carries the idempotency key as `key` and the refId as a string', async () => {
    let seen;
    const w = createWalletClient(cfg, { fetchImpl: async (u, init) => { seen = { u: String(u), body: JSON.parse(init.body) }; return res(200, { txn: { id: 't' }, balance: 1 }); } });
    await w.debit({ uid: 'u', amount: 10, type: 'call_debit', refType: 'call', refId: { toString: () => 'abc' }, idempotencyKey: 'call:abc:min:1', note: 'n' });
    assert.match(seen.u, /\/internal\/wallet\/debit$/);
    assert.deepEqual(seen.body, { uid: 'u', amount: 10, key: 'call:abc:min:1', type: 'call_debit', refType: 'call', refId: 'abc', note: 'n' });
  });

  test('business answers keep their code and extras; every non-answer is ambiguous 503; a refused token is OUR fault (503, not a business answer)', async () => {
    const w = (f) => createWalletClient(cfg, { logger: log(), fetchImpl: f });
    await assert.rejects(() => w(async () => res(402, { error: 'Not enough coins.', code: 'insufficient_coins', needed: 10, balance: 1, shortfall: 9, type: 'call_debit' })).debit({ uid: 'u', amount: 10, type: 'call_debit', idempotencyKey: 'k' }),
      (e) => e.status === 402 && e.code === 'insufficient_coins' && e.extra.shortfall === 9 && !e.ambiguous);
    await assert.rejects(() => w(async () => res(409, { error: 'x', code: 'already_refunded' })).refund({ uid: 'u', amount: 1, idempotencyKey: 'k', ofKey: 'd' }), (e) => e.status === 409 && e.code === 'already_refunded');
    for (const f of [async () => res(500, {}), async () => { throw new Error('reset'); }, async () => res(200, '<html/>'), async () => res(401, { code: 'bad_signature' }), async () => res(403, { code: 'wrong_issuer' }), async () => res(404, '<h1>x</h1>'), (_u, init) => new Promise((_ok, no) => init.signal.addEventListener('abort', () => no(Object.assign(new Error('aborted'), { name: 'TimeoutError' }))))]) {
      await assert.rejects(() => w(f).getBalance('u'), (e) => e.status === 503 && e.code === 'wallet_unavailable' && e.ambiguous === true);
    }
    assert.equal(await w(async () => { throw new Error('x'); }).balanceOrUndefined('u'), undefined);
  });
});
