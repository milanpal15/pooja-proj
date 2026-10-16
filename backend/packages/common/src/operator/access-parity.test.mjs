// The admin BFF carries a COPY of the monolith's area gate (access/permissions.js, access/routes.js) for the routes
// it serves itself. When the monolith checkout is next to this one (a normal repo clone), fail on any drift.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { ROLE_PERMISSIONS, can, hasPermission, permissionsFor } from './access/permissions.js';
import { ROUTE_AREAS, areaFor } from './access/routes.js';

const mono = (f) => new URL(`../../../../../pooja-api/src/access/${f}`, import.meta.url);
const have = existsSync(fileURLToPath(mono('routes.js')));

test('the copied gate matches pooja-api/src/access byte-for-purpose', { skip: !have && 'pooja-api not checked out next to backend/' }, async () => {
  const [p, r] = await Promise.all([import(mono('permissions.js')), import(mono('routes.js'))]);
  // The `events` area exists only in the BFF copy (pooja-api never gets Events): everything else must match.
  const noEvents = (list) => list.filter((x) => !x.startsWith('events:'));
  assert.deepEqual(Object.fromEntries(Object.entries(ROLE_PERMISSIONS).map(([k, v]) => [k, noEvents(v)])), p.ROLE_PERMISSIONS);
  // ...and the Home-layout row (catalog + BFF only; pooja-api has no home-layout routes).
  const mine = ROUTE_AREAS.filter((row) => row.area !== 'events' && !String(row.path).includes('home-layout'));
  assert.equal(mine.length, r.ROUTE_AREAS.length);
  mine.forEach((row, i) => {
    assert.equal(String(row.path), String(r.ROUTE_AREAS[i].path), `row ${i} path`);
    assert.equal(row.area, r.ROUTE_AREAS[i].area, `row ${i} area`);
    assert.equal(row.also, r.ROUTE_AREAS[i].also, `row ${i} also`);
  });
  for (const m of ['GET', 'PUT']) for (const path of ['/flags/full', '/content/settings', '/nothing/mapped']) {
    assert.deepEqual(areaFor(m, path), r.areaFor(m, path));
  }
});

test('permission helpers behave', () => {
  assert.ok(can('editor', 'content', 'edit'));
  assert.ok(!can('viewer', 'content', 'edit'));
  assert.ok(can('viewer', 'content', 'view'));
  assert.ok(!can('editor', 'money', 'edit'));
  assert.ok(!can('nobody', 'content', 'view'));
  assert.ok(hasPermission(permissionsFor('editor'), 'announcements:view'), 'edit implies view');
  assert.equal(areaFor('GET', '/not/a/route').area, 'operators', 'unmapped = admin only');
});

test('every catalog operator route gets the same area and level from the BFF copy as from the monolith\'s own gate', { skip: !have && 'pooja-api not checked out next to backend/' }, async () => {
  const r = await import(mono('routes.js'));
  const { CATALOG_ADMIN_ROUTES } = await import('../catalog-routes.js');
  assert.ok(CATALOG_ADMIN_ROUTES.length > 80, `found ${CATALOG_ADMIN_ROUTES.length}`);
  for (const route of CATALOG_ADMIN_ROUTES.filter((x) => !x.path.startsWith('/admin/home-layout'))) {
    const sample = (route.sample ?? route.path).replace(':date', '2026-01-01');
    assert.deepEqual(areaFor(route.method, sample), r.areaFor(route.method, sample), `${route.method} ${route.path}`);
    assert.equal(areaFor(route.method, sample).mapped, true, `${route.method} ${route.path} must be mapped`);
  }
});

test('every wallet operator route gets the same area, level and `also` from the BFF copy as from the monolith\'s own gate', { skip: !have && 'pooja-api not checked out next to backend/' }, async () => {
  const r = await import(mono('routes.js'));
  const { WALLET_ADMIN_ROUTES } = await import('../wallet-routes.js');
  assert.equal(WALLET_ADMIN_ROUTES.length, 11);
  for (const route of WALLET_ADMIN_ROUTES) {
    const sample = route.sample ?? route.path;
    assert.deepEqual(areaFor(route.method, sample), r.areaFor(route.method, sample), `${route.method} ${route.path}`);
    assert.equal(areaFor(route.method, sample).mapped, true, `${route.method} ${route.path} must be mapped`);
  }
});

test('the BFF table covers every /admin route the monolith\'s wallet and coins modules register (and nothing it does not)', { skip: !have && 'pooja-api not checked out next to backend/' }, async () => {
  const { WALLET_ADMIN_ROUTES } = await import('../wallet-routes.js');
  const base = (f) => new URL(`../../../../../pooja-api/src/modules/${f}`, import.meta.url);
  const wallet = await import(base('wallet/index.js'));
  const coins = await import(base('coins/index.js'));
  const requireAuth = (_q, _s, n) => n();
  const found = new Set();
  const walk = (stack) => {
    for (const l of stack) {
      if (l.route) for (const m of Object.keys(l.route.methods)) found.add(`${m.toUpperCase()} ${l.route.path}`);
      else if (l.handle?.stack) walk(l.handle.stack);
    }
  };
  walk(wallet.routers({ requireAuth }).admin.stack);
  walk(coins.routers({ requireAuth }).admin.stack);
  const mine = new Set(WALLET_ADMIN_ROUTES.map((x) => `${x.method} ${x.path}`));
  assert.deepEqual([...found].sort(), [...mine].sort());
});

