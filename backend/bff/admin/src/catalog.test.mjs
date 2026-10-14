// Phase 3: the admin BFF applies the area gate to the catalog-owned operator routes, forwards role/perms in the signed token, audits
// the writes, streams uploads, and serves the app's read routes. Stand-ins for the monolith, identity, engagement and catalog.
// Run: node --test --test-concurrency=1 src/catalog.test.mjs   (no database needed)
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, beforeEach, describe, test } from 'node:test';

import {
  CATALOG_ADMIN_ROUTES, CATALOG_PUBLIC_GETS, CONTENT_RESOURCES, ENGAGEMENT_ADMIN_ROUTES, IDENTITY_ADMIN_ROUTES, areaFor, createOperatorGate, hasPermission, permissionsFor,
  verifyServiceToken,
} from '@bhakti/common';

import { createApp } from './app.js';
import { loadConfig } from './config.js';

const SECRET = 'test-secret-test-secret-1234';
const COOKIE_SECRET = 'cookie-secret-cookie-secret-12';
const quiet = { info() {}, warn() {}, error() {} };
const OPS = {
  aaaaaaaaaaaaaaaaaaaaaaaa: { username: 'root', role: 'admin', password: 'root-pass' },
  bbbbbbbbbbbbbbbbbbbbbbbb: { username: 'ed', role: 'editor', password: 'ed-pass' },
  cccccccccccccccccccccccc: { username: 'view', role: 'viewer', password: 'view-pass' },
};

let mono; let idn; let eng; let cat; let gw; let base;
let catCalls; let audits; let monoSeen; let catMode = 'ok';
let clock = Date.now();
const claimsOf = (req) => { try { return verifyServiceToken(req.headers.authorization?.replace(/^Bearer /, ''), { secret: SECRET }); } catch { return null; } };

function listen(handler, raw = false) {
  const s = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      handler(req, res, raw ? body : body.length ? JSON.parse(body.toString()) : undefined, (code, b, h = {}) => { res.writeHead(code, { 'content-type': 'application/json', ...h }); res.end(JSON.stringify(b)); });
    });
  });
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r(s)));
}

