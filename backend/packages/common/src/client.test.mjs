import assert from 'node:assert/strict';
import http from 'node:http';
import { after, test } from 'node:test';

import { CircuitBreaker, ServiceError, createServiceClient, verifyServiceToken } from './index.js';

const secret = 'test-secret-test-secret-1234';
const servers = [];
async function stub(handler) {
  const hits = [];
  const s = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      hits.push({ method: req.method, url: req.url, headers: req.headers, body });
      handler(req, res, hits.length, body);
    });
  });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  servers.push(s);
  return { url: `http://127.0.0.1:${s.address().port}`, hits, close: () => new Promise((r) => s.close(r)) };
}
const json = (res, status, obj) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
};
const client = (url, extra = {}) => createServiceClient({ service: 'wallet', baseUrl: url, iss: 'orders', secret, ...extra });
after(() => servers.forEach((s) => s.close()));

test('signs a JWT with claims, propagates x-request-id, sends JSON body', async () => {
  const s = await stub((req, res) => json(res, 200, { ok: true }));
  const out = await client(s.url).post('/internal/wallet/debit', { amount: 5 }, { reqId: 'req-9', as: { sub: 'u1', role: 'admin', perms: ['a:view'] } });
  assert.deepEqual(out, { ok: true });
  const h = s.hits[0];
  assert.equal(h.headers['x-request-id'], 'req-9');
  assert.equal(h.body, '{"amount":5}');
  const claims = verifyServiceToken(h.headers.authorization.slice(7), { secret, issuers: ['orders'] });
  assert.equal(claims.sub, 'u1');
  assert.equal(claims.reqId, 'req-9');
});

test('passes {error, code, ...extra} through as a typed ServiceError with status', async () => {
  const s = await stub((req, res) => json(res, 402, { error: 'Not enough coins', code: 'insufficient_coins', shortfall: 40 }));
  await assert.rejects(
    () => client(s.url).post('/x', {}),
    (e) => e instanceof ServiceError && e.status === 402 && e.code === 'insufficient_coins' && e.body.shortfall === 40 && e.service === 'wallet',
  );
});

test('query string is encoded', async () => {
  const s = await stub((req, res) => json(res, 200, {}));
  await client(s.url).get('/t', { query: { key: 'a b', n: 1 } });
  assert.equal(s.hits[0].url, '/t?key=a+b&n=1');
});

test('GET retries once on 503 and succeeds', async () => {
  const s = await stub((req, res, n) => (n === 1 ? json(res, 503, { error: 'busy' }) : json(res, 200, { n })));
  assert.deepEqual(await client(s.url).get('/g'), { n: 2 });
  assert.equal(s.hits.length, 2);
});

test('GET retries only once (two 502s -> error, exactly 2 hits)', async () => {
  const s = await stub((req, res) => json(res, 502, { error: 'bad gw' }));
  await assert.rejects(() => client(s.url).get('/g'), (e) => e.status === 502);
  assert.equal(s.hits.length, 2);
});

test('POST is never retried', async () => {
  const s = await stub((req, res) => json(res, 503, { error: 'busy' }));
  await assert.rejects(() => client(s.url).post('/p', {}), (e) => e.status === 503);
  assert.equal(s.hits.length, 1);
});

test('a 4xx is not retried and not a breaker failure', async () => {
  const s = await stub((req, res) => json(res, 404, { error: 'nope', code: 'not_found' }));
  const c = client(s.url);
  for (let i = 0; i < 8; i++) await assert.rejects(() => c.get('/g'), (e) => e.status === 404);
  assert.equal(s.hits.length, 8);
  assert.equal(c.breaker.state, 'closed');
});

test('connection error -> 502 upstream_unavailable; GET retried once', async () => {
  const s = await stub((req, res) => json(res, 200, {}));
  await s.close();
  const c = client(s.url);
  await assert.rejects(() => c.get('/g'), (e) => e.status === 502 && e.body.error === 'upstream_unavailable');
});