test('every orders operator route gets the same area and level from the BFF copy as from the monolith\'s own gate', { skip: !have && 'pooja-api not checked out next to backend/' }, async () => {
  const r = await import(mono('routes.js'));
  const { ORDERS_ADMIN_ROUTES } = await import('../orders-routes.js');
  assert.equal(ORDERS_ADMIN_ROUTES.length, 6);
  for (const route of ORDERS_ADMIN_ROUTES) {
    const sample = route.sample ?? route.path;
    assert.deepEqual(areaFor(route.method, sample), r.areaFor(route.method, sample), `${route.method} ${route.path}`);
    assert.equal(areaFor(route.method, sample).area, 'orders');
    assert.equal(areaFor(route.method, sample).mapped, true, `${route.method} ${route.path} must be mapped`);
  }
});

test('the BFF tables cover every orders route the monolith\'s bookings, chadhava and poojas modules register (and nothing it does not)', { skip: !have && 'pooja-api not checked out next to backend/' }, async () => {
  const { ORDERS_ADMIN_ROUTES, ORDERS_DEVOTEE_ROUTES, ORDERS_GONE, ORDERS_PUBLIC_GETS } = await import('../orders-routes.js');
  const base = (f) => new URL(`../../../../../pooja-api/src/modules/${f}`, import.meta.url);
  const requireAuth = (_q, _s, n) => n();
  const walk = (stack, found) => {
    for (const l of stack) {
      if (l.route) for (const m of Object.keys(l.route.methods)) found.add(`${m.toUpperCase()} ${l.route.path}`);
      else if (l.handle?.stack) walk(l.handle.stack, found);
    }
    return found;
  };
  const bookings = (await import(base('bookings/index.js'))).routers({ requireAuth });
  const chadhava = (await import(base('chadhava/index.js'))).routers({ requireAuth });
  const poojas = (await import(base('poojas/index.js'))).routers({ requireAuth });

  const ordersOnly = (set, re) => new Set([...set].filter((x) => re.test(x.split(' ')[1])));
  const admin = new Set();
  for (const r of [bookings.admin, chadhava.admin, poojas.admin]) walk(r.stack, admin);
  assert.deepEqual([...ordersOnly(admin, /^\/admin\/(bookings|reviews|chadhava-orders)(\/|$)/)].sort(), ORDERS_ADMIN_ROUTES.map((x) => `${x.method} ${x.path}`).sort());

  const devotee = new Set();
  for (const r of [bookings.devotee, chadhava.devotee]) walk(r.stack, devotee);
  const mineDevotee = new Set(ORDERS_DEVOTEE_ROUTES.map((x) => `${x.method} ${x.path}`));
  mineDevotee.add(`${ORDERS_GONE.method} ${ORDERS_GONE.path}`);
  assert.deepEqual([...devotee].sort(), [...mineDevotee].sort());

  const pub = new Set();
  for (const r of [bookings.public, chadhava.public, poojas.public]) if (r) walk(r.stack, pub);
  assert.ok(pub.has('GET /poojas/:slug/reviews'));
  assert.deepEqual(ORDERS_PUBLIC_GETS.map((x) => `GET ${x.path}`), ['GET /poojas/:slug/reviews']);
});

test('every calls operator route gets the same area and level from the BFF copy as from the monolith\'s own gate (astrologers, calls, payouts)', { skip: !have && 'pooja-api not checked out next to backend/' }, async () => {
  const r = await import(mono('routes.js'));
  const { CALLS_ADMIN_ROUTES } = await import('../calls-routes.js');
  assert.equal(CALLS_ADMIN_ROUTES.length, 12);
  for (const route of CALLS_ADMIN_ROUTES) {
    const sample = route.sample ?? route.path;
    assert.deepEqual(areaFor(route.method, sample), r.areaFor(route.method, sample), `${route.method} ${route.path}`);
    assert.equal(areaFor(route.method, sample).area, route.area, `${route.method} ${route.path} area`);
    assert.equal(areaFor(route.method, sample).mapped, true, `${route.method} ${route.path} must be mapped`);
  }
  assert.deepEqual([...new Set(CALLS_ADMIN_ROUTES.map((x) => x.area))].sort(), ['astrologers', 'calls', 'payouts']);
});

test('the BFF tables cover every astrologer / call / payout route the monolith\'s modules register (and nothing it does not)', { skip: !have && 'pooja-api not checked out next to backend/' }, async () => {
  const { CALLS_ADMIN_ROUTES, CALLS_DEVOTEE_ROUTES, CALLS_PUBLIC_GETS } = await import('../calls-routes.js');
  const base = (f) => new URL(`../../../../../pooja-api/src/modules/${f}`, import.meta.url);
  const requireAuth = (_q, _s, n) => n();
  const walk = (stack, found) => {
    for (const l of stack) {
      if (l.route) for (const m of Object.keys(l.route.methods)) found.add(`${m.toUpperCase()} ${l.route.path}`);
      else if (l.handle?.stack) walk(l.handle.stack, found);
    }
    return found;
  };
  const mods = await Promise.all(['astrologers', 'calls', 'payouts'].map(async (m) => (await import(base(`${m}/index.js`))).routers({ requireAuth })));
  const admin = new Set();
  const devotee = new Set();
  const pub = new Set();
  for (const r of mods) {
    if (r.admin) walk(r.admin.stack, admin);
    if (r.devotee) walk(r.devotee.stack, devotee);
    if (r.public) walk(r.public.stack, pub);
  }
  const key = (x) => `${x.method} ${x.path}`;
  assert.deepEqual([...admin].sort(), CALLS_ADMIN_ROUTES.map(key).sort());
  assert.deepEqual([...devotee].sort(), CALLS_DEVOTEE_ROUTES.map(key).sort());
  assert.deepEqual([...pub].sort(), CALLS_PUBLIC_GETS.map((x) => `GET ${x.path}`).sort());
});
