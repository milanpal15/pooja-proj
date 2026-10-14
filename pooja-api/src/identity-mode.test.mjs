// Phase 2 (IDENTITY_URL set): the monolith TRUSTS the BFFs' signed service tokens, serves nothing identity owns, and reads
// user facts from the identity service. Real app, real gate; identity is a local stand-in.
// Run: TEST_MONGODB_URI=mongodb://127.0.0.1:27161/identity_mode node --test --test-concurrency=1 src/identity-mode.test.mjs
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, beforeEach, describe, test } from 'node:test';

import mongoose from 'mongoose';

import { createApp } from './app.js';
import { permissionsFor } from './access/permissions.js';
import { pseudonym } from './access/redact.js';
import * as identityClient from './lib/identity-client.js';
import { signServiceToken } from './lib/service-jwt.js';
import * as directory from './lib/user-directory.js';
import { AuditLog, Operator, User } from './models.js';
import { Astrologer } from './modules/astrologers/astrologer.model.js';
import { Wallet, WalletTxn } from './modules/wallet/wallet.model.js';

const SECRET = 'identity-mode-secret-1234567890';
const dbUri = () => {
  const u = new URL(process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27161/identity_mode');
  u.pathname = '/identity_mode';
  return u.toString();
};

let server;
let base;
let stub;
let stubCalls;
let stubMode = 'ok'; // ok | down
const USERS = {
  'uid-a': { uid: 'uid-a', name: 'Asha Real', contact: '+919999900011', deviceId: 'dev-a', role: 'devotee' },
  'uid-b': { uid: 'uid-b', name: '', contact: 'b@example.com', deviceId: null, role: 'devotee' },
};

before(async () => {
  stub = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const json = (code, b) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(b)); };
      stubCalls.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: raw ? JSON.parse(raw) : undefined });
      if (stubMode === 'down') return req.socket.destroy();
      const u = new URL(req.url, 'http://x');
      const m = /^\/internal\/identity\/directory\/users\/([^/]+)(\/role)?$/.exec(u.pathname);
      if (m && !m[2] && req.method === 'GET') return USERS[m[1]] ? json(200, { user: USERS[m[1]] }) : json(404, { error: 'nf' });
      if (m && m[2]) return json(200, { ok: true });
      if (u.pathname === '/internal/identity/directory/lookup') {
        return json(200, { users: JSON.parse(raw).uids.filter((x) => USERS[x]).map((x) => ({ uid: x, name: USERS[x].name, contact: USERS[x].contact })) });
      }
      if (u.pathname === '/internal/identity/directory/search') return json(200, { users: Object.values(USERS) });
      json(404, { error: 'nf' });
    });
  });
  await new Promise((ok) => stub.listen(0, '127.0.0.1', ok));
  process.env.INTERNAL_JWT_SECRET = SECRET;
  process.env.IDENTITY_URL = `http://127.0.0.1:${stub.address().port}`;

  await mongoose.connect(dbUri());
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  server = http.createServer(createApp());
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.close();
  stub.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
beforeEach(() => { stubCalls = []; stubMode = 'ok'; identityClient._reset(); });

const mobile = (o = {}) => signServiceToken({ iss: 'mobile-bff', sub: 'uid-a', role: 'devotee', ctx: { name: 'Asha Real', role: 'devotee' }, ...o }, { secret: SECRET });
const adminTok = (role = 'admin', o = {}) => signServiceToken({ iss: 'admin-bff', sub: `op-${role}`, role, perms: permissionsFor(role), ctx: { username: `${role}1` }, ...o }, { secret: SECRET });
const bearer = (t) => (t ? { authorization: `Bearer ${t}` } : {});

async function call(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...bearer(token), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { status: res.status, body: json, text };
}

