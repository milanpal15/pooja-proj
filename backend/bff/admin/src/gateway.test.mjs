import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, test } from 'node:test';

import { createApp } from './app.js';
import { loadConfig } from './config.js';

const NAME = 'admin-bff';
const MEDIA = Buffer.from('0123456789abcdefghij');
let up;
let upstreamOk = true;
let seen;
let gw;
let gwBase;
let down; // port with nothing listening
let start;

before(async () => {
  up = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const p = req.url.split('?')[0];
      if (p !== '/api/health') seen = { method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks) };
      if (p === '/api/health') {
        res.writeHead(upstreamOk ? 200 : 503, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ ok: upstreamOk }));
      }
      if (p === '/api/echo') {
        res.writeHead(201, { 'content-type': 'application/json', 'x-custom': 'yes', 'access-control-allow-origin': 'https://upstream.example' });
        return res.end(JSON.stringify({ got: seen.body.toString(), q: req.url.split('?')[1] || null }));
      }
      if (p === '/api/denied') {
        res.writeHead(402, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: 'no coins', code: 'insufficient_coins', shortfall: 4 }));
      }
      if (p === '/api/admin/login') {
        res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': ['pooja_admin=abc; Path=/; HttpOnly; SameSite=None; Secure', 'other=1; Path=/'] });
        return res.end('{"ok":true}');
      }
      if (p.startsWith('/uploads/')) {
        const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
        const base = { 'content-type': 'audio/mpeg', 'accept-ranges': 'bytes', etag: '"v1"', 'cache-control': 'public, max-age=31536000, immutable' };
        if (m) {
          const s = Number(m[1]);
          const e = m[2] ? Number(m[2]) : MEDIA.length - 1;
          res.writeHead(206, { ...base, 'content-range': `bytes ${s}-${e}/${MEDIA.length}`, 'content-length': e - s + 1 });
          return res.end(MEDIA.subarray(s, e + 1));
        }
        res.writeHead(200, { ...base, 'content-length': MEDIA.length });
        return res.end(MEDIA);
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end('{"error":"nf"}');
    });
  });
  await new Promise((r) => up.listen(0, '127.0.0.1', r));
  const probe = http.createServer();
  await new Promise((r) => probe.listen(0, '127.0.0.1', r));
  down = probe.address().port;
  await new Promise((r) => probe.close(r));

  start = async (url, env = {}) => {
    const cfg = loadConfig({ MONOLITH_URL: url, ...env });
    const s = await new Promise((r) => { const x = createApp(cfg).listen(0, '127.0.0.1', () => r(x)); });
    return { s, base: `http://127.0.0.1:${s.address().port}` };
  };
  const g = await start(`http://127.0.0.1:${up.address().port}`);
  gw = g.s;
  gwBase = g.base;
});
after(() => { gw.close(); up.close(); up.closeAllConnections?.(); });

test('config: defaults', () => {
  const c = loadConfig({});
  assert.equal(c.monolithUrl, 'http://127.0.0.1:4000');
  assert.equal(c.corsOrigin, '*');
  assert.equal(c.isProduction, false);
});

test('GET passes path, query and status through; custom headers kept, upstream CORS dropped', async () => {
  const r = await fetch(`${gwBase}/api/echo?a=1&b=x%20y`);
  assert.equal(r.status, 201);
  assert.equal(r.headers.get('x-custom'), 'yes');
  assert.notEqual(r.headers.get('access-control-allow-origin'), 'https://upstream.example');
  assert.deepEqual(await r.json(), { got: '', q: 'a=1&b=x%20y' });
  assert.equal(seen.method, 'GET');
});

