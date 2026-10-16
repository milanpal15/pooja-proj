// The admin BFF carries COPIES of three things that live in the monolith: the PUBLIC allowlist, the session cookie format and
// the service-JWT format. When the monolith checkout is next to this one, fail on any drift.
// The monolith's config is frozen at first import, so the secret it will sign cookies with is fixed here, before any import of it.
process.env.ADMIN_SESSION_SECRET = 'cookie-parity-secret-123456';

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { signServiceToken, verifyServiceToken } from '../jwt.js';
import { PUBLIC, isPublic } from './public-routes.js';
import { COOKIE, createSessionCookies } from './session-cookie.js';
import { IDENTITY_ADMIN_ROUTES, identityAdminRouter } from './identity-routes.js';
import { areaFor } from './access/routes.js';
import { hasPermission, permissionsFor } from './access/permissions.js';

const mono = (f) => new URL(`../../../../../pooja-api/src/${f}`, import.meta.url);
const have = existsSync(fileURLToPath(mono('middleware/access.js')));
const skip = !have && 'pooja-api not checked out next to backend/';

test('PUBLIC allowlist equals pooja-api/src/middleware/access.js', { skip }, async () => {
  const m = await import(mono('middleware/access.js').href);
  assert.equal(PUBLIC.length, m.PUBLIC.length);
  PUBLIC.forEach((row, i) => {
    assert.equal(row.method, m.PUBLIC[i].method, `row ${i} method`);
    assert.equal(String(row.path), String(m.PUBLIC[i].path), `row ${i} path`);
  });
});

test('service JWTs are byte-identical to the monolith\'s, with and without ctx', { skip }, async () => {
  process.env.INTERNAL_JWT_SECRET = 'parity-secret-parity-secret';
  const m = await import(mono('lib/service-jwt.js').href);
  const opts = { secret: 'parity-secret-parity-secret', now: 1_700_000_000_000 };
  for (const claims of [
    { iss: 'admin-bff', sub: 'op1', role: 'admin', perms: ['a:view'], reqId: 'r1' },
    { iss: 'mobile-bff', sub: 'uid', role: 'devotee', ctx: { name: 'N', tok: { phone_number: '+91' } } },
    { iss: 'monolith' },
  ]) {
    assert.equal(signServiceToken(claims, opts), m.signServiceToken(claims, opts));
    assert.deepEqual(verifyServiceToken(m.signServiceToken(claims, opts), { ...opts, issuers: [claims.iss] }), m.verifyServiceToken(signServiceToken(claims, opts), { ...opts, issuers: [claims.iss] }));
  }
  assert.equal(verifyServiceToken(signServiceToken({ iss: 'x', ctx: { a: 1 } }, opts), opts).ctx.a, 1);
  assert.equal('ctx' in verifyServiceToken(signServiceToken({ iss: 'x' }, opts), opts), false, 'no ctx key unless given');
});

test('session cookie format equals the monolith\'s (name, payload, HMAC, attributes)', { skip }, async () => {
  const s = await import(mono('modules/operators/session.js').href);
  const now = () => Date.now();
  const mine = createSessionCookies({ secret: 'cookie-parity-secret-123456', sameSite: 'Strict', isProduction: false, now });
  assert.equal(COOKIE, s.COOKIE);
  const payload = { uid: 'abc', role: 'admin', exp: Date.now() + 60_000 };
  assert.equal(mine.sign(payload), s.sign(payload), 'same HMAC over the same payload');
  const req = { headers: { cookie: `${COOKIE}=${encodeURIComponent(s.sign(payload))}` } };
  assert.deepEqual(mine.sessionOf(req), payload, 'a cookie the monolith minted verifies here (an upgrade does not sign anyone out)');
  assert.equal(s.sessionOf({ headers: { cookie: `${COOKIE}=${encodeURIComponent(mine.sign(payload))}` } })?.uid, 'abc');
});

