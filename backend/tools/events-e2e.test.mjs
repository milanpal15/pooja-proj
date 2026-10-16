// Event rewards end to end across REAL code: mobile BFF -> the real events service (registration, completion engine, sweeper) -> the real
// wallet service (the `events` caller box: type bonus, `event-` keys) on one throwaway MongoDB. Stand-ins: the monolith and identity (never
// reached by these routes) and Firebase. Both services share this process's mongoose connection, so they share one database (their
// collections do not overlap).
// Run: TEST_MONGODB_URI=mongodb://127.0.0.1:27231/x node --test --test-concurrency=1 tools/events-e2e.test.mjs
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, test } from 'node:test';

import { createApp as createMobile } from '../bff/mobile/src/app.js';
import { loadConfig as mobileConfig } from '../bff/mobile/src/config.js';
import { createApp as createEvents } from '../services/events/src/app.js';
import { loadConfig as eventsConfig } from '../services/events/src/config.js';
import { sweep } from '../services/events/src/engine/rewards.js';
import { Badge, Event, UserBadge } from '../services/events/src/models/index.js';
import { seedEvents } from '../services/events/src/seed.js';
import { WalletTxn } from '../services/wallet/src/models.js';
import { seedWallet } from '../services/wallet/src/seed.js';
import { SECRET, boot } from '../services/wallet/src/test-kit.mjs';

const quiet = { info() {}, warn() {}, error() {} };
const listen = (handler) => new Promise((ok) => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => ok(s)); });

let wallet; let events; let eventsApp; let mobile; let mono; let idn; let base;
let walletUp = true; let clock = new Date('2026-03-10T06:00:00Z');
const walletProxy = {}; // a switchable front for the wallet so a test can take it down

