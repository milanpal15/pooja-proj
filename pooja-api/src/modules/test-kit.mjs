import express from 'express';
import mongoose from 'mongoose';

import { httpErrorHandler } from '../lib/http-error.js';

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
  const stop = async () => { server.close(); await mongoose.connection.dropDatabase(); await mongoose.disconnect(); };
  return { call, stop };
}
