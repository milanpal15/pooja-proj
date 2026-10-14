import http from 'node:http';

import { permissionsFor, signServiceToken } from '@bhakti/common';
import mongoose from 'mongoose';

import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { connectDb } from './db.js';
import { ctx } from './lib/context.js';
import { HttpError } from './lib/http-error.js';
import { startWalletStub } from './wallet-stub.mjs';

export const SECRET = 'test-secret-test-secret-1234';

/** TEST_MONGODB_URI is a full URI on a throwaway mongod; the service always gets its own database name. */
export function testConfig(dbName, extra = {}) {
  const base = new URL(process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27271/x');
  return loadConfig({
    INTERNAL_JWT_SECRET: SECRET,
    MONGODB_URI: `${base.protocol}//${base.host}`,
    DB_NAME: dbName,
    WALLET_URL: 'http://127.0.0.1:1',
    IDENTITY_URL: 'http://127.0.0.1:1',
    ENGAGEMENT_URL: 'http://127.0.0.1:1',
    ADMIN_SESSION_SECRET: 'session-secret-session-secret-12',
    SERVICE_TIMEOUT_MS: '2000',
    WALLET_TIMEOUT_MS: '2000',
    ...extra,
  });
}

export const ADMIN = permissionsFor('admin');
export const EDITOR = permissionsFor('editor');
export const VIEWER = permissionsFor('viewer');

export const token = (claims = {}) =>
  signServiceToken({ iss: 'admin-bff', sub: 'op1', role: 'admin', perms: ADMIN, ctx: { username: 'tester' }, ...claims }, { secret: SECRET });

/** An in-memory identity directory (names / device ids / roles), so no other service has to run. */
export function fakeIdentity(users = []) {
  const d = {
    users,
    down: false,
    roleWrites: [],
    /** uid -> boolean: which accounts have a push-registered phone. `reachableDown` = identity cannot answer (pushReachable resolves undefined). */
    reachable: {},
    reachableDown: false,
    reachableAsks: 0,
    pushSends: [],
    pushReachable: async (uid) => { d.reachableAsks += 1; return d.reachableDown ? undefined : !!d.reachable[uid]; },
    sendPush: async (uid, message) => { d.pushSends.push({ uid, message }); return { sent: 1, devices: 1 }; },
    userName: async (uid, hint) => (typeof hint === 'string' && hint.trim() ? hint : d.down ? '' : d.users.find((u) => u.uid === uid)?.name || ''),
    deviceIdOf: async (uid) => (d.down ? undefined : d.users.find((u) => u.uid === uid)?.deviceId),
    setRole: async (uid, role) => {
      if (d.down) return; // best effort: identity down = logged, never thrown
      d.roleWrites.push({ uid, role });
      const u = d.users.find((x) => x.uid === uid);
      if (u) u.role = role;
    },
  };
  return d;
}

/** The engagement settings table with the same fail-closed semantics as lib/settings.js, without a network. */
export function fakeSettings(initial = {}) {
  const s = {
    values: { minMinutes: '3', ringTimeoutSec: '25', defaultSharePct: '30', payoutPaisePerCoin: '100', callsEnabled: 'true', ...initial },
    down: false,
    tokens: {},
    reads: [],
    async map({ lenient = false } = {}) {
      if (s.down) {
        if (lenient) return {};
        throw new HttpError(503, 'settings_unavailable', 'Settings are unavailable right now. Please try again in a moment.');
      }
      return s.values;
    },
    async get(key, fallback = '', o) { s.reads.push(key); return (await s.map(o))[key] ?? fallback; },
    async getNumber(key, fallback, o) {
      const raw = String(await s.get(key, '', o)).trim();
      const n = Number(raw);
      return raw !== '' && Number.isFinite(n) ? n : fallback;
    },
    async getBool(key, fallback, o) {
      const v = String(await s.get(key, '', o)).trim().toLowerCase();
      if (v === 'true' || v === '1' || v === 'yes') return true;
      if (v === 'false' || v === '0' || v === 'no') return false;
      return fallback;
    },
    async pushToken(deviceId) { return s.down ? null : s.tokens[deviceId] ?? null; },
  };
  return s;
}

/** Records every notification instead of sending it. */
export function fakePush() {
  const p = { sent: [], throws: false, notifyIncomingCall: (uid, name, callId) => { if (p.throws) throw new Error('push exploded'); p.sent.push({ uid, name, callId }); } };
  return p;
}

/**
 * Boots the REAL calls app (auth, caller gate, area gate, every router, the real wallet client) on a throwaway database, with an HTTP stand-in for
 * the wallet (a real in-memory ledger that can fail like a network).
 *
 * `call(method, path, { uid, perms, iss, body, name, headers, tok })` takes the monolith's `/api/...` path, so the module tests carried over from
 * pooja-api read the same; it goes to `/internal/calls<path>` with a service token: `uid` -> a mobile-bff token for that user (`name` = the profile
 * name the edge vouches for), otherwise an admin-bff token (full admin permissions unless `perms`).
 */
export async function boot(dbName, { extra, identity = fakeIdentity(), settings = fakeSettings(), push = fakePush(), rtc } = {}) {
  const wallet = await startWalletStub({ secret: SECRET });
  const config = testConfig(dbName, { WALLET_URL: wallet.url, ...extra });
  await connectDb(config);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  const logger = { info() {}, warn() {}, error() {} };
  const app = createApp(config, { isReady: () => true, dbPing: async () => {}, logger, identity, settings, push, rtc });
  const server = http.createServer(app);
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const url = `http://127.0.0.1:${server.address().port}`;

  const call = async (method, path, { uid, perms, iss, body, name, headers = {}, raw, tok, ctx: tctx } = {}) => {
    const authorization = tok === null
      ? undefined
      : `Bearer ${tok ?? (uid ? token({ iss: iss ?? 'mobile-bff', sub: uid, role: 'devotee', perms: [], ctx: { ...(name !== undefined ? { name } : {}), ...(tctx ?? {}) } }) : token({ ...(iss ? { iss } : {}), ...(perms ? { perms } : {}) }))}`;
    const res = await fetch(`${url}/internal/calls${path}`, {
      method,
      headers: { ...(body !== undefined || raw !== undefined ? { 'content-type': 'application/json' } : {}), ...(authorization ? { authorization } : {}), ...headers },
      body: raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
    return { status: res.status, body: json, headers: res.headers };
  };
  const stop = async () => {
    await new Promise((ok) => { server.closeAllConnections?.(); server.close(ok); });
    await wallet.close();
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  };
  return { call, stop, url, config, wallet, identity, settings, push, get ctx() { return ctx; } };
}
