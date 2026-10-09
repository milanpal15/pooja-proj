// RBAC through the REAL gate on the REAL app — DESIGN.md §21.7.
// Run: TEST_MONGODB_URI=mongodb://127.0.0.1:27121/rbac_tests node --test --test-concurrency=1 src/access/access.test.mjs
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, test } from 'node:test';

import mongoose from 'mongoose';

import { createApp } from '../app.js';
import { PUBLIC } from '../middleware/access.js';
import { AuditLog, Operator, Pooja, PoojaReview, Setting, User } from '../models.js';
import { Booking } from '../modules/bookings/booking.model.js';
import { CallSession } from '../modules/calls/call.model.js';
import { ChadhavaOrder } from '../modules/chadhava/chadhava.model.js';
import { CoinOrder } from '../modules/coins/coins.model.js';
import { Astrologer } from '../modules/astrologers/astrologer.model.js';
import { hashPassword } from '../modules/operators/index.js';
import { sign } from '../modules/operators/session.js';
import { Wallet, WalletTxn } from '../modules/wallet/wallet.model.js';
import { AREAS, ROLE_PERMISSIONS, can, permissionsFor } from './permissions.js';
import { maskEmail, maskPhone, pseudonym } from './redact.js';
import { areaFor } from './routes.js';

const OID = '000000000000000000000001';
const dbUri = () => {
  const u = new URL(process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27121/rbac_tests');
  u.pathname = '/rbac_tests';
  return u.toString();
};

let app;
let server;
let base;
const cookies = {};
const ids = {};

before(async () => {
  await mongoose.connect(dbUri());
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  for (const role of ['admin', 'editor', 'viewer']) {
    const o = await Operator.create({ username: `${role}1`, passwordHash: hashPassword('password-123'), role });
    ids[role] = String(o._id);
    cookies[role] = `pooja_admin=${encodeURIComponent(sign({ uid: String(o._id), role, exp: Date.now() + 3600_000 }))}`;
  }
  app = createApp();
  server = http.createServer(app);
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function call(role, method, path, body) {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(role ? { cookie: cookies[role] } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { status: res.status, body: json, text };
}

/* One representative real route per (area, level). Writes use ids that do not exist
   or bodies the handler rejects, so "allowed" means "got past the gate", never a side effect. */
const VIEW = {
  overview: ['GET', '/analytics/trend'],
  content: ['GET', '/content/deities'],
  horoscope: ['GET', '/horoscope/day/2026-01-01'],
  panchang: ['GET', '/content/panchangs'],
  announcements: ['GET', '/content/announcements'],
  push: ['GET', '/admin/announcements/x/push'], // no GET handler: the gate answers first
  flags: ['GET', '/flags/full'],
  policies: ['GET', '/admin/policies'],
  devotees: ['GET', '/users'],
  astrologers: ['GET', '/admin/astrologers'],
  money: ['GET', '/admin/coin-stats'],
  wallets: ['GET', '/admin/wallet-transactions'],
  orders: ['GET', '/admin/coin-orders'],
  calls: ['GET', '/admin/calls'],
  payouts: ['GET', '/admin/payouts/summary'],
  operators: ['GET', '/admin/operators'],
};
const EDIT = {
  overview: ['POST', '/analytics/reset', {}],
  content: ['PUT', `/content/deities/${OID}`, {}],
  horoscope: ['PUT', '/horoscope/day/2026-01-01', { readings: [] }],
  panchang: ['PUT', `/content/panchangs/${OID}`, {}],
  announcements: ['PUT', `/content/announcements/${OID}`, {}],
  push: ['POST', `/admin/announcements/${OID}/push`, {}],
  flags: ['PUT', '/flags/bhajan', { enabled: true }],
  policies: ['PUT', '/admin/policies/terms', { title: 't', bodyMd: 'b' }],
  devotees: ['PUT', `/users/${OID}`, {}],
  astrologers: ['PUT', `/admin/astrologers/${OID}`, {}],
  money: ['PUT', `/admin/coin-packs/${OID}`, {}],
  wallets: ['POST', '/admin/wallet/adjust', {}],
  orders: ['POST', '/admin/coin-orders', {}],
  calls: ['POST', `/admin/calls/${OID}/end`, {}],
  payouts: ['POST', '/admin/payouts', {}],
  operators: ['PUT', `/admin/operators/${OID}`, {}],
};

test('every area has a representative route for both levels', () => {
  assert.deepEqual(Object.keys(VIEW).sort(), [...AREAS].sort());
  assert.deepEqual(Object.keys(EDIT).sort(), [...AREAS].sort());
  for (const [a, [m, p]] of Object.entries(VIEW)) assert.equal(areaFor(m, p).area, a, `view ${p}`);
  for (const [a, [m, p]] of Object.entries(EDIT)) assert.equal(areaFor(m, p).area, a, `edit ${p}`);
});

describe('permission matrix (generated from ROLE_PERMISSIONS)', () => {
  for (const role of Object.keys(ROLE_PERMISSIONS)) {
    for (const area of AREAS) {
      for (const level of ['view', 'edit']) {
        const allowed = ROLE_PERMISSIONS[role].includes(`${area}:${level}`) || (level === 'view' && ROLE_PERMISSIONS[role].includes(`${area}:edit`));
        test(`${role} ${area}:${level} -> ${allowed ? 'allowed' : '403'}`, async () => {
          assert.equal(can(role, area, level), allowed);
          const [method, path, body] = level === 'view' ? VIEW[area] : EDIT[area];
          const r = await call(role, method, path, body);
          if (allowed) {
            assert.notEqual(r.status, 403, `${method} ${path}: ${r.text}`);
            assert.notEqual(r.status, 401);
          } else {
            assert.equal(r.status, 403, `${method} ${path}: ${r.status}`);
            assert.equal(r.body.code, 'forbidden');
            assert.equal(r.body.needs, `${area}:${level}`);
            assert.equal(r.body.error, "You don't have permission for that.");
          }
        });
      }
    }
  }
});

test('edit implies view; the spec defaults hold', () => {
  assert.ok(can('editor', 'content', 'view') && can('editor', 'content', 'edit'));
  assert.ok(can('editor', 'money', 'view') && !can('editor', 'money', 'edit'));
  for (const a of ['operators', 'devotees', 'push']) {
    assert.equal(can('editor', a, 'view'), false);
    assert.equal(can('viewer', a, 'view'), false);
  }
  assert.deepEqual(permissionsFor('viewer').filter((p) => p.endsWith(':edit')), []);
  assert.deepEqual(permissionsFor('nobody'), []);
});

test('an unauthenticated request is 401, not 403', async () => {
  assert.equal((await call(null, 'GET', '/admin/operators')).status, 401);
});

test('fail closed: an unmapped path is admin-only', async () => {
  assert.deepEqual(areaFor('GET', '/admin/brand-new-thing'), { area: 'operators', level: 'view', mapped: false, also: undefined });
  const e = await call('editor', 'GET', '/admin/brand-new-thing');
  assert.equal(e.status, 403);
  assert.equal(e.body.needs, 'operators:view');
  const a = await call('admin', 'GET', '/admin/brand-new-thing');
  assert.equal(a.status, 404); // admin gets past the gate; nothing is mounted there
});

test('wallet lookup also needs devotees:view (a search by PII leaks PII)', async () => {
  for (const role of ['editor', 'viewer']) {
    const r = await call(role, 'GET', '/admin/wallets?q=a');
    assert.equal(r.status, 403);
    assert.equal(r.body.needs, 'devotees:view');
  }
  assert.equal((await call('admin', 'GET', '/admin/wallets?q=a')).status, 200);
});

test('session returns permissions, read fresh from the record', async () => {
  const s = await call('editor', 'GET', '/admin/session');
  assert.equal(s.body.role, 'editor');
  assert.deepEqual(s.body.permissions, permissionsFor('editor'));
  assert.equal(s.body.username, 'editor1');
  // A role change takes effect on the next request.
  await Operator.updateOne({ _id: ids.viewer }, { $set: { role: 'editor' } });
  assert.equal((await call('viewer', 'PUT', `/content/deities/${OID}`, {})).status, 404);
  await Operator.updateOne({ _id: ids.viewer }, { $set: { role: 'viewer' } });
  assert.equal((await call('viewer', 'PUT', `/content/deities/${OID}`, {})).status, 403);
});

test('every route registered behind the gate has an area (or is PUBLIC)', () => {
  const gateAt = app._router.stack.findIndex((l) => l.name === 'requireAdmin');
  assert.ok(gateAt > 0, 'gate layer found');
  const routes = [];
  const walk = (stack, prefix) => {
    for (const l of stack) {
      if (l.route) {
        for (const m of Object.keys(l.route.methods)) routes.push({ method: m.toUpperCase(), path: prefix + l.route.path });
      } else if (l.name === 'router' && l.handle.stack) {
        const mount = l.regexp.source.replace(/^\^/, '').replace(/\\\/\?\(\?=\\\/\|\$\)$/, '').replace(/\\\//g, '/');
        walk(l.handle.stack, prefix + (mount === '(?:)' ? '' : mount));
      }
    }
  };
  walk(app._router.stack.slice(gateAt + 1), '');
  const behind = routes.filter((r) => r.path.startsWith('/api')).map((r) => ({ ...r, path: r.path.slice(4).replace(/:[A-Za-z]+/g, 'x') || '/' }));
  assert.ok(behind.length > 40, `found ${behind.length} routes`);
  const unmapped = behind.filter((r) => !PUBLIC.some((p) => p.method === r.method && p.path.test(r.path)) && !areaFor(r.method, r.path).mapped);
  assert.deepEqual(unmapped.map((r) => `${r.method} ${r.path}`), []);
  const admin = behind.filter((r) => r.path.startsWith('/admin/') && !PUBLIC.some((p) => p.method === r.method && p.path.test(r.path)));
  assert.ok(admin.length > 20);
  for (const r of admin) assert.ok(areaFor(r.method, r.path).mapped, `${r.method} ${r.path}`);
});

/* ------------------------------------------- pooja / home / chadhava routes -- */
describe('pooja, home and chadhava admin routes', () => {
  test('areas: content for layout, poojas, listings and categories; orders for bookings, reviews and chadhava orders', () => {
    for (const [m, p] of [['GET', '/admin/home-sections'], ['PUT', '/admin/home-sections/order'], ['POST', '/admin/poojas/import-sevas'], ['PUT', '/admin/poojas/x'],
      ['GET', '/admin/chadhava-listings'], ['POST', '/admin/chadhava-categories'], ['PUT', '/content/hero/x'], ['PUT', '/content/hero/order']]) assert.equal(areaFor(m, p).area, 'content', `${m} ${p}`);
    for (const [m, p] of [['GET', '/admin/bookings'], ['PUT', '/admin/bookings/x/status'], ['GET', '/admin/reviews'], ['PUT', '/admin/reviews/x'],
      ['GET', '/admin/chadhava-orders'], ['PUT', '/admin/chadhava-orders/x/status']]) assert.equal(areaFor(m, p).area, 'orders', `${m} ${p}`);
  });

  test('hero slider: editor writes and reorders, viewer is refused', async () => {
    const c = await call('editor', 'POST', '/content/hero', { slug: 'rbac-h', title: 'H', image: '/uploads/h.jpg', target: { type: 'coins' } });
    assert.equal(c.status, 201);
    assert.equal(c.body.href, '/wallet');
    assert.equal((await call('editor', 'PUT', '/content/hero/order', { ids: [c.body._id] })).status, 200);
    assert.equal((await call('viewer', 'PUT', '/content/hero/order', { ids: [c.body._id] })).status, 403);
    assert.equal((await call('viewer', 'POST', '/content/hero', { slug: 'v', title: 'V', image: '/u.jpg' })).status, 403);
    assert.equal((await call('viewer', 'GET', '/content/hero')).status, 200);
    assert.equal((await call(null, 'PUT', '/content/hero/order', { ids: [] })).status, 401);
  });

  test('an editor writes the layout and poojas but cannot change a booking status or hide a review', async () => {
    const mk = await call('editor', 'POST', '/admin/home-sections', { key: 'rbac-x', title: 'x' });
    assert.equal(mk.status, 201);
    assert.equal((await call('editor', 'POST', '/admin/poojas', { slug: 'rbac-p', title: 'P', packages: [{ key: 'a', persons: 1, coins: 5 }] })).status, 201);
    assert.equal((await call('editor', 'PUT', `/admin/bookings/${OID}/status`, { status: 'sankalp' })).status, 403);
    assert.equal((await call('editor', 'PUT', `/admin/reviews/${OID}`, { hidden: true })).status, 403);
    assert.equal((await call('editor', 'PUT', `/admin/chadhava-orders/${OID}/status`, { status: 'offered' })).status, 403);
    assert.equal((await call('editor', 'GET', '/admin/bookings')).status, 200);
    assert.equal((await call('admin', 'PUT', `/admin/bookings/${OID}/status`, { status: 'sankalp' })).status, 404);
  });

  test('a viewer reads but cannot write the layout or poojas', async () => {
    assert.equal((await call('viewer', 'GET', '/admin/home-sections')).status, 200);
    assert.equal((await call('viewer', 'GET', '/admin/poojas')).status, 200);
    assert.equal((await call('viewer', 'POST', '/admin/home-sections', { key: 'v-x' })).status, 403);
    assert.equal((await call('viewer', 'POST', '/admin/poojas/import-sevas', {})).status, 403);
  });

  test('public pooja and chadhava endpoints need no session', async () => {
    for (const p of ['/poojas', '/poojas/none', '/poojas/none/reviews', '/chadhava/listings', '/chadhava/listings/none']) {
      const r = await call(null, 'GET', p);
      assert.ok(r.status === 200 || r.status === 404, `${p} -> ${r.status}`);
    }
    assert.ok([401, 503].includes((await call(null, 'POST', '/bookings', {})).status)); // needs a Firebase token (503 when no key is configured)
    assert.equal((await call(null, 'POST', '/chadhava', {})).status, 410);
    assert.equal((await call(null, 'GET', '/admin/home-sections')).status, 401);
  });
});

/* ---------------------------------------------------------- settings guard -- */
describe('content settings: money keys need money:edit', () => {
  let money; let plain;
  before(async () => {
    money = await Setting.create({ key: 'prasadDelivery', value: '99' });
    plain = await Setting.create({ key: 'supportEmail', value: 'a@b.c' });
  });
  test('editor PUT of a money key is 403', async () => {
    const r = await call('editor', 'PUT', `/content/settings/${money._id}`, { value: '1' });
    assert.equal(r.status, 403);
    assert.equal(r.body.needs, 'money:edit');
    assert.equal((await Setting.findById(money._id)).value, '99');
  });
  test('editor cannot create, rename onto, or delete a money key', async () => {
    assert.equal((await call('editor', 'POST', '/content/settings', { key: 'callsEnabled', value: 'false' })).status, 403);
    assert.equal((await call('editor', 'PUT', `/content/settings/${plain._id}`, { key: 'coinsPerRupee' })).status, 403);
    assert.equal((await call('editor', 'DELETE', `/content/settings/${money._id}`)).status, 403);
    assert.ok(await Setting.findById(money._id));
  });
  test('editor PUT of an ordinary key is 200; editor can still read money keys', async () => {
    assert.equal((await call('editor', 'PUT', `/content/settings/${plain._id}`, { value: 'x@y.z' })).status, 200);
    const list = await call('editor', 'GET', '/content/settings');
    assert.equal(list.status, 200);
    assert.ok(list.body.some((s) => s.key === 'prasadDelivery'));
  });
  test('admin may change a money key', async () => {
    assert.equal((await call('admin', 'PUT', `/content/settings/${money._id}`, { value: '120' })).status, 200);
  });
});

/* ------------------------------------------------------------------ masking -- */
describe('masking', () => {
  const DEVOTEE = { uid: 'uid-masked-1', name: 'RealName-xyz', contact: '+919999900001', email: 'real@example.com', phone: '+919999900001' };
  const LEAKS = ['RealName-xyz', '+919999900001', '9999900001', 'real@example.com', 'Gotra-secret', 'Secret Lane'];
  const AST = { signInEmail: 'rishi.private@gmail.com', signInPhone: '+919888800002' };
  const AST_LEAKS = ['rishi.private@gmail.com', '+919888800002', '9888800002'];
  let astro;

  before(async () => {
    await User.create(DEVOTEE);
    await Wallet.create({ uid: DEVOTEE.uid, balance: 50 });
    await WalletTxn.create({ uid: DEVOTEE.uid, type: 'adjustment', amount: 5, balanceAfter: 55, status: 'posted', idempotencyKey: 'mask-1', createdBy: 'ops', note: 'Goodwill credit for RealName-xyz, call dropped' });
    await CoinOrder.create({ uid: DEVOTEE.uid, coins: 10, price: 10, amountPaise: 1000, status: 'paid', provider: 'razorpay' });
    await Booking.create({ uid: DEVOTEE.uid, bookingRef: 'BKT-MASK1', poojaTitle: 'Mask Pooja', devoteeName: 'RealName-xyz', gotra: 'Gotra-secret', names: [{ name: 'RealName-xyz', gotra: 'Gotra-secret' }], address: { line1: 'Secret Lane 9', city: 'Pune', pincode: '411001' } });
    await ChadhavaOrder.create({ uid: DEVOTEE.uid, ref: 'CHD-MASK1', listingTitle: 'T', totalCoins: 5 });
    astro = await Astrologer.create({ name: 'Pandit Test', ...AST, status: 'invited', ratePerMin: 5 });
    await CallSession.create({ devoteeUid: DEVOTEE.uid, devoteeName: 'RealName-xyz', astrologerId: astro._id, astrologerName: 'Pandit Test', astrologerUid: 'ast-uid', rtcChannel: 'ch1', shareSnapshot: 30, ratePerMinSnapshot: 5, status: 'connected', requestedAt: new Date() });
  });

  const DEVOTEE_PATHS = ['/admin/wallet-transactions', '/admin/coin-orders', '/admin/bookings', '/admin/reviews', '/admin/chadhava-orders', '/admin/calls', '/admin/payouts', '/admin/payouts/summary', '/admin/astrologers', '/admin/coin-stats'];

  for (const role of ['editor', 'viewer']) {
    test(`${role}: no devotee or astrologer identifier in any response`, async () => {
      for (const p of DEVOTEE_PATHS) {
        const r = await call(role, 'GET', p);
        assert.equal(r.status, 200, p);
        for (const leak of [...LEAKS, ...AST_LEAKS]) assert.ok(!r.text.includes(leak), `${role} ${p} leaked ${leak}`);
      }
      const t = await call(role, 'GET', '/admin/wallet-transactions');
      assert.equal(t.body.transactions[0].who, pseudonym(DEVOTEE.uid));
      assert.equal(t.body.transactions[0].note, 'Adjustment (reason visible to admins)', 'operator-typed notes can name a devotee');
      const calls = await call(role, 'GET', '/admin/calls');
      assert.equal(calls.body.calls[0].devoteeName, pseudonym(DEVOTEE.uid));
      assert.equal(calls.body.live[0].devoteeName, pseudonym(DEVOTEE.uid));
      const a = await call(role, 'GET', '/admin/astrologers');
      assert.equal(a.body.astrologers[0].signInEmail, 'r•••@gmail.com');
      assert.equal(a.body.astrologers[0].signInPhone, '+91••••••0002');
    });
  }

  test('admin sees the real values', async () => {
    assert.equal((await call('admin', 'GET', '/admin/wallet-transactions')).body.transactions[0].who, 'RealName-xyz');
    assert.match((await call('admin', 'GET', '/admin/wallet-transactions')).body.transactions[0].note, /Goodwill credit/, 'admins still see the reason');
    assert.equal((await call('admin', 'GET', '/admin/coin-orders')).body.orders[0].who, 'RealName-xyz');
    assert.equal((await call('admin', 'GET', '/admin/bookings')).body.bookings[0].devoteeName, 'RealName-xyz');
    assert.equal((await call('admin', 'GET', '/admin/bookings')).body.bookings[0].names[0].name, 'RealName-xyz');
    assert.equal((await call('admin', 'GET', '/admin/chadhava-orders')).body.orders[0].who, 'RealName-xyz');
    assert.equal((await call('admin', 'GET', '/admin/calls')).body.calls[0].devoteeName, 'RealName-xyz');
    const a = (await call('admin', 'GET', '/admin/astrologers')).body.astrologers[0];
    assert.equal(a.signInEmail, AST.signInEmail);
    assert.equal(a.signInPhone, AST.signInPhone);
  });

  test('the pseudonym is stable per uid and differs across uids', () => {
    assert.equal(pseudonym('a'), pseudonym('a'));
    assert.match(pseudonym('a'), /^Devotee ••\d{4}$/);
    const seen = new Set(Array.from({ length: 40 }, (_, i) => pseudonym(`uid-${i}`)));
    assert.ok(seen.size > 30, 'distinct uids give (almost always) distinct pseudonyms');
    assert.notEqual(pseudonym('uid-1'), pseudonym('uid-2'));
  });

  test('mask helpers', () => {
    assert.equal(maskEmail('rishi@gmail.com'), 'r•••@gmail.com');
    assert.equal(maskPhone('+919876501234'), '+91••••••1234');
    assert.equal(maskEmail(''), '');
    assert.equal(maskPhone(undefined), '');
  });
});

/* ---------------------------------------------------------- review editing -- */
describe('review text editing', () => {
  test('orders:edit only; public shows current text and rating, no marker or originalText; audit row written', async () => {
    await Pooja.create({ slug: 'rt-pooja', title: 'RT', templeSlug: 't', poojaDate: '2099-01-01' });
    const r = await PoojaReview.create({ bookingId: 'bk-rt', uid: 'u-rt', poojaSlug: 'rt-pooja', name: 'Asha', rating: 5, text: 'bad word' });
    const path = `/admin/reviews/${r._id}`;
    for (const role of ['viewer', 'editor']) assert.equal((await call(role, 'PUT', path, { text: 'x' })).status, 403, role);
    assert.equal((await call(null, 'PUT', path, { text: 'x' })).status, 401);
    assert.equal((await PoojaReview.findById(r._id).lean()).text, 'bad word');

    await AuditLog.deleteMany({});
    const ok = await call('admin', 'PUT', path, { text: 'kind word', hidden: false });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.review.edited, true);
    await new Promise((res) => setTimeout(res, 150));
    const e = await AuditLog.findOne({ path: `/api${path}` }).lean();
    assert.ok(e, 'audit row exists');
    assert.deepEqual([e.operator, e.method, e.area, e.targetId], ['admin1', 'PUT', 'orders', String(r._id)]);

    const pub = await call(null, 'GET', '/poojas/rt-pooja/reviews');
    assert.equal(pub.status, 200);
    assert.deepEqual(Object.keys(pub.body.reviews[0]).sort(), ['createdAt', 'id', 'name', 'packageName', 'rating', 'text']);
    assert.deepEqual([pub.body.reviews[0].text, pub.body.reviews[0].rating, pub.body.reviews[0].name], ['kind word', 5, 'Asha']);
    assert.ok(!pub.text.includes('bad word'));
    await call('admin', 'PUT', path, { hidden: true });
    assert.equal((await call(null, 'GET', '/poojas/rt-pooja/reviews')).body.reviews.length, 0);
  });
});

/* -------------------------------------------------------------------- audit -- */
describe('audit log', () => {
  test('a successful write adds an entry; a 403 and a GET do not', async () => {
    await AuditLog.deleteMany({});
    const ok = await call('editor', 'PUT', '/horoscope/day/2026-02-02', { readings: [] });
    assert.ok(ok.status < 400, `got ${ok.status}`);
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(await AuditLog.countDocuments(), 1);
    const e = await AuditLog.findOne().lean();
    assert.equal(e.operator, 'editor1');
    assert.equal(e.role, 'editor');
    assert.equal(e.area, 'horoscope');
    assert.equal(e.method, 'PUT');
    assert.equal(e.path, '/api/horoscope/day/2026-02-02');
    assert.equal(e.status, ok.status);
    assert.equal(e.targetId, '2026-02-02');
    assert.ok(!('body' in e));

    assert.equal((await call('editor', 'POST', '/admin/payouts', {})).status, 403);
    assert.equal((await call('editor', 'GET', '/content/deities')).status, 200);
    assert.equal((await call('editor', 'PUT', `/content/deities/${OID}`, {})).status, 404); // failed write: not a change
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(await AuditLog.countDocuments(), 1);
  });

  test('GET /admin/audit-log is admin-only and newest first', async () => {
    assert.equal((await call('editor', 'GET', '/admin/audit-log')).status, 403);
    assert.equal((await call('viewer', 'GET', '/admin/audit-log')).status, 403);
    await call('admin', 'PUT', '/admin/policies/terms', { title: 't', bodyMd: 'b' });
    await new Promise((r) => setTimeout(r, 150));
    const r = await call('admin', 'GET', '/admin/audit-log?limit=10');
    assert.equal(r.status, 200);
    assert.equal(r.body.entries[0].operator, 'admin1');
    assert.equal(r.body.entries[0].area, 'policies');
    assert.ok(new Date(r.body.entries[0].at) >= new Date(r.body.entries[1].at));
  });
});

/* ---------------------------------------------------------- operator CRUD -- */
describe('operators: three roles and lockout refusals', () => {
  test('create accepts viewer, rejects unknown roles', async () => {
    const ok = await call('admin', 'POST', '/admin/operators', { username: 'newviewer', password: 'password-123', role: 'viewer' });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.role, 'viewer');
    assert.equal((await call('admin', 'POST', '/admin/operators', { username: 'badrole', password: 'password-123', role: 'root' })).status, 400);
    const list = await call('admin', 'GET', '/admin/operators');
    assert.ok(list.body.some((o) => o.username === 'newviewer' && o.role === 'viewer'));
  });
  test('update to viewer works; self-demotion to viewer and last-admin demotion are refused', async () => {
    const nv = await Operator.findOne({ username: 'newviewer' });
    assert.equal((await call('admin', 'PUT', `/admin/operators/${nv._id}`, { role: 'editor' })).body.role, 'editor');
    assert.equal((await call('admin', 'PUT', `/admin/operators/${nv._id}`, { role: 'viewer' })).body.role, 'viewer');
    const self = await call('admin', 'PUT', `/admin/operators/${ids.admin}`, { role: 'viewer' });
    assert.equal(self.status, 400);
    assert.equal((await call('admin', 'PUT', `/admin/operators/${ids.admin}`, { active: false })).status, 400);
    assert.equal((await call('admin', 'DELETE', `/admin/operators/${ids.admin}`)).status, 400);
    // A second admin demoting the last OTHER admin is refused too.
    const second = await Operator.create({ username: 'admin2', passwordHash: hashPassword('password-123'), role: 'admin' });
    const c2 = `pooja_admin=${encodeURIComponent(sign({ uid: String(second._id), role: 'admin', exp: Date.now() + 60_000 }))}`;
    await Operator.updateOne({ _id: ids.admin }, { $set: { active: false } });
    const r = await fetch(`${base}/api/admin/operators/${ids.admin}`, { method: 'PUT', headers: { 'content-type': 'application/json', cookie: c2 }, body: JSON.stringify({ role: 'viewer' }) });
    assert.equal(r.status, 200); // admin1 is already inactive, so demoting is not removing the last ACTIVE admin
    await Operator.updateOne({ _id: ids.admin }, { $set: { active: true, role: 'admin' } });
    await Operator.deleteOne({ _id: second._id });
  });
});
