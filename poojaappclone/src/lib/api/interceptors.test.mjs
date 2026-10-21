/** node --test src/lib/api/interceptors.test.mjs — the REAL axios instance, a custom adapter instead of a network. */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadTs } from './load-ts.mjs';

// One module graph, so ApiError is the same class the interceptors throw.
const { createHttp } = loadTs('interceptors');
const { ApiError, isOffline } = loadTs('errors');
const axiosLib = (await import('node:module')).createRequire(import.meta.url)('axios');

const BASE = 'https://api.test';

/** A scripted adapter: `respond(config, n)` returns {status, data, statusText}; every sent config is recorded. */
function setup({ respond, token = 'tok0', refreshed = 'tok1', refreshDelay = 5, refreshFails = false } = {}) {
  const sent = [];
  const gates = [];
  const blocks = [];
  const forced = [];
  const adapter = async (config) => {
    const hdr = (n) => config.headers.get(n);
    sent.push({ url: config.url, method: config.method, auth: hdr('Authorization'), ct: hdr('Content-Type'), app: hdr('X-App-Version'), dev: hdr('X-Device-Id'), data: config.data });
    const r = await respond(config, sent.length);
    if (r instanceof Error) throw r;
    const response = { data: r.data ?? '', status: r.status ?? 200, statusText: r.statusText ?? '', headers: r.headers ?? {}, config, request: {} };
    // mimic the XHR/http adapters: settle through validateStatus
    if (!config.validateStatus || config.validateStatus(response.status)) return response;
    throw new axiosLib.AxiosError(`Request failed with status code ${response.status}`, 'ERR_BAD_REQUEST', config, {}, response);
  };
  const http = createHttp({
    baseURL: BASE,
    adapter,
    timeout: 1000,
    getToken: async (force) => {
      if (!force) return token;
      forced.push(1);
      await new Promise((r) => setTimeout(r, refreshDelay));
      if (refreshFails) throw new Error('refresh failed');
      return refreshed;
    },
    getHeaders: async () => ({ 'X-App-Version': '1.2.3', 'X-Device-Id': 'dev_abc' }),
    emitGate: (s) => gates.push(s),
    emitBlock: (b) => blocks.push(b),
  });
  return { http, sent, gates, blocks, forced };
}

const authed = (http, url = '/api/x', extra = {}) => http.request({ url, authed: true, ...extra });

test('telemetry headers on every request; bearer only when authed', async () => {
  const { http, sent } = setup({ respond: () => ({ data: { ok: 1 } }) });
  await http.get('/api/public');
  await authed(http, '/api/private');
  assert.equal(sent[0].app, '1.2.3');
  assert.equal(sent[0].dev, 'dev_abc');
  assert.equal(sent[0].auth, undefined);
  assert.equal(sent[1].auth, 'Bearer tok0');
  assert.equal(sent[1].ct, 'application/json');
  assert.equal(sent[1].dev, 'dev_abc');
});

test('absolute and protocol-relative URLs are rejected before sending', async () => {
  const { http, sent } = setup({ respond: () => ({}) });
  for (const url of ['https://evil.test/x', 'http://evil.test/x', '//evil.test/x', 'api/x', '/\\evil.test', '']) {
    await assert.rejects(authed(http, url), /host-relative/);
    await assert.rejects(http.get(url), /host-relative/);
  }
  assert.equal(sent.length, 0);
});

test('authed with no token -> ApiError 401, nothing sent', async () => {
  const sent = [];
  const http = createHttp({ baseURL: BASE, adapter: async (c) => (sent.push(c), { data: '', status: 200, statusText: '', headers: {}, config: c }), getToken: async () => null, getHeaders: async () => ({}), emitGate() {}, emitBlock() {} });
  await assert.rejects(authed(http), (e) => e instanceof ApiError && e.status === 401 && e.message === 'not signed in');
  assert.equal(sent.length, 0);
});