describe('devotee routes trust the mobile BFF token (and only that)', () => {
  test('no bearer is 401 "missing bearer token", exactly as before', async () => {
    const r = await call('GET', '/api/bookings');
    assert.equal(r.status, 401);
    assert.equal(r.body.error, 'missing bearer token');
  });

  test('a valid mobile-bff token reaches the route with the devotee as its subject', async () => {
    const r = await call('GET', '/api/bookings', { token: mobile() });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { bookings: [] });
  });

  test('refused: a raw Firebase-style token, garbage, a wrong secret, an expired token, the ADMIN BFF\'s token', async () => {
    const fb = `${Buffer.from('{"alg":"RS256"}').toString('base64url')}.${Buffer.from('{"user_id":"u","aud":"p"}').toString('base64url')}.sig`;
    const wrong = signServiceToken({ iss: 'mobile-bff', sub: 'uid-a' }, { secret: 'some-other-secret-1234567' });
    const old = signServiceToken({ iss: 'mobile-bff', sub: 'uid-a' }, { secret: SECRET, now: Date.now() - 120_000 });
    for (const t of [fb, 'garbage', wrong, old, adminTok('admin')]) {
      const r = await call('GET', '/api/bookings', { token: t });
      assert.equal(r.status, 401, t.slice(0, 20));
      assert.equal(r.body.error, 'invalid token');
    }
  });

  test('a token with no subject is not a devotee', async () => {
    assert.equal((await call('GET', '/api/bookings', { token: mobile({ sub: null }) })).status, 401);
  });

  test('the BFF\'s verdicts surface as before: blocked 403, identity down 503, bad Firebase token 401', async () => {
    const sub = (ctx) => signServiceToken({ iss: 'mobile-bff', sub: null, ctx }, { secret: SECRET });
    const blocked = await call('GET', '/api/bookings', { token: sub({ authError: 'blocked' }) });
    assert.deepEqual([blocked.status, blocked.body.error], [403, 'account blocked']);
    const down = await call('GET', '/api/bookings', { token: sub({ authError: 'unavailable', detail: 'identity is unavailable' }) });
    assert.deepEqual([down.status, down.body.error], [503, 'auth unavailable']);
    const bad = await call('GET', '/api/bookings', { token: sub({ authError: 'invalid', detail: 'expired' }) });
    assert.deepEqual([bad.status, bad.body.error, bad.body.detail], [401, 'invalid token', 'expired']);
    // a forged "authError" with no valid signature is just an invalid token
    const forged = signServiceToken({ iss: 'mobile-bff', sub: 'x', ctx: { authError: 'blocked' } }, { secret: 'a-forger-secret-1234567' });
    assert.equal((await call('GET', '/api/bookings', { token: forged })).status, 401);
  });

  test('req.user/req.token come from the claims (name, role), never from the database', async () => {
    const { requireAuth } = await import('./middleware/require-auth.js');
    const req = { headers: { authorization: `Bearer ${mobile({ sub: 'uid-z', ctx: { name: 'Zed', role: 'astrologer', tok: { phone_number: '+911' } } })}` } };
    let out;
    await requireAuth(req, { status() { return this; }, json() { return this; } }, () => { out = req; });
    assert.deepEqual([req.token.uid, req.token.phone_number, req.user.name, req.user.role, req.role, req.user.blocked], ['uid-z', '+911', 'Zed', 'astrologer', 'astrologer', false]);
    assert.ok(out);
    assert.equal(await User.countDocuments(), 0, 'the monolith read no users');
  });
});

