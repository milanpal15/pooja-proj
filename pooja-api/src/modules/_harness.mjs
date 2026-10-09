import http from 'node:http';

import express from 'express';
import mongoose from 'mongoose';

/**
 * Shared test plumbing: a real Express app mounting the real module routers
 * behind a FAKE `requireAuth` (never used by product code), on a throwaway
 * MongoDB. Each suite passes its own database name — `node --test` runs files
 * in parallel and every suite drops its database first.
 */
export function dbUri(name) {
  const base = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27119/calls_test';
  const u = new URL(base);
  u.pathname = `/${name}`;
  return u.toString();
}

export const fakeAuth = (req, res, next) => {
  const uid = req.get('x-test-uid');
  if (!uid) return res.status(401).json({ error: 'missing bearer token' });
  req.token = { uid };
  if (req.get('x-test-email')) req.token.email = req.get('x-test-email');
  if (req.get('x-test-phone')) req.token.phone_number = req.get('x-test-phone');
  next();
};

export async function startApp(dbName, moduleNamespaces) {
  await mongoose.connect(dbUri(dbName));
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.operator = { username: 'tester', role: 'admin' };
    req.can = () => true; // the real gate is tested in access/access.test.mjs
    next();
  });
  for (const m of moduleNamespaces) {
    const r = m.routers({ requireAuth: fakeAuth });
    for (const k of ['public', 'devotee', 'admin']) if (r[k]) app.use('/api', r[k]);
  }
  const server = http.createServer(app);
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${server.address().port}`;

  /** `api('POST','/calls',{uid:'u1',body:{…}})` → { status, body } */
  const api = async (method, path, { uid, body, headers } = {}) => {
    const res = await fetch(`${base}/api${path}`, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(uid ? { 'x-test-uid': uid } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    return { status: res.status, body: json };
  };
  const close = async () => {
    await new Promise((ok) => server.close(ok));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  };
  return { api, close };
}