test('401 -> exactly one force refresh and one retry with the new token', async () => {
  const { http, sent, forced } = setup({ respond: (c) => (c.headers.get('Authorization') === 'Bearer tok1' ? { data: { ok: true } } : { status: 401, data: { error: 'expired' } }) });
  const res = await authed(http, '/api/me', { method: 'post', data: JSON.stringify({ a: 1 }) });
  assert.deepEqual(res.data, { ok: true });
  assert.equal(forced.length, 1);
  assert.equal(sent.length, 2);
  assert.equal(sent[1].auth, 'Bearer tok1');
  assert.equal(sent[1].dev, 'dev_abc');
  assert.equal(JSON.parse(sent[1].data).a, 1);
  assert.equal(sent[0].ct, 'application/json');
});

test('5 parallel 401s trigger exactly ONE getIdToken(true); all five succeed', async () => {
  const { http, forced, sent } = setup({ respond: (c) => (c.headers.get('Authorization') === 'Bearer tok1' ? { data: { ok: true } } : { status: 401 }), refreshDelay: 20 });
  const all = await Promise.all([1, 2, 3, 4, 5].map((i) => authed(http, `/api/p${i}`)));
  assert.equal(forced.length, 1);
  assert.ok(all.every((r) => r.data.ok));
  assert.equal(sent.length, 10);
});

test('a second 401 is an ApiError 401 and does not loop', async () => {
  const { http, sent, forced } = setup({ respond: () => ({ status: 401, data: { error: 'nope', code: 'bad_token' } }) });
  await assert.rejects(authed(http), (e) => e instanceof ApiError && e.status === 401 && e.code === 'bad_token' && e.message === 'nope');
  assert.equal(sent.length, 2);
  assert.equal(forced.length, 1);
});

test('failed refresh -> ApiError 401, no retry', async () => {
  const { http, sent } = setup({ respond: () => ({ status: 401 }), refreshFails: true });
  await assert.rejects(authed(http), (e) => e instanceof ApiError && e.status === 401);
  assert.equal(sent.length, 1);
});

test('a non-authed 401 is just an ApiError (no refresh)', async () => {
  const { http, forced } = setup({ respond: () => ({ status: 401 }) });
  await assert.rejects(http.get('/api/x'), (e) => e instanceof ApiError && e.status === 401);
  assert.equal(forced.length, 0);
});

test('426 app_outdated and 503 maintenance fire the gate signal with the body, and still reject', async () => {
  const b426 = { error: 'Update required', code: 'app_outdated', minVersionCode: 9 };
  const b503 = { error: 'maintenance', code: 'maintenance' };
  const { http, gates } = setup({ respond: (c) => (c.url === '/a' ? { status: 426, data: b426 } : c.url === '/b' ? { status: 503, data: b503 } : { status: 503, data: { error: 'down' } }) });
  await assert.rejects(http.get('/a'), (e) => e instanceof ApiError && e.status === 426 && e.code === 'app_outdated');
  await assert.rejects(http.get('/b'), ApiError);
  await assert.rejects(http.get('/c'), ApiError); // an uncoded 503 is not a gate
  assert.deepEqual(gates, [{ httpStatus: 426, body: b426 }, { httpStatus: 503, body: b503 }]);
});

test('403 with a block code fires the block signal; an uncoded 403 does not', async () => {
  const { http, blocks } = setup({ respond: (c) => (c.url === '/blocked' ? { status: 403, data: { code: 'account_blocked', message: 'bad', support: { email: 'a@b.c' } } } : { status: 403, data: { error: 'forbidden' } }) });
  await assert.rejects(http.get('/blocked'), (e) => e instanceof ApiError && e.status === 403);
  await assert.rejects(http.get('/plain'), ApiError);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].code, 'account_blocked');
  assert.equal(blocks[0].message, 'bad');
});