describe('operator routes trust the admin BFF token (and only that); the area gate still applies', () => {
  test('no token / mobile token / forged / expired -> 401 "Sign in required"', async () => {
    const wrong = signServiceToken({ iss: 'admin-bff', sub: 'op', role: 'admin', perms: permissionsFor('admin') }, { secret: 'some-other-secret-1234567' });
    const old = signServiceToken({ iss: 'admin-bff', sub: 'op', role: 'admin', perms: permissionsFor('admin') }, { secret: SECRET, now: Date.now() - 120_000 });
    for (const t of [undefined, mobile(), wrong, old, 'junk']) {
      const r = await call('GET', '/api/content/deities', { token: t });
      assert.equal(r.status, 401);
      assert.deepEqual(r.body, { error: 'Sign in required' });
    }
  });

  test('the BFF\'s "could not establish the operator" verdicts are 503, never 401 (would sign the operator out) and never open', async () => {
    const tokenWith = (authError) => signServiceToken({ iss: 'admin-bff', sub: null, ctx: { authError } }, { secret: SECRET });
    const down = await call('GET', '/api/content/deities', { token: tokenWith('unavailable') });
    assert.deepEqual([down.status, down.body.code], [503, 'identity_unavailable']);
    const locked = await call('GET', '/api/content/deities', { token: tokenWith('no_operators') });
    assert.deepEqual([locked.status, locked.body.code], [503, 'no_operators']);
    // an open (app) route is unaffected by it; a forged verdict is just an invalid token
    assert.equal((await call('GET', '/api/poojas', { token: tokenWith('unavailable') })).status, 200);
    const forged = signServiceToken({ iss: 'admin-bff', sub: null, ctx: { authError: 'unavailable' } }, { secret: 'a-forger-secret-1234567' });
    assert.equal((await call('GET', '/api/content/deities', { token: forged })).status, 401);
  });

  test('a legacy cookie is worthless', async () => {
    const r = await call('GET', '/api/content/deities', { headers: { cookie: 'pooja_admin=anything' } });
    assert.equal(r.status, 401);
  });

  test('role matrix on a sample of routes: permissions come from the signed claims', async () => {
    const want = {
      admin: { read: 200, write: 404, money: 200, devotees: 404 },
      editor: { read: 200, write: 404, money: 200, devotees: 403 },
      viewer: { read: 200, write: 403, money: 200, devotees: 403 },
    };
    for (const [role, w] of Object.entries(want)) {
      const t = adminTok(role);
      assert.equal((await call('GET', '/api/content/deities', { token: t })).status, w.read, `${role} read`);
      assert.equal((await call('PUT', '/api/content/deities/000000000000000000000001', { token: t, body: { name: 'x' } })).status, w.write, `${role} write`);
      assert.equal((await call('GET', '/api/admin/coin-stats', { token: t })).status, w.money, `${role} money`);
      assert.equal((await call('GET', '/api/users', { token: t })).status, w.devotees, `${role} devotees`);
    }
  });

  test('a token that claims admin but carries viewer permissions gets viewer access', async () => {
    const t = adminTok('admin', { perms: permissionsFor('viewer') });
    assert.equal((await call('PUT', '/api/content/deities/000000000000000000000001', { token: t, body: {} })).status, 403);
  });

  test('wallet lookup still needs devotees:view, and the search goes to identity carrying the operator\'s claims', async () => {
    assert.equal((await call('GET', '/api/admin/wallets?q=a', { token: adminTok('editor') })).status, 403);
    const r = await call('GET', '/api/admin/wallets?q=asha', { token: adminTok('admin') });
    assert.equal(r.status, 200);
    const s = stubCalls.find((c) => c.url.startsWith('/internal/identity/directory/search'));
    assert.ok(s, 'identity was asked');
    const claims = JSON.parse(Buffer.from(s.auth.split('.')[1], 'base64url'));
    assert.deepEqual([claims.iss, claims.sub, claims.role], ['monolith', 'op-admin', 'admin']);
    assert.ok(claims.perms.includes('devotees:view'));
  });

  test('wallet lookup with identity down is a clear 503, not a 500 and not an empty "no devotees"', async () => {
    stubMode = 'down';
    const r = await call('GET', '/api/admin/wallets?q=asha', { token: adminTok('admin') });
    assert.equal(r.status, 503);
    assert.equal(r.body.code, 'identity_unavailable');
  });

  test('the monolith writes no audit rows and has no operators of its own in this mode', async () => {
    const ok = await call('PUT', '/api/horoscope/day/2026-03-03', { token: adminTok('editor'), body: { readings: [] } });
    assert.ok(ok.status < 400, `${ok.status}`);
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(await AuditLog.countDocuments(), 0);
    assert.equal(await Operator.countDocuments(), 0);
  });
});

