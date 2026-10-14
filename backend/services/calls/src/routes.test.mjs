// The calls service answers exactly the routes the BFFs' tables name (packages/common/src/calls-routes.js), and every operator route has an area:
// add a route here without a table entry (or the reverse) and this fails.
// Run: node --test src/routes.test.mjs   (no database needed)
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CALLS_ADMIN_ROUTES, CALLS_DEVOTEE_ROUTES, CALLS_PUBLIC_GETS, areaFor } from '@bhakti/common';

import { astrologerRouters } from './modules/astrologers/index.js';
import { callRouters } from './modules/calls/index.js';
import { payoutRouters } from './modules/payouts/index.js';

const walk = (stack, found = new Set()) => {
  for (const l of stack) {
    if (l.route) for (const m of Object.keys(l.route.methods)) found.add(`${m.toUpperCase()} ${l.route.path}`);
    else if (l.handle?.stack) walk(l.handle.stack, found);
  }
  return found;
};
const key = (x) => `${x.method} ${x.path}`;
const mods = [astrologerRouters(), callRouters(), payoutRouters()];
const collect = (name) => mods.reduce((set, r) => (r[name] ? walk(r[name].stack, set) : set), new Set());

test('the service registers exactly the routes the tables list: admin, devotee / astrologer, public', () => {
  assert.deepEqual([...collect('admin')].sort(), CALLS_ADMIN_ROUTES.map(key).sort());
  assert.deepEqual([...collect('devotee')].sort(), CALLS_DEVOTEE_ROUTES.map(key).sort());
  assert.deepEqual([...collect('public')].sort(), CALLS_PUBLIC_GETS.map((x) => `GET ${x.path}`).sort());
});

test('every operator route has an explicit area (nothing falls through to admin-only by accident) and the table says the same', () => {
  for (const r of CALLS_ADMIN_ROUTES) {
    const hit = areaFor(r.method, r.sample ?? r.path);
    assert.equal(hit.mapped, true, key(r));
    assert.equal(hit.area, r.area, key(r));
    assert.equal(hit.level, r.method === 'GET' ? 'view' : 'edit', key(r));
  }
});

test('the identity directory routes are the service\'s own (not in any BFF table): claim and active', () => {
  const dir = walk(astrologerRouters().directory.stack);
  assert.deepEqual([...dir].sort(), ['GET /directory/astrologers/active', 'POST /directory/astrologers/claim']);
  const bff = new Set([...CALLS_ADMIN_ROUTES, ...CALLS_DEVOTEE_ROUTES].map(key));
  for (const d of dir) assert.ok(!bff.has(d), `${d} must never be reachable through a BFF`);
});
