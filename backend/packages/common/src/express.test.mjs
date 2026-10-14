import assert from 'node:assert/strict';
import { after, test } from 'node:test';

import express from 'express';

import { ServiceError, createLogger, errorHandler, health, loadEnv, requestId, requireServiceAuth, signServiceToken } from './index.js';

const secret = 'test-secret-test-secret-1234';
let ready = false;
const app = express();
app.use(requestId());
app.use(health({ isReady: () => ready, deps: { good: async () => {}, bad: async () => { throw new Error('x'); } } }));
app.get('/priv', requireServiceAuth({ secret, issuers: ['mobile-bff'] }), (req, res) => res.json(req.auth));
app.get('/svc', (req, res, next) => next(new ServiceError(402, { error: 'e', code: 'insufficient_coins', shortfall: 3 })));
app.get('/boom', (req, res, next) => next(new Error('secret db string')));
app.use(errorHandler({ error() {} }));
const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
after(() => server.close());

test('health: 503 until ready, then 200', async () => {
  assert.equal((await fetch(`${base}/health`)).status, 503);
  ready = true;
  assert.equal((await fetch(`${base}/health`)).status, 200);
});
test('health/deps reports each dependency', async () => {
  const r = await fetch(`${base}/health/deps`);
  assert.equal(r.status, 503);
  const b = await r.json();
  assert.equal(b.deps.good.ok, true);
  assert.equal(b.deps.bad.ok, false);
});
test('requireServiceAuth: 401 without, wrong issuer, ok with', async () => {
  let r = await fetch(`${base}/priv`);
  assert.equal(r.status, 401);
  assert.equal((await r.json()).code, 'missing_token');
  const bad = signServiceToken({ iss: 'admin-bff' }, { secret });
  r = await fetch(`${base}/priv`, { headers: { authorization: `Bearer ${bad}` } });
  assert.equal((await r.json()).code, 'wrong_issuer');
  const ok = signServiceToken({ iss: 'mobile-bff', sub: 'u' }, { secret });
  r = await fetch(`${base}/priv`, { headers: { authorization: `Bearer ${ok}` } });
  assert.equal((await r.json()).sub, 'u');
});
test('error handler: ServiceError body passes through; 500 is generic', async () => {
  let r = await fetch(`${base}/svc`);
  assert.equal(r.status, 402);
  assert.deepEqual(await r.json(), { error: 'e', code: 'insufficient_coins', shortfall: 3 });
  r = await fetch(`${base}/boom`);
  assert.equal(r.status, 500);
  assert.deepEqual(await r.json(), { error: 'Something went wrong.', code: 'internal' });
});
test('requestId: echoes a sane id, replaces an unsafe one', async () => {
  let r = await fetch(`${base}/health`, { headers: { 'x-request-id': 'abc-1' } });
  assert.equal(r.headers.get('x-request-id'), 'abc-1');
  r = await fetch(`${base}/health`, { headers: { 'x-request-id': 'bad id!' } });
  assert.notEqual(r.headers.get('x-request-id'), 'bad id!');
});
test('logger is one line with reqId; loadEnv', () => {
  const lines = [];
  createLogger('svc', { out: (l) => lines.push(l) }).info('hello', { reqId: 'r1', status: 200 });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /info svc hello reqId=r1 status=200$/);
  const c = loadEnv({ PORT: '5' }, { port: { name: 'PORT', default: 1, parse: Number }, u: { name: 'U', default: 'd' } });
  assert.deepEqual({ ...c }, { port: 5, u: 'd' });
  assert.throws(() => loadEnv({}, { s: { name: 'S', required: true } }), /S/);
});