describe('everything identity owns is retired here (the BFFs serve it)', () => {
  test('auth, users, operators, policies, session endpoints and /internal/audit answer 404', async () => {
    const t = adminTok('admin');
    assert.equal((await call('POST', '/api/auth/sync', { token: t, body: {} })).status, 404);
    assert.equal((await call('GET', '/api/users', { token: t })).status, 404);
    assert.equal((await call('POST', '/api/users', { token: t, body: { contact: 'x' } })).status, 404, 'the 410 now lives in identity');
    assert.equal((await call('GET', '/api/admin/operators', { token: t })).status, 404);
    assert.equal((await call('GET', '/api/admin/audit-log', { token: t })).status, 404);
    assert.equal((await call('GET', '/api/admin/policies', { token: t })).status, 404);
    assert.equal((await call('GET', '/api/policy/terms')).status, 404);
    assert.equal((await call('POST', '/api/policy/terms/accept', { token: mobile(), body: {} })).status, 404);
    assert.equal((await call('POST', '/api/admin/login', { body: { username: 'a', password: 'b' } })).status, 404);
    assert.equal((await call('GET', '/api/admin/session')).status, 404);
    assert.equal((await call('POST', '/internal/audit', { token: adminTok('admin'), body: { operator: 'x' } })).status, 404);
  });

  test('unauthenticated strangers still get 401, not 404, on the gated ones (the gate runs first)', async () => {
    for (const p of ['/api/users', '/api/admin/operators', '/api/admin/policies', '/api/admin/audit-log', '/api/flags/full']) {
      assert.equal((await call('GET', p)).status, 401, p);
    }
    assert.equal((await call('GET', '/api/auth/me')).status, 401);
  });

  test('the monolith serves no auth even if a valid mobile token is presented (the BFF is the only way in)', async () => {
    assert.equal((await call('GET', '/api/auth/me', { token: mobile() })).status, 401, 'falls to the gate, which wants an operator');
  });
});

describe('POST /internal/astrologers/* (identity -> monolith)', () => {
  const idn = (iss = 'identity') => signServiceToken({ iss, sub: 'uid-x' }, { secret: SECRET });

  test('only the identity issuer; no token, wrong issuer and forged tokens are 401', async () => {
    for (const t of [undefined, mobile(), adminTok(), signServiceToken({ iss: 'identity' }, { secret: 'other-secret-12345678901' })]) {
      assert.equal((await call('POST', '/internal/astrologers/claim', { token: t, body: { decoded: { uid: 'u' } } })).status, 401);
      assert.equal((await call('GET', '/internal/astrologers/active?uid=u', { token: t })).status, 401);
    }
  });

  test('claim: a verified phone takes the invite once; the uid is bound; a second uid cannot take it', async () => {
    await Astrologer.create({ name: 'Pandit Claim', signInPhone: '+919877700001', status: 'invited', ratePerMin: 5 });
    const r1 = await call('POST', '/internal/astrologers/claim', { token: idn(), body: { decoded: { uid: 'u-claim', phone_number: '+919877700001' } } });
    assert.equal(r1.status, 200);
    assert.equal(r1.body.astrologer.name, 'Pandit Claim');
    const a = await Astrologer.findOne({ signInPhone: '+919877700001' }).lean();
    assert.deepEqual([a.uid, a.status], ['u-claim', 'active']);
    const again = await call('POST', '/internal/astrologers/claim', { token: idn(), body: { decoded: { uid: 'u-claim' } } });
    assert.equal(again.body.astrologer.name, 'Pandit Claim', 'idempotent for the same uid');
    const thief = await call('POST', '/internal/astrologers/claim', { token: idn(), body: { decoded: { uid: 'u-thief', phone_number: '+919877700001' } } });
    assert.equal(thief.body.astrologer, null);
    assert.equal((await Astrologer.findOne({ signInPhone: '+919877700001' })).uid, 'u-claim');
  });

  test('claim: an UNverified email never claims; a Google email does; suspended is null', async () => {
    await Astrologer.create({ name: 'Mail Pandit', signInEmail: 'rishi@example.com', status: 'invited', ratePerMin: 5 });
    const typed = await call('POST', '/internal/astrologers/claim', { token: idn(), body: { decoded: { uid: 'u-typed', email: 'rishi@example.com', email_verified: false } } });
    assert.equal(typed.body.astrologer, null);
    const g = await call('POST', '/internal/astrologers/claim', { token: idn(), body: { decoded: { uid: 'u-g', email: 'Rishi@Example.com', email_verified: false, firebase: { sign_in_provider: 'google.com' } } } });
    assert.equal(g.body.astrologer?.name, 'Mail Pandit');
    await Astrologer.updateOne({ signInEmail: 'rishi@example.com' }, { $set: { status: 'suspended' } });
    assert.equal((await call('POST', '/internal/astrologers/claim', { token: idn(), body: { decoded: { uid: 'u-g' } } })).body.astrologer, null);
  });

  test('claim validates its input; active is read-only and answers only ACTIVE astrologers', async () => {
    assert.equal((await call('POST', '/internal/astrologers/claim', { token: idn(), body: {} })).status, 400);
    assert.equal((await call('POST', '/internal/astrologers/claim', { token: idn(), body: { decoded: { uid: { $ne: 1 } } } })).status, 400);
    assert.equal((await call('GET', '/internal/astrologers/active', { token: idn() })).status, 400);
    assert.equal((await call('GET', '/internal/astrologers/active?uid=u-claim', { token: idn() })).body.astrologer.name, 'Pandit Claim');
    assert.equal((await call('GET', '/internal/astrologers/active?uid=u-g', { token: idn() })).body.astrologer, null, 'suspended');
    assert.equal((await call('GET', '/internal/astrologers/active?uid=ghost', { token: idn() })).body.astrologer, null);
  });
});