test('timeout -> 504 upstream_timeout', async () => {
  const s = await stub(() => {}); // never answers
  await assert.rejects(() => client(s.url, { timeoutMs: 80 }).post('/slow', {}), (e) => e.status === 504 && e.code === 'upstream_timeout');
});

test('circuit opens after 5 consecutive failures, then half-opens after 10 s', async () => {
  let t = 1000;
  const breaker = new CircuitBreaker({ now: () => t });
  let healthy = false;
  const s = await stub((req, res) => (healthy ? json(res, 200, { ok: 1 }) : json(res, 503, { error: 'down' })));
  const c = client(s.url, { breaker });
  for (let i = 0; i < 5; i++) await assert.rejects(() => c.post('/p', {}), (e) => e.status === 503 && e.code !== 'circuit_open');
  assert.equal(breaker.state, 'open');
  const before = s.hits.length;
  await assert.rejects(() => c.post('/p', {}), (e) => e.code === 'circuit_open' && e.status === 503);
  assert.equal(s.hits.length, before, 'open circuit makes no network call');

  t += 10_000;
  assert.equal(breaker.state, 'half-open');
  // failed probe re-opens
  await assert.rejects(() => c.post('/p', {}), (e) => e.status === 503 && e.code !== 'circuit_open');
  assert.equal(breaker.state, 'open');
  // successful probe closes
  t += 10_000;
  healthy = true;
  assert.deepEqual(await c.post('/p', {}), { ok: 1 });
  assert.equal(breaker.state, 'closed');
});

test('a success resets the consecutive-failure count', async () => {
  const breaker = new CircuitBreaker();
  let fail = true;
  const s = await stub((req, res) => (fail ? json(res, 503, {}) : json(res, 200, {})));
  const c = client(s.url, { breaker });
  for (let i = 0; i < 4; i++) await assert.rejects(() => c.post('/p', {}));
  fail = false;
  await c.post('/p', {});
  fail = true;
  for (let i = 0; i < 4; i++) await assert.rejects(() => c.post('/p', {}));
  assert.equal(breaker.state, 'closed');
});

test('`full: true` resolves { status, data } so a caller can relay a 201 vs a 200; the default still resolves just the body', async () => {
  const s = await stub((req, res) => json(res, req.url.endsWith('/made') ? 201 : 200, { ok: true }));
  const c = client(s.url);
  assert.deepEqual(await c.request('POST', '/made', { body: {}, full: true }), { status: 201, data: { ok: true } });
  assert.deepEqual(await c.request('POST', '/again', { body: {}, full: true }), { status: 200, data: { ok: true } });
  assert.deepEqual(await c.request('POST', '/made', { body: {} }), { ok: true });
});

test('codedErrorsAreAnswers: a 503 with a business code is an answer (no retry, breaker stays closed); a 503 without one, or with an infrastructure code, is still a sick service', async () => {
  let n = 0;
  const s = await stub((req, res) => {
    n++;
    if (req.url === '/coded') return json(res, 503, { error: 'Coins are temporarily unavailable.', code: 'wallet_unavailable' });
    if (req.url === '/infra') return json(res, 503, { error: 'x', code: 'service_unavailable' });
    return json(res, 503, { error: 'plain' });
  });
  const c = client(s.url, { codedErrorsAreAnswers: true });
  for (let i = 0; i < 12; i++) {
    await assert.rejects(c.get('/coded'), (e) => e instanceof ServiceError && e.status === 503 && e.code === 'wallet_unavailable');
  }
  assert.equal(n, 12, 'a GET was not retried');
  assert.equal(c.breaker.state, 'closed');
  await assert.rejects(c.get('/plain'), (e) => e.status === 503);
  assert.equal(n, 14, 'an uncoded 503 GET IS retried once');
  for (let i = 0; i < 5; i++) await assert.rejects(c.get('/infra'));
  assert.equal(c.breaker.state, 'open', 'infrastructure codes count as failures');
  // default behaviour unchanged
  const d = client(s.url);
  n = 0;
  await assert.rejects(d.get('/coded'));
  assert.equal(n, 2, 'without the option a coded 503 GET is retried like any other');
});
