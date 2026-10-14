import http from 'node:http';

import { permissionsFor, signServiceToken } from '@bhakti/common';
import mongoose from 'mongoose';

import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { connectDb } from './db.js';
import { ctx } from './lib/context.js';
import { startCatalogStub } from './catalog-stub.mjs';
import { startWalletStub } from './wallet-stub.mjs';

export const SECRET = 'test-secret-test-secret-1234';

/** TEST_MONGODB_URI is a full URI on a throwaway mongod; the service always gets its own database name. */
export function testConfig(dbName, extra = {}) {
  const base = new URL(process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27251/x');
  return loadConfig({
    INTERNAL_JWT_SECRET: SECRET,
    MONGODB_URI: `${base.protocol}//${base.host}`,
    DB_NAME: dbName,
    WALLET_URL: 'http://127.0.0.1:1',
    CATALOG_URL: 'http://127.0.0.1:1',
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

/** An in-memory identity directory (names / device ids), so no other service has to run. */
export function fakeIdentity(users = []) {
  const d = {
    users,
    down: false,
    userName: async (uid, hint) => (typeof hint === 'string' && hint.trim() ? hint : d.down ? '' : d.users.find((u) => u.uid === uid)?.name || ''),
    deviceIdOf: async (uid) => (d.down ? undefined : d.users.find((u) => u.uid === uid)?.deviceId),
    whoByUid: async (uids) => (d.down ? new Map() : new Map(d.users.filter((u) => uids.includes(u.uid)).map((u) => [u.uid, u.name || u.contact]))),
  };
  return d;
}

/** Records every notification instead of sending it. */
export function fakePush() {
  const p = { sent: [], throws: false, notifyDevotee: (uid, m) => { if (p.throws) throw new Error('push exploded'); p.sent.push({ uid, ...m }); } };
  return p;
}

const DAY = 86_400_000;
export const day = (plus) => new Date(Date.now() + 5.5 * 3_600_000 + plus * DAY).toISOString().slice(0, 10);
export const PK = (key, persons, coins) => ({ key, name: key[0].toUpperCase() + key.slice(1), nameHi: null, persons, coins, order: persons, enabled: true });
export const names = (n) => Array.from({ length: n }, (_, i) => ({ name: `Devotee ${i + 1}`, gotra: i ? '' : 'Kashyap' }));

/**
 * Boots the REAL orders app (auth, caller gate, area gate, every router, the real catalog / wallet clients) on a throwaway database, with an
 * HTTP stand-in for the wallet (a real in-memory ledger that can fail like a network) and for the catalog's pricing routes.
 *
 * `call(method, path, { uid, perms, iss, body, name, headers, tok })` takes the monolith's `/api/...` path, so the module tests carried over
 * from pooja-api read the same; it goes to `/internal/orders<path>` with a service token: `uid` -> a mobile-bff token for that devotee
 * (`name` = the profile name the edge vouches for), otherwise an admin-bff token (full admin permissions unless `perms`).
 */
export async function boot(dbName, { extra, identity = fakeIdentity(), push = fakePush(), seed = true } = {}) {
  const wallet = await startWalletStub({ secret: SECRET });
  const catalog = await startCatalogStub({ secret: SECRET });
  const config = testConfig(dbName, { WALLET_URL: wallet.url, CATALOG_URL: catalog.url, ...extra });
  await connectDb(config);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  const logger = { info() {}, warn() {}, error() {} };
  const app = createApp(config, { isReady: () => true, dbPing: async () => {}, logger, identity, push });
  const server = http.createServer(app);
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const url = `http://127.0.0.1:${server.address().port}`;

  if (seed) {
    catalog.temples.set('kashi', { slug: 'kashi', name: 'Kashi Vishwanath', location: 'Varanasi' });
    catalog.poojas.set('navratri', {
      slug: 'navratri', title: 'Navratri Durga Pooja', titleHi: 'नवरात्रि', templeSlug: 'kashi', place: 'Varanasi', poojaDate: day(10),
      prasadAvailable: true, prasadFeeCoins: 99, cancelHours: 24,
      packages: [PK('individual', 1, 551), PK('partner', 2, 851), PK('family', 4, 1251), PK('extended', 6, 1651)],
    });
    catalog.listings.set('ganga-aarti', {
      slug: 'ganga-aarti', title: 'Ganga Aarti Chadhava', titleHi: 'गंगा आरती', templeSlug: 'kashi',
      offerings: [
        { key: 'flowers', title: 'Flowers', coins: 11, order: 0, enabled: true },
        { key: 'diya', title: 'Diya', coins: 21, order: 1, enabled: true },
        { key: 'hidden', title: 'Hidden', coins: 5, order: 2, enabled: false },
      ],
    });
  }

  const call = async (method, path, { uid, perms, iss, body, name, headers = {}, raw, tok, ctx: tctx } = {}) => {
    const authorization = tok === null
      ? undefined
      : `Bearer ${tok ?? (uid ? token({ iss: iss ?? 'mobile-bff', sub: uid, role: 'devotee', perms: [], ctx: { ...(name !== undefined ? { name } : {}), ...(tctx ?? {}) } }) : token({ ...(iss ? { iss } : {}), ...(perms ? { perms } : {}) }))}`;
    const res = await fetch(`${url}/internal/orders${path}`, {
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
    await Promise.all([wallet.close(), catalog.close()]);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  };
  return { call, stop, url, config, wallet, catalog, identity, push, get ctx() { return ctx; } };
}