before(async () => {
  mono = await listen((req, res, body, json) => {
    if (req.url === '/api/health') return json(200, { ok: true });
    monoSeen.push({ method: req.method, url: req.url, claims: claimsOf(req) });
    json(200, { via: 'monolith', path: req.url.split('?')[0] });
  });
  eng = await listen((req, res, body, json) => {
    if (req.url === '/health') return json(200, {});
    if (req.url === '/internal/engagement/settings/map') return json(200, { settings: { prasadDelivery: '99' } });
    if (req.url === '/internal/engagement/announcements/current') return json(200, { announcement: null });
    json(200, { engagement: true });
  });
  idn = await listen((req, res, body, json) => {
    if (req.url === '/health') return json(200, {});
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/internal/identity/operators/session') {
      const o = OPS[u.searchParams.get('id')];
      return json(200, o ? { required: true, authed: true, id: u.searchParams.get('id'), username: o.username, role: o.role, permissions: permissionsFor(o.role) } : { required: true, authed: false });
    }
    if (u.pathname === '/internal/identity/operators/login') {
      const e = Object.entries(OPS).find(([, o]) => o.username === body.username && o.password === body.password);
      return e ? json(200, { id: e[0], username: e[1].username, role: e[1].role, permissions: permissionsFor(e[1].role) }) : json(401, { error: 'Wrong username or password', code: 'bad_credentials' });
    }
    if (u.pathname === '/internal/identity/audit') { audits.push({ claims: claimsOf(req), body }); return json(200, { ok: true }); }
    json(200, { identity: true });
  });
  cat = await listen((req, res, body, json) => {
    if (req.url === '/health') return json(catMode === 'down' ? 503 : 200, {});
    const u = new URL(req.url, 'http://x');
    const multipart = /multipart\//.test(req.headers['content-type'] || '');
    catCalls.push({ method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), claims: claimsOf(req), headers: req.headers, body: multipart ? body : (body.length ? JSON.parse(body.toString()) : undefined), raw: body });
    if (catMode === 'down') return req.socket.destroy();
    if (catMode === 'badtoken') return json(401, { error: 'bad', code: 'bad_signature' });
    if (u.pathname === '/internal/catalog/public/content') return json(200, { deities: [], temples: [], aartis: [], festivals: [], sevas: [], knowledge: [], faqs: [], hero: [], home: { sections: [] }, reminders: [], tones: [], wallpaperStyles: [] });
    if (u.pathname === '/internal/catalog/content/upload' && req.method === 'POST') return json(200, { url: '/uploads/6acf0a7fce86d1f7b8489916.png', bytes: body.length });
    if (u.pathname === '/internal/catalog/content/deities' && req.method === 'POST' && catMode === 'invalid') return json(400, { error: 'Could not save that.' });
    if (u.pathname === '/internal/catalog/admin/poojas' && req.method === 'POST' && catMode === 'invalid') return json(400, { error: 'Slug must be lowercase', code: 'bad_pooja' });
    if (req.method === 'GET' || req.method === 'DELETE') return json(200, { catalog: true, method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams) });
    json(req.method === 'POST' ? 201 : 200, { catalog: true, method: req.method, path: u.pathname, echoed: body });
  }, true);
  const config = loadConfig({
    MONOLITH_URL: `http://127.0.0.1:${mono.address().port}`,
    ENGAGEMENT_URL: `http://127.0.0.1:${eng.address().port}`,
    IDENTITY_URL: `http://127.0.0.1:${idn.address().port}`,
    CATALOG_URL: `http://127.0.0.1:${cat.address().port}`,
    INTERNAL_JWT_SECRET: SECRET, ADMIN_SESSION_SECRET: COOKIE_SECRET, SERVICE_TIMEOUT_MS: '1000',
  });
  gw = http.createServer(createApp(config, { logger: quiet, now: () => clock }));
  await new Promise((r) => gw.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${gw.address().port}`;
});
after(() => { for (const s of [gw, mono, idn, eng, cat]) s.closeAllConnections?.(); for (const s of [gw, mono, idn, eng, cat]) s.close(); });
beforeEach(() => { catCalls = []; audits = []; monoSeen = []; catMode = 'ok'; clock += 60_000; });

const settle = () => new Promise((r) => setTimeout(r, 80)); // audit POSTs are fire-and-forget
async function call(method, path, { headers = {}, body, raw } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, body: json, headers: res.headers, text };
}
const cookies = {};
async function as(role) {
  if (cookies[role]) return { cookie: cookies[role] };
  const name = { admin: 'root', editor: 'ed', viewer: 'view' }[role];
  const r = await call('POST', '/api/admin/login', { body: { username: name, password: `${name}-pass` } });
  assert.equal(r.status, 200, r.text);
  cookies[role] = r.headers.get('set-cookie').split(';')[0];
  return { cookie: cookies[role] };
}

describe('the route table (what this BFF hands to catalog)', () => {
  test('every route resolves to a MAPPED area, the one the table declares, with the right level', () => {
    for (const r of CATALOG_ADMIN_ROUTES) {
      const a = areaFor(r.method, r.sample ?? r.path);
      assert.ok(a.mapped, `${r.method} ${r.path} has no entry in access/routes.js (it would be admin-only)`);
      assert.equal(a.area, r.area, `${r.method} ${r.path}`);
      assert.equal(a.level, r.method === 'GET' ? 'view' : 'edit');
    }
  });

  test('it covers every dashboard resource, and does NOT take engagement\'s or identity\'s paths', () => {
    const mine = new Set(CATALOG_ADMIN_ROUTES.map((r) => `${r.method} ${r.path}`));
    for (const res of CONTENT_RESOURCES) for (const m of ['GET', 'POST']) assert.ok(mine.has(`${m} /content/${res}`), `${m} /content/${res}`);
    for (const other of [...ENGAGEMENT_ADMIN_ROUTES, ...IDENTITY_ADMIN_ROUTES]) assert.ok(!mine.has(`${other.method} ${other.path}`), `${other.method} ${other.path} belongs to another service`);
    assert.equal(CONTENT_RESOURCES.includes('settings'), false);
    assert.equal(CONTENT_RESOURCES.includes('announcements'), false);
  });

  test('a fixed path is registered before its /:id sibling (PUT /order must not be read as an id)', () => {
    const at = (m, p) => CATALOG_ADMIN_ROUTES.findIndex((r) => r.method === m && r.path === p);
    for (const p of ['/content/hero', '/admin/home-sections', '/admin/live-streams', '/admin/live-categories']) assert.ok(at('PUT', `${p}/order`) < at('PUT', `${p}/:id`), p);
    assert.ok(at('POST', '/admin/poojas/import-sevas') >= 0);
  });

  test('the public GETs are the monolith\'s public catalog reads, and not the reviews', () => {
    assert.deepEqual(CATALOG_PUBLIC_GETS.map((r) => r.path), ['/horoscope', '/panchang', '/live', '/live/:slug', '/poojas', '/poojas/:slug', '/chadhava/offerings', '/chadhava/listings', '/chadhava/listings/:slug']);
  });
});

describe('the area gate, role by role, over every catalog route', () => {
  test('the full role x route matrix: admin everything, editor content/horoscope/panchang writes, viewer reads; a stranger 401', async () => {
    const sample = (r) => (r.sample ?? r.path).replace(':date', '2026-01-01');
    for (const r of CATALOG_ADMIN_ROUTES) {
      for (const role of ['admin', 'editor', 'viewer']) {
        const held = permissionsFor(role);
        const a = areaFor(r.method, sample(r));
        const allowed = hasPermission(held, `${a.area}:${a.level}`);
        catCalls = [];
        const res = await call(r.method, `/api${sample(r)}`, { headers: await as(role), body: r.method === 'GET' || (r.method === 'DELETE' && !r.body) ? undefined : r.body ? { url: '/uploads/x.png' } : {} });
        if (allowed) {
          assert.ok([200, 201].includes(res.status), `${role} ${r.method} ${r.path} -> ${res.status}`);
          assert.equal(res.status, r.successStatus ?? 200, `${role} ${r.method} ${r.path}`);
          assert.equal(catCalls.length, 1);
        } else {
          assert.equal(res.status, 403, `${role} ${r.method} ${r.path}`);
          assert.deepEqual(res.body, { error: "You don't have permission for that.", code: 'forbidden', needs: `${a.area}:${a.level}` });
          assert.equal(catCalls.length, 0, 'a refused call never reaches catalog');
        }
      }
      const anon = await call(r.method, `/api${sample(r)}`, { body: r.method === 'GET' ? undefined : {} });
      assert.equal(anon.status, 401, `anon ${r.method} ${r.path}`);
    }
  });

  test('upload: viewer 403, stranger 401, editor allowed (area content)', async () => {
    const form = () => { const f = new FormData(); f.append('file', new Blob(['x'], { type: 'image/png' }), 'a.png'); return f; };
    const post = async (headers) => fetch(`${base}/api/content/upload`, { method: 'POST', headers, body: form() });
    assert.equal((await post({})).status, 401);
    assert.equal((await post((await as('viewer')))).status, 403);
    assert.equal((await post((await as('editor')))).status, 200);
    assert.equal((await post((await as('admin')))).status, 200);
  });
});

describe('forwarding', () => {
  test('catalog receives a token from admin-bff carrying the operator\'s id, role, perms and username', async () => {
    await call('POST', '/api/admin/poojas', { headers: await as('editor'), body: { slug: 'p', title: 'T' } });
    const c = catCalls[0];
    assert.equal(c.path, '/internal/catalog/admin/poojas');
    assert.equal(c.claims.iss, 'admin-bff');
    assert.equal(c.claims.sub, 'bbbbbbbbbbbbbbbbbbbbbbbb');
    assert.equal(c.claims.role, 'editor');
    assert.deepEqual(c.claims.perms, permissionsFor('editor'));
    assert.equal(c.claims.ctx.username, 'ed');
    assert.deepEqual(c.body, { slug: 'p', title: 'T' });
  });

  test('query strings pass through; 201 on create; the body is forwarded as parsed JSON (key order kept)', async () => {
    const r = await call('POST', '/api/content/hero', { headers: await as('admin'), body: { z: 1, a: 2, slug: 'h' } });
    assert.equal(r.status, 201);
    assert.equal(JSON.stringify(catCalls[0].body), '{"z":1,"a":2,"slug":"h"}');
    const g = await call('GET', '/api/content/horoscopes?date=2026-01-01&x=1', { headers: await as('admin') });
    assert.deepEqual(g.body.query, { date: '2026-01-01', x: '1' });
  });

  test('catalog\'s validation answers pass through unchanged (status, message and code)', async () => {
    catMode = 'invalid';
    const a = await call('POST', '/api/admin/poojas', { headers: await as('admin'), body: { slug: 'Bad' } });
    assert.deepEqual([a.status, a.body], [400, { error: 'Slug must be lowercase', code: 'bad_pooja' }]);
    const b = await call('POST', '/api/content/deities', { headers: await as('admin'), body: {} });
    assert.deepEqual([b.status, b.body], [400, { error: 'Could not save that.' }]);
  });

  test('a token catalog rejects is OUR problem: 502, never a 401 that would sign the operator out', async () => {
    catMode = 'badtoken';
    const r = await call('GET', '/api/admin/poojas', { headers: await as('admin') });
    assert.equal(r.status, 502);
    assert.notEqual(r.status, 401);
  });

  test('catalog down: the dashboard gets a JSON 502, the session is untouched', async () => {
    catMode = 'down';
    const r = await call('GET', '/api/admin/poojas', { headers: await as('admin') });
    assert.equal(r.status, 502);
    assert.equal(r.body.code, 'upstream_unavailable');
    catMode = 'ok';
    clock += 20_000; // let the client's circuit breaker cool
  });
});

describe('audit (every successful write, through identity)', () => {
  test('a write is recorded with operator, role, area, method, path, target and status - no body', async () => {
    const id = '6acf0a7fce86d1f7b8489916';
    await call('PUT', `/api/admin/poojas/${id}`, { headers: await as('editor'), body: { title: 'secret title' } });
    await settle();
    const a = audits.find((x) => x.body.path === `/api/admin/poojas/${id}`);
    assert.ok(a, JSON.stringify(audits));
    assert.deepEqual(a.body, { operator: 'ed', role: 'editor', area: 'content', method: 'PUT', path: `/api/admin/poojas/${id}`, targetId: id, status: 200 });
    assert.equal(JSON.stringify(a).includes('secret title'), false);
    assert.equal(a.claims.iss, 'admin-bff');
  });

  test('reads, refusals and failures are not audited; the streamed upload and the media delete are', async () => {
    audits.length = 0;
    await call('GET', '/api/admin/poojas', { headers: await as('admin') });
    await call('POST', '/api/admin/poojas', { headers: await as('viewer'), body: {} });
    catMode = 'invalid';
    await call('POST', '/api/content/deities', { headers: await as('admin'), body: {} });
    catMode = 'ok';
    await settle();
    assert.equal(audits.length, 0);
    const f = new FormData(); f.append('file', new Blob(['x'], { type: 'image/png' }), 'a.png');
    await fetch(`${base}/api/content/upload`, { method: 'POST', headers: await as('admin'), body: f });
    await call('DELETE', '/api/content/upload', { headers: await as('admin'), body: { url: '/uploads/x.png' } });
    await settle();
    assert.deepEqual(audits.map((a) => [a.body.method, a.body.path, a.body.status]), [['POST', '/api/content/upload', 200], ['DELETE', '/api/content/upload', 200]]);
  });
});

describe('uploads are streamed, not parsed', () => {
  test('the multipart body reaches catalog byte for byte, with its boundary, and a token that names the operator', async () => {
    const payload = Buffer.alloc(300_000, 9);
    const f = new FormData(); f.append('file', new Blob([payload], { type: 'text/html' }), 'tiny.png');
    const r = await fetch(`${base}/api/content/upload`, { method: 'POST', headers: await as('editor'), body: f });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).url, '/uploads/6acf0a7fce86d1f7b8489916.png');
    const c = catCalls.at(-1);
    assert.match(c.headers['content-type'], /^multipart\/form-data; boundary=/);
    assert.ok(c.raw.includes(payload), 'the bytes are intact');
    assert.equal(c.claims.iss, 'admin-bff');
    assert.equal(c.claims.sub, 'bbbbbbbbbbbbbbbbbbbbbbbb');
    assert.equal(c.headers.cookie, undefined, 'the operator cookie never travels');
  });

  test('catalog down: 503 catalog_unavailable (and the gate ran first: a viewer is still 403)', async () => {
    catMode = 'down';
    const f = () => { const x = new FormData(); x.append('file', new Blob(['x'], { type: 'image/png' }), 'a.png'); return x; };
    const r = await fetch(`${base}/api/content/upload`, { method: 'POST', headers: await as('admin'), body: f() });
    assert.deepEqual([r.status, (await r.json()).code], [503, 'catalog_unavailable']);
    assert.equal((await fetch(`${base}/api/content/upload`, { method: 'POST', headers: await as('viewer'), body: f() })).status, 403);
  });
});

describe('public reads work here too (no session): /api/content and the read routes', () => {
  test('GET /api/content is assembled and needs no cookie', async () => {
    const r = await call('GET', '/api/content');
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body), ['deities', 'temples', 'aartis', 'festivals', 'sevas', 'knowledge', 'faqs', 'hero', 'home', 'reminders', 'tones', 'wallpaperStyles', 'settings', 'announcement']);
    assert.equal(catCalls[0].claims.iss, 'admin-bff');
  });

  test('the public reads and /uploads, no cookie; routes catalog does not own still go to the monolith through the identity gate', async () => {
    assert.equal((await call('GET', '/api/poojas')).body.catalog, true);
    assert.equal((await call('GET', '/api/poojas/p1/reviews')).body.via, 'monolith', 'reviews stay with the reviews');
    assert.equal(monoSeen.at(-1).claims, null, '...and a stranger arrives there with no operator token (the monolith\'s gate decides)');
    assert.equal((await call('GET', '/api/admin/bookings', { headers: await as('admin') })).body.via, 'monolith');
    const up = await fetch(`${base}/uploads/6acf0a7fce86d1f7b8489916.png`);
    assert.equal(up.status, 200);
    await up.arrayBuffer();
    assert.match(catCalls.at(-1).path, /^\/internal\/catalog\/media\//);
  });

  test('POST /api/live/:slug/jai is the mobile BFF\'s: here it falls through to the monolith gate', async () => {
    const r = await call('POST', '/api/live/kashi/jai', { body: {} });
    assert.equal(catCalls.length, 0);
    assert.ok(r.status === 404 || r.status === 200);
  });
});

describe('without IDENTITY_URL (phase 1/2 legacy): the monolith still owns the session and the audit log', () => {
  let legacyMono; let legacy; let lbase; let sessions; let monoAudits;
  before(async () => {
    legacyMono = await listen((req, res, body, json) => {
      if (req.url === '/api/health') return json(200, { ok: true });
      if (req.url === '/api/admin/session') { sessions.push(req.headers.cookie); return json(200, /pooja_admin=ed/.test(req.headers.cookie || '') ? { required: true, authed: true, username: 'ed', role: 'editor', permissions: permissionsFor('editor') } : { required: true, authed: false }); }
      if (req.url === '/internal/audit') { monoAudits.push(body); return json(200, { ok: true }); }
      json(200, { via: 'monolith' });
    });
    const config = loadConfig({ MONOLITH_URL: `http://127.0.0.1:${legacyMono.address().port}`, ENGAGEMENT_URL: `http://127.0.0.1:${eng.address().port}`, CATALOG_URL: `http://127.0.0.1:${cat.address().port}`, INTERNAL_JWT_SECRET: SECRET, SERVICE_TIMEOUT_MS: '1000' });
    legacy = http.createServer(createApp(config, { logger: quiet }));
    await new Promise((r) => legacy.listen(0, '127.0.0.1', r));
    lbase = `http://127.0.0.1:${legacy.address().port}`;
    sessions = []; monoAudits = [];
  });
  after(() => { for (const s of [legacy, legacyMono]) s.closeAllConnections?.(); for (const s of [legacy, legacyMono]) s.close(); });

  test('operator routes: the session is asked of the monolith, the gate is applied here, the write is audited through the monolith', async () => {
    const ed = { cookie: 'pooja_admin=ed' };
    assert.equal((await fetch(`${lbase}/api/admin/poojas`)).status, 401);
    assert.equal((await fetch(`${lbase}/api/admin/poojas`, { headers: ed })).status, 200);
    assert.equal((await fetch(`${lbase}/api/admin/operators`, { headers: ed })).status, 200, 'not catalog\'s: it goes to the monolith, which decides');
    const w = await fetch(`${lbase}/api/content/deities`, { method: 'POST', headers: { ...ed, 'content-type': 'application/json' }, body: '{"slug":"x"}' });
    assert.equal(w.status, 201);
    await settle();
    assert.deepEqual(monoAudits.map((a) => [a.operator, a.method, a.path, a.status]), [['ed', 'POST', '/api/content/deities', 201]]);
    assert.ok(sessions.length >= 2);
    assert.equal((await fetch(`${lbase}/api/content`)).status, 200, 'and the public content needs no session');
  });
});

describe('createOperatorGate is exported for other mounts', () => {
  test('it is the same middleware the routers use', () => {
    assert.equal(typeof createOperatorGate, 'function');
  });
});

describe('configuration', () => {
  test('CATALOG_URL needs the secret and ENGAGEMENT_URL; unset leaves the BFF as before', () => {
    const env = { MONOLITH_URL: 'http://m', INTERNAL_JWT_SECRET: SECRET };
    assert.throws(() => loadConfig({ ...env, CATALOG_URL: 'http://c' }), /ENGAGEMENT_URL/);
    assert.throws(() => loadConfig({ ...env, INTERNAL_JWT_SECRET: '', CATALOG_URL: 'http://c', ENGAGEMENT_URL: 'http://e' }), /INTERNAL_JWT_SECRET/);
    assert.equal(loadConfig({ ...env, CATALOG_URL: 'http://c', ENGAGEMENT_URL: 'http://e' }).catalogUrl, 'http://c');
    assert.equal(loadConfig(env).catalogUrl, '');
  });
});