test('signals also fire when the caller treats every status as success (raw calls)', async () => {
  const { http, gates, blocks } = setup({ respond: (c) => (c.url === '/g' ? { status: 426, data: { code: 'app_outdated' } } : { status: 403, data: { code: 'device_blocked' } }) });
  const g = await http.request({ url: '/g', validateStatus: () => true });
  const b = await http.request({ url: '/b', validateStatus: () => true });
  assert.equal(g.status, 426);
  assert.equal(b.status, 403);
  assert.equal(gates.length, 1);
  assert.equal(blocks.length, 1);
});

test('raw (validateStatus) authed-less calls never refresh on 401', async () => {
  const { http, forced } = setup({ respond: () => ({ status: 401 }) });
  const r = await http.request({ url: '/x', validateStatus: () => true });
  assert.equal(r.status, 401);
  assert.equal(forced.length, 0);
});

test('error body -> ApiError fields; statusText fallback; non-object body', async () => {
  const { http } = setup({
    respond: (c) =>
      c.url === '/full' ? { status: 402, data: { error: 'low', code: 'insufficient_coins', shortfall: 40 } }
      : c.url === '/detail' ? { status: 400, data: { detail: 'why', error: 'x' } }
      : { status: 500, statusText: 'Server Error', data: '<html>' },
  });
  await assert.rejects(authed(http, '/full'), (e) => e instanceof ApiError && e.status === 402 && e.message === 'low' && e.code === 'insufficient_coins' && e.body.shortfall === 40);
  await assert.rejects(authed(http, '/detail'), (e) => e.message === 'why');
  await assert.rejects(authed(http, '/html'), (e) => e.status === 500 && e.message === '500 Server Error' && e.code === undefined && Object.keys(e.body).length === 0);
});

test('204 resolves with an empty body', async () => {
  const { http } = setup({ respond: () => ({ status: 204 }) });
  const r = await authed(http, '/api/leave', { method: 'delete' });
  assert.equal(r.status, 204);
});

test('timeout, network error and abort are offline, not ApiError; HTTP 500 is not offline', async () => {
  const mk = (code, message) => (c) => new axiosLib.AxiosError(message, code, c);
  for (const code of ['ECONNABORTED', 'ERR_NETWORK', 'ERR_CANCELED', 'ETIMEDOUT']) {
    const { http } = setup({ respond: mk(code, code) });
    await assert.rejects(http.get('/x'), (e) => !(e instanceof ApiError) && isOffline(e) && e.code === code);
  }
  const { http } = setup({ respond: () => ({ status: 500, data: { error: 'boom' } }) });
  await assert.rejects(http.get('/x'), (e) => e instanceof ApiError && !isOffline(e));
  assert.equal(isOffline(new TypeError('Network request failed')), true);
  assert.equal(isOffline(Object.assign(new Error('x'), { name: 'AbortError' })), true);
  assert.equal(isOffline(new Error('other')), false);
});

test('a real timeout and a real abort signal surface as offline', async () => {
  // adapter that honours timeout / signal like the XHR one
  const adapter = (config) =>
    new Promise((_, reject) => {
      const t = config.timeout ? setTimeout(() => reject(new axiosLib.AxiosError('timeout', 'ECONNABORTED', config)), config.timeout) : null;
      config.signal?.addEventListener('abort', () => (clearTimeout(t), reject(new axiosLib.CanceledError(null, config))));
    });
  const http = createHttp({ baseURL: BASE, adapter, getToken: async () => 't', getHeaders: async () => ({}), emitGate() {}, emitBlock() {} });
  await assert.rejects(http.get('/slow', { timeout: 20 }), (e) => isOffline(e) && !(e instanceof ApiError));
  const ac = new AbortController();
  const p = http.get('/slow', { timeout: 0, signal: ac.signal });
  setTimeout(() => ac.abort(), 10);
  await assert.rejects(p, (e) => isOffline(e) && e.code === 'ERR_CANCELED');
});