before(async () => {
  wallet = await boot('events_wallet_e2e_tests');
  await seedWallet();
  const { default: mongoose } = await import('mongoose');
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  await seedEvents();
  await Badge.create({ slug: 'pilgrim', name: 'Pilgrim', nameHi: 'यात्री' });
  walletProxy.server = await listen((req, res) => {
    if (!walletUp) return req.socket.destroy();
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      const out = await fetch(`${wallet.url}${req.url}`, { method: req.method, headers: { authorization: req.headers.authorization, 'content-type': 'application/json' }, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
      res.writeHead(out.status, { 'content-type': 'application/json' });
      res.end(await out.text());
    });
  });
  const walletUrl = `http://127.0.0.1:${walletProxy.server.address().port}`;
  eventsApp = createEvents(eventsConfigFor(walletUrl), { isReady: () => true, logger: quiet, catalog: { exists: async () => true }, now: () => clock });
  events = await listen(eventsApp);
  mono = await listen((req, res) => { req.resume(); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"via":"monolith"}'); });
  idn = await listen((req, res) => { req.resume(); res.writeHead(200, { 'content-type': 'application/json' }); res.end(/status$/.test(req.url) ? '{"exists":true,"blocked":false,"name":"Asha","role":"devotee"}' : '{}'); });
  const common = {
    MONOLITH_URL: `http://127.0.0.1:${mono.address().port}`, IDENTITY_URL: `http://127.0.0.1:${idn.address().port}`, WALLET_URL: wallet.url,
    EVENTS_URL: `http://127.0.0.1:${events.address().port}`, INTERNAL_JWT_SECRET: SECRET, SERVICE_TIMEOUT_MS: '3000',
  };
  const verifyIdToken = async (t) => { if (t.startsWith('good-')) return { uid: t.slice(5), firebase: { sign_in_provider: 'phone' } }; throw new Error('bad token'); };
  const firebase = { ready: () => true, error: () => null, projectId: () => 'p' };
  mobile = http.createServer(createMobile(mobileConfig(common), { logger: quiet, verifyIdToken, firebase }));
  await new Promise((ok) => mobile.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${mobile.address().port}`;
});

function eventsConfigFor(walletUrl) {
  return eventsConfig({ INTERNAL_JWT_SECRET: SECRET, WALLET_URL: walletUrl, SERVICE_TIMEOUT_MS: '1500', SWEEP_EVERY_MS: '0', ADMIN_SESSION_SECRET: 'session-secret-session-secret-12' });
}

after(async () => {
  for (const s of [mobile, events, walletProxy.server, mono, idn]) { s.closeAllConnections?.(); s.close(); }
  await wallet.stop();
});

const api = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${base}${path}`, {
    method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};
const balance = async (token) => (await api('GET', '/api/wallet', { token })).body.balance;

describe('an event\'s coins reach the real wallet, once, even when the wallet is away', () => {
  before(async () => {
    await Event.create({
      slug: 'e2e-yatra', title: 'E2E Yatra', typeSlug: 'yatra', published: true, blocks: ['schedule', 'registration', 'milestones', 'rewards'],
      schedule: { mode: 'always' }, registration: { mode: 'free', coins: 0, capacity: 2, pass: true, fields: [] },
      milestones: { order: 'sequential', missed: 'catch_up_next', completion: { rule: 'all', n: null }, items: [
        { key: 'a', title: 'A', coins: 12, completion: { rule: 'all' }, tasks: [{ key: 't1', kind: 'counter', title: 'Chant', config: { label: 'Om', target: 3 } }] },
        { key: 'b', title: 'B', coins: 8, completion: { rule: 'all' }, tasks: [{ key: 't1', kind: 'self_mark', title: 'Mark', config: {} }] },
      ] },
      rewards: [{ kind: 'badge', coins: 0, badgeSlug: 'pilgrim', trigger: { on: 'event', milestoneKey: '' } }, { kind: 'coins', coins: 100, badgeSlug: '', trigger: { on: 'event', milestoneKey: '' } }],
    });
  });

  test('join, chant, complete: the BFF relays every answer; the wallet shows the coins; the badge shows in my badges', async () => {
    const T = 'good-e2e-devotee';
    assert.equal((await api('POST', '/api/events/e2e-yatra/join', { body: {} })).status, 401, 'no token');
    const joined = await api('POST', '/api/events/e2e-yatra/join', { token: T, body: { requestId: 'r1' } });
    assert.equal(joined.status, 200);
    assert.match(joined.body.registration.passCode, /^EEY-/);
    assert.equal((await api('POST', '/api/events/e2e-yatra/milestones/b/tasks/t1/progress', { token: T, body: {} })).body.code, 'locked');
    const first = await api('POST', '/api/events/e2e-yatra/milestones/a/tasks/t1/progress', { token: T, body: { add: 3 } });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.deepEqual([first.body.milestone.justCompleted, first.body.awarded.coins], [true, 12]);
    assert.equal(await balance(T), 12);
    clock = new Date(clock.getTime() + 1000);
    const last = await api('POST', '/api/events/e2e-yatra/milestones/b/tasks/t1/progress', { token: T, body: {} });
    assert.deepEqual([last.body.event.justCompleted, last.body.awarded.coins, last.body.awarded.badges.map((b) => b.slug)], [true, 108, ['pilgrim']]);
    assert.equal(await balance(T), 120);
    assert.deepEqual((await WalletTxn.find({ uid: 'e2e-devotee' }).sort({ createdAt: 1 }).lean()).map((t) => [t.type, t.amount, t.idempotencyKey, t.status]), [
      ['bonus', 12, 'event-ms:e2e-yatra:a:e2e-devotee', 'posted'], ['bonus', 8, 'event-ms:e2e-yatra:b:e2e-devotee', 'posted'], ['bonus', 100, 'event-done:e2e-yatra:e2e-devotee', 'posted'],
    ]);
    assert.equal((await api('GET', '/api/me/badges', { token: T })).body.badges[0].slug, 'pilgrim');
    assert.equal((await api('GET', '/api/me/events', { token: T })).body.events[0].progress.done, 2);
    const left = await api('POST', '/api/events/e2e-yatra/leave', { token: T, body: {} });
    assert.equal(left.status, 204);
  });

  test('the capacity (2) holds through the BFF', async () => {
    const rs = await Promise.all(['good-c1', 'good-c2', 'good-c3', 'good-c4'].map((t) => api('POST', '/api/events/e2e-yatra/join', { token: t, body: {} })));
    assert.deepEqual(rs.map((r) => r.status).sort(), [200, 200, 409, 409]);
    assert.ok(rs.filter((r) => r.status === 409).every((r) => r.body.code === 'full'));
  });

  test('the wallet is away when a devotee finishes: the completion counts, then the sweeper pays once with the same key', async () => {
    const T = 'good-c1';
    walletUp = false;
    const r = await api('POST', '/api/events/e2e-yatra/milestones/a/tasks/t1/progress', { token: T, body: { add: 3 } });
    assert.equal(r.status, 200);
    assert.equal(r.body.milestone.justCompleted, true);
    assert.equal(await balance(T), 0, 'nothing paid yet');
    walletUp = true;
    clock = new Date(clock.getTime() + 10 * 60_000);
    const s = await sweep({ wallet: eventsApp.locals.wallet, now: () => clock });
    assert.equal(s.credited, 1);
    assert.equal(await balance(T), 12);
    assert.equal((await sweep({ wallet: eventsApp.locals.wallet, now: () => clock })).credited, 0);
    assert.equal(await balance(T), 12);
    assert.equal(await UserBadge.countDocuments({ uid: 'c1' }), 0);
  });

  test('the real wallet refuses what the events caller may not do', async () => {
    const asEvents = (method, path, body) => wallet.ledger(method, path, body, 'events');
    assert.equal((await asEvents('POST', '/credit', { uid: 'x', amount: 5, type: 'bonus', key: 'booking:x:1' })).status, 403);
    assert.equal((await asEvents('POST', '/debit', { uid: 'x', amount: 5, type: 'booking_debit', key: 'event-x' })).status, 403);
    assert.equal((await asEvents('GET', '/balance/x')).status, 403);
  });
});
