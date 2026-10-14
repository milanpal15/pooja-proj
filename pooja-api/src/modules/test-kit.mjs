import http from 'node:http';

import express from 'express';
import mongoose from 'mongoose';

import { httpErrorHandler } from '../lib/http-error.js';
import { User } from '../models.js';

/** Stands in for Firebase: the uid comes from a header. Test-only — never imported by product code. */
export const fakeAuth = (req, res, next) => {
  const uid = req.get('x-test-uid');
  if (!uid) return res.status(401).json({ error: 'missing bearer token' });
  req.token = { uid };
  next();
};

/** Mount a module's real routers on a tiny app (same json + rawBody capture as index.js). */
export async function boot(mod, dbName, { mount } = {}) {
  const base = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27118/commerce_test';
  await mongoose.connect(base.replace(/\/[^/]*$/, `/${dbName}`));
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  const identityStub = process.env.IDENTITY_MODE === '1' ? await startIdentityStub() : null;
  const app = express();
  app.use(express.json({ verify: (req, _res, buf) => { if (req.originalUrl.startsWith('/api/webhooks/')) req.rawBody = buf; } }));
  app.use((req, _res, next) => { req.operator = { username: 'tester', role: 'admin' }; req.can = () => true; next(); });
  const r = mod.routers({ requireAuth: fakeAuth });
  for (const k of ['public', 'devotee', 'admin']) if (r[k]) app.use('/api', r[k]);
  mount?.(app); // extra routers a suite needs besides the module under test
  app.use(httpErrorHandler);
  const server = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  const url = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, path, { uid, body, headers = {}, raw } = {}) => {
    const res = await fetch(url + path, {
      method,
      headers: { ...(raw === undefined ? { 'content-type': 'application/json' } : { 'content-type': 'application/json' }), ...(uid ? { 'x-test-uid': uid } : {}), ...headers },
      body: raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const stop = async () => { server.close(); identityStub?.close(); await mongoose.connection.dropDatabase(); await mongoose.disconnect(); };
  return { call, stop };
}

/**
 * IDENTITY_MODE=1 (phase 2): stands in for the identity service by answering the directory calls from the LOCAL `users`
 * collection, so a suite that seeds `User` rows runs unchanged with IDENTITY_URL set. Test-only.
 * Sets IDENTITY_URL / INTERNAL_JWT_SECRET for this process. Returns the server so the caller can close it.
 */
export async function startIdentityStub() {
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    let raw = '';
    for await (const c of req) raw += c;
    const json = (code, b) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(b)); };
    const one = /^\/internal\/identity\/directory\/users\/([^/]+)(\/role)?$/.exec(u.pathname);
    if (one && one[2] && req.method === 'PUT') {
      await User.updateOne({ uid: one[1] }, { $set: { role: JSON.parse(raw).role } });
      return json(200, { ok: true });
    }
    if (one && req.method === 'GET') {
      const x = await User.findOne({ uid: one[1] }).lean();
      return x ? json(200, { user: { uid: x.uid, name: x.name || '', contact: x.contact || '', deviceId: x.deviceId || null, role: x.role || 'devotee' } }) : json(404, { error: 'nf' });
    }
    if (u.pathname === '/internal/identity/directory/lookup') {
      const rows = await User.find({ uid: { $in: JSON.parse(raw).uids } }).lean();
      return json(200, { users: rows.map((x) => ({ uid: x.uid, name: x.name || '', contact: x.contact || '' })) });
    }
    if (u.pathname === '/internal/identity/directory/search') {
      const rx = new RegExp(u.searchParams.get('q'), 'i');
      return json(200, { users: await User.find({ $or: [{ name: rx }, { contact: rx }, { email: rx }, { phone: rx }] }).limit(20).lean() });
    }
    json(404, { error: 'stub' });
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  process.env.INTERNAL_JWT_SECRET = 'identity-mode-secret-1234567890';
  process.env.IDENTITY_URL = `http://127.0.0.1:${server.address().port}`;
  return server;
}