test('every identity-owned operator route resolves to a MAPPED area, the one the table declares', () => {
  for (const r of IDENTITY_ADMIN_ROUTES) {
    const a = areaFor(r.method, r.sample ?? r.path);
    assert.ok(a.mapped, `${r.method} ${r.path} has no entry in access/routes.js`);
    assert.equal(a.area, r.area, `${r.method} ${r.path}`);
  }
});

test('the router registers exactly the table; devotees/operators are admin-only, policies readable by editors', () => {
  const router = identityAdminRouter({ sessions: {}, client: {} });
  // The router nests: the CSV export route first (it must not be read as `/admin/users/:id`), then the generic table.
  const routesOf = (stack) => stack.flatMap((l) => (l.route ? Object.keys(l.route.methods).map((m) => `${m.toUpperCase()} ${l.route.path}`) : l.handle?.stack ? routesOf(l.handle.stack) : []));
  const registered = routesOf(router.stack);
  assert.deepEqual([...registered].sort(), IDENTITY_ADMIN_ROUTES.map((r) => `${r.method} /api${r.path}`).sort());
  assert.ok(registered.indexOf('GET /api/admin/users/export') < registered.indexOf('GET /api/admin/users/:id'), 'export is registered before :id');
  const ok = (role, r) => { const a = areaFor(r.method, r.sample ?? r.path); return hasPermission(permissionsFor(role), `${a.area}:${a.level}`); };
  for (const r of IDENTITY_ADMIN_ROUTES) {
    assert.ok(ok('admin', r));
    if (r.area !== 'policies') for (const role of ['editor', 'viewer']) assert.equal(ok(role, r), false, `${role} ${r.method} ${r.path}`);
    else {
      assert.equal(ok('viewer', r), r.method === 'GET');
      assert.equal(ok('editor', r), r.method === 'GET');
    }
  }
});

test('isPublic is exact: method and anchored path', () => {
  assert.ok(isPublic('GET', '/flags'));
  assert.ok(!isPublic('POST', '/flags'));
  assert.ok(!isPublic('GET', '/flags/full'));
  assert.ok(isPublic('POST', '/policy/terms/accept'));
  assert.ok(!isPublic('POST', '/ingest/payment'));
  assert.ok(!isPublic('GET', '/users'));
});

test('cookie unit: attributes, tamper, expiry, malformed input', () => {
  let t = 1_000_000;
  const strict = createSessionCookies({ secret: 'unit-secret-unit-secret', now: () => t });
  const none = createSessionCookies({ secret: 'unit-secret-unit-secret', sameSite: 'None', now: () => t });
  const prod = createSessionCookies({ secret: 'unit-secret-unit-secret', isProduction: true, now: () => t });
  const res = (c) => { const h = {}; c.set({ setHeader: (k, v) => (h[k] = v) }, { uid: 'u', role: 'admin' }); return h['Set-Cookie']; };
  assert.match(res(strict), /^pooja_admin=[^;]+; Path=\/; HttpOnly; SameSite=Strict; Max-Age=43200$/);
  assert.match(res(none), /SameSite=None; Max-Age=43200; Secure$/);
  assert.match(res(prod), /; Secure$/);
  const raw = res(strict).split(';')[0].split('=').slice(1).join('=');
  const req = (v) => ({ headers: { cookie: `a=b; pooja_admin=${v}` } });
  assert.equal(strict.sessionOf(req(raw)).uid, 'u');
  assert.equal(strict.sessionOf(req(`${raw}x`)), null, 'tampered');
  assert.equal(strict.sessionOf(req('x.y')), null);
  assert.equal(strict.sessionOf(req('%E0%A4%A')), null, 'bad percent-encoding does not throw');
  assert.equal(strict.sessionOf({ headers: {} }), null);
  t += 12 * 3600_000 + 1;
  assert.equal(strict.sessionOf(req(raw)), null, 'expired');
  assert.throws(() => createSessionCookies({ secret: 'short' }));
  let cleared;
  strict.clear({ setHeader: (_k, v) => (cleared = v) });
  assert.match(cleared, /Max-Age=0$/);
});