test('POST body bytes, method and content-type reach the upstream; Authorization and Cookie unchanged', async () => {
  const body = '{"name":"नमस्ते","n":1}';
  const r = await fetch(`${gwBase}/api/echo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer abc.def', cookie: 'pooja_admin=zzz' },
    body,
  });
  assert.equal((await r.json()).got, body);
  assert.equal(seen.method, 'POST');
  assert.equal(seen.headers['content-type'], 'application/json');
  assert.equal(seen.headers.authorization, 'Bearer abc.def');
  assert.equal(seen.headers.cookie, 'pooja_admin=zzz');
  for (const m of ['PUT', 'PATCH', 'DELETE']) {
    await fetch(`${gwBase}/api/echo`, { method: m, headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(seen.method, m);
  }
});

test('error bodies and statuses pass through unchanged', async () => {
  const r = await fetch(`${gwBase}/api/denied`);
  assert.equal(r.status, 402);
  assert.deepEqual(await r.json(), { error: 'no coins', code: 'insufficient_coins', shortfall: 4 });
});

test('multiple Set-Cookie headers survive', async () => {
  const r = await fetch(`${gwBase}/api/admin/login`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } });
  assert.deepEqual(r.headers.getSetCookie(), ['pooja_admin=abc; Path=/; HttpOnly; SameSite=None; Secure', 'other=1; Path=/']);
});

test('/uploads: full 200, Range 206 with Content-Range, ETag, Cache-Control, Content-Type', async () => {
  let r = await fetch(`${gwBase}/uploads/a.mp3`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('etag'), '"v1"');
  assert.equal(r.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal(r.headers.get('content-type'), 'audio/mpeg');
  assert.equal(Buffer.from(await r.arrayBuffer()).toString(), MEDIA.toString());
  r = await fetch(`${gwBase}/uploads/a.mp3`, { headers: { range: 'bytes=5-9' } });
  assert.equal(r.status, 206);
  assert.equal(seen.headers.range, 'bytes=5-9');
  assert.equal(r.headers.get('content-range'), 'bytes 5-9/20');
  assert.equal(Buffer.from(await r.arrayBuffer()).toString(), '56789');
});

test('/api/health: 200 with commit when upstream is healthy, 503 otherwise', async () => {
  const { s, base } = await start(`http://127.0.0.1:${up.address().port}`, { GIT_COMMIT: 'abc123' });
  upstreamOk = true;
  let r = await fetch(`${base}/api/health`);
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.equal(b.ok, true);
  assert.equal(b.commit, 'abc123');
  upstreamOk = false;
  r = await fetch(`${base}/api/health`);
  assert.equal(r.status, 503);
  assert.equal((await r.json()).ok, false);
  assert.equal((await fetch(`${base}/health`)).status, 503);
  upstreamOk = true;
  assert.equal((await fetch(`${base}/health`)).status, 200);
  s.close();
});

test('no GET / handler', async () => {
  assert.equal((await fetch(`${gwBase}/`)).status, 404);
});

test('upstream down -> 502 {error:"upstream_unavailable"}', async () => {
  const { s, base } = await start(`http://127.0.0.1:${down}`);
  const r = await fetch(`${base}/api/content`);
  assert.equal(r.status, 502);
  assert.equal((await r.json()).error, 'upstream_unavailable');
  assert.equal((await fetch(`${base}/api/health`)).status, 503);
  s.close();
});

test('CORS: credentialed, exact origin when CORS_ORIGIN is set; preflight answered by the gateway', async () => {
  const { s, base } = await start(`http://127.0.0.1:${up.address().port}`, { CORS_ORIGIN: 'admin.example.com/' });
  let r = await fetch(`${base}/api/echo`, { headers: { origin: 'https://admin.example.com' } });
  assert.equal(r.headers.get('access-control-allow-origin'), 'https://admin.example.com');
  assert.equal(r.headers.get('access-control-allow-credentials'), 'true');
  r = await fetch(`${base}/api/echo`, { headers: { origin: 'https://evil.example' } });
  assert.equal(r.headers.get('access-control-allow-origin'), null);
  const before = seen;
  r = await fetch(`${base}/api/anything`, { method: 'OPTIONS', headers: { origin: 'https://admin.example.com', 'access-control-request-method': 'POST' } });
  assert.equal(r.status, 204);
  assert.equal(seen, before, 'preflight never reached the monolith');
  s.close();
});

test('CORS: wildcard in production never allows credentials', async () => {
  const { s, base } = await start(`http://127.0.0.1:${up.address().port}`, { NODE_ENV: 'production', CORS_ORIGIN: '*' });
  const r = await fetch(`${base}/api/echo`, { headers: { origin: 'https://evil.example' } });
  assert.notEqual(r.headers.get('access-control-allow-credentials'), 'true');
  s.close();
});

test(`${NAME}: security headers and x-request-id`, async () => {
  const r = await fetch(`${gwBase}/api/echo`, { headers: { 'x-request-id': 'rid-1' } });
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-request-id'), 'rid-1');
  assert.equal(seen.headers['x-request-id'], 'rid-1');
  assert.equal(r.headers.get('x-powered-by'), null);
});
