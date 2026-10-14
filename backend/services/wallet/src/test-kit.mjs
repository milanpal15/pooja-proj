import http from 'node:http';

import { permissionsFor, signServiceToken } from '@bhakti/common';
import mongoose from 'mongoose';

import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { connectDb } from './db.js';
import { ctx, setContext } from './lib/context.js';
import { HttpError } from './lib/http-error.js';

const ctxConfig = () => ctx.config;
export const SECRET = 'test-secret-test-secret-1234';

/** TEST_MONGODB_URI is a full URI on a throwaway mongod; the service always gets its own database name. */
export function testConfig(dbName, extra = {}) {
  const base = new URL(process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27231/x');
  return loadConfig({
    INTERNAL_JWT_SECRET: SECRET,
    MONGODB_URI: `${base.protocol}//${base.host}`,
    DB_NAME: dbName,
    ENGAGEMENT_URL: 'http://127.0.0.1:1',
    IDENTITY_URL: 'http://127.0.0.1:1',
    ADMIN_SESSION_SECRET: 'session-secret-session-secret-12',
    PAYMENTS_PROVIDER: 'mock',
    ...extra,
  });
}

export const ADMIN = permissionsFor('admin');
export const EDITOR = permissionsFor('editor');
export const VIEWER = permissionsFor('viewer');

export const token = (claims = {}) =>
  signServiceToken({ iss: 'admin-bff', sub: 'op1', role: 'admin', perms: ADMIN, ctx: { username: 'tester' }, ...claims }, { secret: SECRET });

/** In-memory stand-ins for engagement's settings and identity's directory, so no other service has to run. */
export function fakeDeps({ settings = {}, users = [] } = {}) {
  const deps = {
    settingsData: { coinsPerRupee: '1', ...settings },
    down: false,
    users,
    upserts: [],
    settings: {
      map: async () => { if (deps.down) throw new HttpError(503, 'settings_unavailable', 'down'); return deps.settingsData; },
      getNumber: async (k, f) => {
        if (deps.down) throw new HttpError(503, 'settings_unavailable', 'Settings are unavailable right now.');
        const n = Number(deps.settingsData[k]);
        return deps.settingsData[k] !== undefined && deps.settingsData[k] !== '' && Number.isFinite(n) ? n : f;
      },
      getBool: async (k, f) => {
        if (deps.down) throw new HttpError(503, 'settings_unavailable', 'Settings are unavailable right now.');
        const v = String(deps.settingsData[k] ?? '').toLowerCase();
        return v === 'true' ? true : v === 'false' ? false : f;
      },
      upsert: async (items, as) => {
        if (deps.down) throw Object.assign(new Error('down'), { status: 502, body: { error: 'upstream_unavailable' } });
        if (!Array.isArray(as?.perms) || !as.perms.includes('money:edit')) throw Object.assign(new Error('forbidden'), { status: 403, body: { error: "You don't have permission for that.", code: 'forbidden', needs: 'money:edit' } });
        deps.upserts.push({ items, as });
        for (const i of items) deps.settingsData[i.key] = i.value;
        return { ok: true };
      },
    },
    identity: {
      whoByUid: async (uids) => new Map(deps.users.filter((u) => uids.includes(u.uid)).map((u) => [u.uid, u.name || u.contact])),
      search: async (q) => {
        if (deps.identityDown) throw new HttpError(503, 'identity_unavailable', 'The devotee directory is unavailable right now.');
        return deps.users.filter((u) => `${u.name} ${u.contact}`.toLowerCase().includes(q.toLowerCase()));
      },
    },
  };
  return deps;
}

/**
 * Boots the REAL wallet app (auth, caller gate, area gate, every router) on a throwaway database.
 * `call(method, path, { uid, perms, iss, body, headers, raw, tok })` takes the monolith's `/api/...` path, so the module tests
 * carried over from pooja-api read the same; it goes to `/internal/wallet<path>` with a service token: `uid` -> a mobile-bff token
 * for that devotee, otherwise an admin-bff token (full admin permissions unless `perms`). `ledger(method, path, body)` calls as the monolith.
 */
export async function boot(dbName, { deps = fakeDeps(), extra, fetchImpl } = {}) {
  const config = testConfig(dbName, extra);
  await connectDb(config);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  const logger = { info() {}, warn() {}, error() {} };
  const app = createApp(config, { isReady: () => true, dbPing: async () => {}, logger, settings: deps.settings, identity: deps.identity, fetchImpl });
  const server = http.createServer(app);
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const url = `http://127.0.0.1:${server.address().port}`;

  const call = async (method, path, { uid, perms, iss, body, headers = {}, raw, tok, ctx } = {}) => {
    const authorization = tok === null ? undefined : `Bearer ${tok ?? (uid ? token({ iss: iss ?? 'mobile-bff', sub: uid, role: 'devotee', perms: [], ctx: {} }) : token({ ...(iss ? { iss } : {}), ...(perms ? { perms } : {}), ...(ctx ? { ctx } : {}) }))}`;
    const res = await fetch(`${url}/internal/wallet${path}`, {
      method,
      headers: { ...(body !== undefined || (raw !== undefined && !headers['content-type']) ? { 'content-type': 'application/json' } : {}), ...(authorization ? { authorization } : {}), ...headers },
      body: raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
    return { status: res.status, body: json, headers: res.headers };
  };
  const ledger = (method, path, body, iss = 'monolith') => call(method, path, { iss, body, tok: signServiceToken({ iss, sub: null, perms: [] }, { secret: SECRET }) });
  const setFetch = (f) => setContext({ fetchImpl: f ?? fetchImpl ?? ((...a) => fetch(...a)) });
  const setPayments = (payments) => setContext({ config: Object.freeze({ ...config, payments: Object.freeze({ ...config.payments, ...payments }) }) });
  const stop = async () => {
    await new Promise((ok) => { server.closeAllConnections?.(); server.close(ok); });
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  };
  return { call, ledger, stop, url, get config() { return ctxConfig(); }, deps, setPayments, setFetch };
}