describe('the user directory (identity-client + user-directory)', () => {
  test('names come from identity, are cached, and fall back to contact', async () => {
    const m = await directory.whoByUid(['uid-a', 'uid-b', 'uid-ghost']);
    assert.deepEqual([...m], [['uid-a', 'Asha Real'], ['uid-b', 'b@example.com']]);
    assert.equal(stubCalls.filter((c) => c.url.endsWith('/lookup')).length, 1, 'one batch call');
  });

  test('profile name: the verified token\'s name wins and costs no call; otherwise identity answers (cached)', async () => {
    assert.equal(await directory.userName('uid-a', 'From Token'), 'From Token');
    assert.equal(stubCalls.length, 0);
    assert.equal(await directory.userName('uid-a'), 'Asha Real');
    assert.equal(await directory.userName('uid-a'), 'Asha Real');
    assert.equal(stubCalls.length, 1, 'second read is cached');
    assert.equal(await directory.userName('uid-ghost'), '');
    assert.equal(await directory.deviceIdOf('uid-a'), 'dev-a');
    assert.equal(await directory.deviceIdOf('uid-b'), undefined);
  });

  test('NON-critical reads never throw when identity is down: absent values, and the next 5 s skip the network', async () => {
    stubMode = 'down';
    assert.equal(await directory.userName('uid-a'), '');
    assert.equal(await directory.deviceIdOf('uid-a'), undefined);
    assert.deepEqual([...(await directory.whoByUid(['uid-a']))], []);
    assert.equal(stubCalls.length, 1, 'after one failure the rest of the burst did not hit the network');
  });

  test('a stale cached answer is served when identity goes down', async () => {
    assert.equal(await directory.userName('uid-a'), 'Asha Real');
    stubMode = 'down';
    stubCalls = [];
    // cache is fresh (15 s) so no call is made at all
    assert.equal(await directory.userName('uid-a'), 'Asha Real');
    assert.equal(stubCalls.length, 0);
  });

  test('the role write is best effort: identity down does not throw into the astrologer request', async () => {
    await directory.setUserRole('uid-a', 'astrologer');
    assert.deepEqual(stubCalls.map((c) => [c.method, c.url, c.body]), [['PUT', '/internal/identity/directory/users/uid-a/role', { role: 'astrologer' }]]);
    stubMode = 'down';
    identityClient._reset();
    await assert.doesNotReject(directory.setUserRole('uid-a', 'devotee'));
  });

  test('calls to identity are signed by the monolith with the shared secret', async () => {
    await directory.userName('uid-b');
    const claims = JSON.parse(Buffer.from(stubCalls[0].auth.split('.')[1], 'base64url'));
    assert.equal(claims.iss, 'monolith');
  });
});

describe('masking is preserved when names come from identity', () => {
  before(async () => {
    await Wallet.create({ uid: 'uid-a', balance: 50 });
    await WalletTxn.create({ uid: 'uid-a', type: 'adjustment', amount: 5, balanceAfter: 55, status: 'posted', idempotencyKey: 'idm-1', createdBy: 'ops', note: 'Goodwill credit for Asha Real' });
  });

  test('admin sees the name identity returned; editor and viewer see only the pseudonym and no note text', async () => {
    const a = await call('GET', '/api/admin/wallet-transactions', { token: adminTok('admin') });
    assert.equal(a.body.transactions[0].who, 'Asha Real');
    for (const role of ['editor', 'viewer']) {
      const r = await call('GET', '/api/admin/wallet-transactions', { token: adminTok(role) });
      assert.equal(r.status, 200);
      assert.equal(r.body.transactions[0].who, pseudonym('uid-a'));
      assert.ok(!r.text.includes('Asha Real'), `${role} leaked the name`);
      assert.ok(!r.text.includes('+919999900011'));
    }
  });
});
