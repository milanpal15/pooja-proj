import http from 'node:http';

import { permissionsFor, signServiceToken } from '@bhakti/common';
import mongoose from 'mongoose';

import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { connectDb } from './db.js';

export const SECRET = 'test-secret-test-secret-1234';

/** TEST_MONGODB_URI is a full URI on a throwaway mongod; the service always gets its own database name. */
export function testConfig(dbName, extra = {}) {
  const base = new URL(process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27211/x');
  return loadConfig({
    INTERNAL_JWT_SECRET: SECRET,
    MONGODB_URI: `${base.protocol}//${base.host}`,
    DB_NAME: dbName,
    ENGAGEMENT_URL: 'http://127.0.0.1:1',
    ...extra,
  });
}

export const ADMIN = permissionsFor('admin');
export const EDITOR = permissionsFor('editor');
export const VIEWER = permissionsFor('viewer');

export const token = (claims = {}) =>
  signServiceToken({ iss: 'admin-bff', sub: 'op1', role: 'admin', perms: ADMIN, ctx: { username: 'tester' }, ...claims }, { secret: SECRET });

/** In-memory stand-ins for engagement's settings and the orders stats, so no other service has to run. */
export function fakeDeps({ settings = { prasadDelivery: '99' }, stats = {} } = {}) {
  const deps = {
    settingsData: settings,
    statsData: stats,
    statsDown: false,
    settings: {
      map: async () => deps.settingsData,
      getNumber: async (k, f) => { const n = Number(deps.settingsData[k]); return deps.settingsData[k] !== undefined && Number.isFinite(n) ? n : f; },
    },
    orders: {
      available: true,
      all: async () => (deps.statsDown ? new Map() : new Map(Object.entries(deps.statsData))),
      forSlug: async (slug) => {
        const s = deps.statsDown ? undefined : deps.statsData[slug];
        return { bookingCount: Number(s?.bookingCount) || 0, rating: s?.rating ?? null };
      },
    },
  };
  return deps;
}

/**
 * Boots the REAL catalog app (auth, caller gate, area gate, every router) on a throwaway database.
 * `call(method, path, { uid, perms, iss, body, headers, raw })` takes the monolith's `/api/...` path, so the module
 * tests carried over from pooja-api read the same; it goes to `/internal/catalog<path>` with a service token:
 * `uid` -> a mobile-bff token for that devotee, otherwise an admin-bff token (full admin permissions unless `perms`).
 */
export async function boot(dbName, { deps = fakeDeps(), extra, fetchImpl } = {}) {
  const config = testConfig(dbName, extra);
  await connectDb(config);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  const logger = { info() {}, warn() {}, error() {} };
  const app = createApp(config, { isReady: () => true, dbPing: async () => {}, logger, settings: deps.settings, orders: deps.orders, ...(fetchImpl ? { fetchImpl } : {}) });
  const server = http.createServer(app);
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const url = `http://127.0.0.1:${server.address().port}`;

  const call = async (method, path, { uid, perms, iss, body, headers = {}, raw, tok } = {}) => {
    const authorization = tok === null ? undefined : `Bearer ${tok ?? (uid ? token({ iss: iss ?? 'mobile-bff', sub: uid, role: 'devotee', perms: [], ctx: {} }) : token({ ...(iss ? { iss } : {}), ...(perms ? { perms } : {}) }))}`;
    const res = await fetch(`${url}/internal/catalog${path}`, {
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
    await new Promise((ok) => server.close(ok));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  };
  return { call, stop, url, config, deps };
}
