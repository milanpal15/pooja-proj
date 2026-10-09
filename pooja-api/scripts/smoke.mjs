#!/usr/bin/env node
/**
 * Smoke test for a running dashboard.
 *
 * The point of this is the gate. Every route under /api that is not on the
 * phone app's allowlist must answer 401 to a stranger — and the one way that
 * silently breaks is someone adding a router above `requireAdmin` in
 * index.js, which looks harmless in review and publishes
 * `DELETE /api/users/:id` to the internet.
 *
 * So this runs twice: in CI against a server booted on localhost, and again
 * against the deployed URL after a release. A deploy that would expose the
 * admin API fails here instead of in the wild.
 *
 *   BASE=http://127.0.0.1:4000 ADMIN_PASSWORD=… node scripts/smoke.mjs
 *
 * ADMIN_PASSWORD is optional: without it the sign-in round trip is skipped
 * and only the public/blocked split is checked.
 */

const BASE = (process.env.BASE || 'http://127.0.0.1:4000').replace(/\/$/, '');
const PASSWORD = process.env.ADMIN_PASSWORD || '';
const USERNAME = process.env.ADMIN_USERNAME || 'admin';

let failed = 0;
const pass = (name, extra = '') => console.log(`  PASS  ${name}${extra ? `  — ${extra}` : ''}`);
const fail = (name, extra = '') => {
  console.log(`  FAIL  ${name}${extra ? `  — ${extra}` : ''}`);
  failed++;
};

async function status(path, { method = 'GET', cookie = '', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  return { code: res.status, res };
}

const expect = async (name, path, want, opts) => {
  try {
    const { code } = await status(path, opts);
    if (code === want) pass(name, `${code}`);
    else fail(name, `got ${code}, want ${want}`);
  } catch (e) {
    fail(name, e.message);
  }
};

console.log(`\nSmoke test → ${BASE}\n`);

/* The phone app must keep working without any session. If one of these
   starts 401ing, the app goes silent-but-not-broken: it falls back to
   bundled content, so nobody notices for days. */
console.log('Public — the app depends on these:');
await expect('GET /api/health', '/api/health', 200);
await expect('GET /api/flags', '/api/flags', 200);
await expect('GET /api/content', '/api/content', 200);
await expect('GET /api/horoscope', '/api/horoscope?date=2026-01-01', 200);
await expect('GET /api/panchang', '/api/panchang?date=2026-01-01', 200);
await expect('GET /api/announcements', '/api/announcements', 200);
await expect('GET /api/coins/packs', '/api/coins/packs', 200);
await expect('GET /api/chadhava/offerings', '/api/chadhava/offerings', 200);
await expect('GET /api/poojas', '/api/poojas', 200);
await expect('GET /api/poojas/:slug (unknown is 404)', '/api/poojas/smoke-none', 404);
await expect('GET /api/poojas/:slug/reviews (unknown is 404)', '/api/poojas/smoke-none/reviews', 404);
await expect('GET /api/chadhava/listings', '/api/chadhava/listings', 200);
await expect('GET /api/chadhava/listings/:slug (unknown is 404)', '/api/chadhava/listings/smoke-none', 404);

console.log('\nGated — a stranger must not reach these:');
await expect('GET /api/flags/full', '/api/flags/full', 401);
await expect('GET /api/analytics/summary', '/api/analytics/summary', 401);
await expect('GET /api/users', '/api/users', 401);
await expect('GET /api/visitors', '/api/visitors', 401);
await expect('GET /api/payments', '/api/payments', 401);
await expect('GET /api/content/deities', '/api/content/deities', 401);
await expect('GET /api/admin/policies', '/api/admin/policies', 401);

console.log('\nCoins, bookings, chadhava — devotee routes want a token, admin routes a session:');
await expect('GET /api/bookings', '/api/bookings', 401);
await expect('POST /api/bookings', '/api/bookings', 401, { method: 'POST', body: { sevaSlug: 'x' } });
// The old public payment ingest let anyone forge the dashboard's revenue figure.
await expect('POST /api/ingest/payment is not public', '/api/ingest/payment', 401, { method: 'POST', body: { amount: 99999999, status: 'success' } });
await expect('POST /api/bookings/:id/cancel', '/api/bookings/000000000000000000000000/cancel', 401, { method: 'POST', body: {} });
await expect('POST /api/bookings/:id/review', '/api/bookings/000000000000000000000000/review', 401, { method: 'POST', body: { rating: 5 } });
await expect('GET /api/chadhava/orders', '/api/chadhava/orders', 401);
await expect('POST /api/chadhava/orders', '/api/chadhava/orders', 401, { method: 'POST', body: { listingSlug: 'x' } });
await expect('POST /api/chadhava/orders/:id/cancel', '/api/chadhava/orders/000000000000000000000000/cancel', 401, { method: 'POST', body: {} });
// The free-amount chadhava is gone: 410, not a 401 asking for a token it could never use.
await expect('POST /api/chadhava (removed)', '/api/chadhava', 410, { method: 'POST', body: { amount: 1 } });
await expect('POST /api/wallet/orders', '/api/wallet/orders', 401, { method: 'POST', body: { packId: 'x' } });
await expect('POST /api/wallet/orders/:id/verify', '/api/wallet/orders/000000000000000000000000/verify', 401, { method: 'POST', body: {} });
// Unsigned, so it must never be accepted: 400 with a secret set, 503 without one.
{
  const { code } = await status('/api/webhooks/razorpay', { method: 'POST', body: { event: 'x' } });
  if (code === 400 || code === 503) pass('POST /api/webhooks/razorpay (unsigned) refused', `${code}`);
  else fail('POST /api/webhooks/razorpay (unsigned) refused', `got ${code}, want 400 or 503`);
}
for (const p of ['coin-packs', 'coin-orders', 'coin-stats', 'billing/rules', 'bookings', 'reviews', 'offerings', 'chadhava-orders', 'home-sections', 'poojas', 'chadhava-listings', 'chadhava-categories']) {
  await expect(`GET /api/admin/${p}`, `/api/admin/${p}`, 401);
}
await expect('POST /api/admin/poojas', '/api/admin/poojas', 401, { method: 'POST', body: { slug: 'x' } });
await expect('POST /api/admin/poojas/import-sevas', '/api/admin/poojas/import-sevas', 401, { method: 'POST', body: {} });
await expect('POST /api/admin/home-sections', '/api/admin/home-sections', 401, { method: 'POST', body: { key: 'x' } });
await expect('PUT /api/admin/home-sections/order', '/api/admin/home-sections/order', 401, { method: 'PUT', body: { ids: [] } });
await expect('PUT /api/admin/bookings/:id/status', '/api/admin/bookings/000000000000000000000000/status', 401, { method: 'PUT', body: { status: 'sankalp' } });
await expect('PUT /api/admin/reviews/:id', '/api/admin/reviews/000000000000000000000000', 401, { method: 'PUT', body: { hidden: true } });
await expect('PUT /api/admin/chadhava-orders/:id/status', '/api/admin/chadhava-orders/000000000000000000000000/status', 401, { method: 'PUT', body: { status: 'offered' } });
await expect('PUT /api/content/hero/:id (unauthenticated)', '/api/content/hero/000000000000000000000000', 401, { method: 'PUT', body: { html: '<b>x</b>' } });
await expect('POST /api/admin/coin-packs', '/api/admin/coin-packs', 401, { method: 'POST', body: { coins: 1, price: 1 } });
await expect('PUT /api/admin/billing/rules', '/api/admin/billing/rules', 401, { method: 'PUT', body: { callsEnabled: false } });

console.log('\nAstrologer calls — public list, token-only call routes, session-only admin routes:');
await expect('GET /api/astrologers', '/api/astrologers', 200);
await expect('POST /api/calls', '/api/calls', 401, { method: 'POST', body: { astrologerId: 'x', requestId: 'x' } });
await expect('GET /api/calls/:id', '/api/calls/000000000000000000000000', 401);
for (const a of ['cancel', 'end', 'accept', 'decline', 'rating']) {
  await expect(`POST /api/calls/:id/${a}`, `/api/calls/000000000000000000000000/${a}`, 401, { method: 'POST', body: {} });
}
await expect('GET /api/astrologer/me', '/api/astrologer/me', 401);
await expect('GET /api/astrologer/me/incoming', '/api/astrologer/me/incoming', 401);
await expect('GET /api/astrologer/me/calls', '/api/astrologer/me/calls', 401);
await expect('GET /api/astrologer/me/earnings', '/api/astrologer/me/earnings', 401);
await expect('PUT /api/astrologer/me/presence', '/api/astrologer/me/presence', 401, { method: 'PUT', body: { online: true } });
await expect('POST /api/astrologer/me/heartbeat', '/api/astrologer/me/heartbeat', 401, { method: 'POST', body: {} });
for (const p of ['astrologers', 'calls', 'payouts', 'payouts/summary']) {
  await expect(`GET /api/admin/${p}`, `/api/admin/${p}`, 401);
}
await expect('POST /api/admin/astrologers', '/api/admin/astrologers', 401, { method: 'POST', body: { name: 'x' } });
await expect('POST /api/admin/astrologers/:id/suspend', '/api/admin/astrologers/000000000000000000000000/suspend', 401, { method: 'POST', body: {} });
await expect('POST /api/admin/calls/:id/end', '/api/admin/calls/000000000000000000000000/end', 401, { method: 'POST', body: {} });
await expect('POST /api/admin/calls/:id/refund', '/api/admin/calls/000000000000000000000000/refund', 401, { method: 'POST', body: { coins: 1 } });
await expect('POST /api/admin/payouts', '/api/admin/payouts', 401, { method: 'POST', body: { amountPaise: 1 } });

console.log('\nDestructive — the ones that would actually hurt:');
await expect('DELETE /api/users/:id', '/api/users/000000000000000000000000', 401, {
  method: 'DELETE',
});
await expect('PUT /api/flags/:key', '/api/flags/bhajan', 401, {
  method: 'PUT',
  body: { enabled: false },
});
await expect('POST /api/content/deities', '/api/content/deities', 401, {
  method: 'POST',
  body: { name: 'smoke' },
});
await expect('PUT /api/horoscope/day/:date', '/api/horoscope/day/2026-01-01', 401, {
  method: 'PUT',
  body: { readings: [] },
});
await expect('POST /api/content/upload', '/api/content/upload', 401, { method: 'POST' });
await expect('GET /api/admin/operators', '/api/admin/operators', 401);

/* The sign-in round trip, when a password is available. */
if (PASSWORD) {
  console.log('\nSign-in:');
  await expect('wrong password rejected', '/api/admin/login', 401, {
    method: 'POST',
    body: { username: USERNAME, password: `${PASSWORD}-wrong` },
  });
  await expect('unknown username rejected', '/api/admin/login', 401, {
    method: 'POST',
    body: { username: 'nobody-here', password: PASSWORD },
  });

  const { res } = await status('/api/admin/login', {
    method: 'POST',
    body: { username: USERNAME, password: PASSWORD },
  });
  if (res.status !== 200) {
    fail('correct password accepted', `got ${res.status}`);
  } else {
    pass('correct password accepted');

    const setCookie = res.headers.get('set-cookie') || '';
    const cookie = setCookie.split(';')[0];
    if (!/HttpOnly/i.test(setCookie)) fail('session cookie is HttpOnly');
    else pass('session cookie is HttpOnly');
    /*
     * SameSite is a deployment choice, not a constant, so this asserts the
     * policy is coherent rather than that it is one particular value.
     *
     * Same-origin (dev, Vite proxying /api) wants Strict. Cross-site — the
     * dashboard on its own host, which is how it is deployed — needs None,
     * because Strict means the browser never sends the cookie and every
     * call after a successful sign-in 401s.
     *
     * This used to demand Strict outright. Production sets None, and CI
     * runs this same file against the deployed URL, so the deploy gate
     * would have failed on every release.
     */
    const sameSite = (setCookie.match(/SameSite=(\w+)/i) || [])[1] || '(absent)';
    if (!/^(Strict|Lax|None)$/i.test(sameSite)) {
      fail('session cookie sets SameSite', `got ${sameSite}`);
    } else if (/^None$/i.test(sameSite) && !/Secure/i.test(setCookie)) {
      // A browser silently drops SameSite=None without Secure, so this
      // combination is not a weaker policy — it is no cookie at all.
      fail('SameSite=None cookie is also Secure', 'None without Secure is rejected by the browser');
    } else {
      pass(`session cookie is SameSite=${sameSite}`);
    }
    // Secure only makes sense over TLS; locally the server omits it.
    if (BASE.startsWith('https://')) {
      if (!/Secure/i.test(setCookie)) fail('session cookie is Secure over https');
      else pass('session cookie is Secure over https');
    }

    await expect('session opens /api/users', '/api/users', 200, { cookie });
    await expect('session opens content CRUD', '/api/content/deities', 200, { cookie });
    await expect('session opens the operator list', '/api/admin/operators', 200, { cookie });
    // Both of these shipped broken once and nothing noticed: the visitors list
    // answered 500 for everyone, and the payment ingest was open to strangers.
    await expect('session opens the visitors list', '/api/visitors', 200, { cookie });

    /*
     * One operator per role, signed in for real (DESIGN.md §21.7). Created by
     * the admin through the API and deleted afterwards, so a deployed
     * database is left as found. A few allowed and forbidden calls each —
     * the full matrix lives in src/access/access.test.mjs.
     */
    console.log('\nRoles — one operator per role:');
    const tag = Date.now().toString(36);
    const made = [];
    const asRole = {};
    const json = async (path, o = {}) => {
      const { res: r } = await status(path, o);
      return { code: r.status, body: await r.json().catch(() => ({})) };
    };
    for (const role of ['editor', 'viewer']) {
      const username = `smoke-${role}-${tag}`;
      const created = await json('/api/admin/operators', { method: 'POST', cookie, body: { username, password: 'smoke-password-1', role } });
      if (created.code !== 201) { fail(`create ${role} operator`, `got ${created.code}`); continue; }
      made.push(created.body._id);
      const login = await status('/api/admin/login', { method: 'POST', body: { username, password: 'smoke-password-1' } });
      asRole[role] = (login.res.headers.get('set-cookie') || '').split(';')[0];
      const sess = await json('/api/admin/session', { cookie: asRole[role] });
      if (sess.body.role === role && Array.isArray(sess.body.permissions) && sess.body.permissions.length) pass(`${role}: session lists permissions`, `${sess.body.permissions.length}`);
      else fail(`${role}: session lists permissions`, JSON.stringify(sess.body));
    }
    const adminSess = await json('/api/admin/session', { cookie });
    if (adminSess.body.permissions?.includes('operators:edit')) pass('admin: session lists operators:edit');
    else fail('admin: session lists operators:edit', JSON.stringify(adminSess.body));

    for (const role of ['editor', 'viewer']) {
      const c = asRole[role];
      if (!c) continue;
      await expect(`${role}: may read content`, '/api/content/deities', 200, { cookie: c });
      await expect(`${role}: may read money`, '/api/admin/coin-stats', 200, { cookie: c });
      await expect(`${role}: may read the call log`, '/api/admin/calls', 200, { cookie: c });
      await expect(`${role}: refused devotees`, '/api/users', 403, { cookie: c });
      await expect(`${role}: refused operators`, '/api/admin/operators', 403, { cookie: c });
      await expect(`${role}: refused the audit log`, '/api/admin/audit-log', 403, { cookie: c });
      await expect(`${role}: refused wallet lookup`, '/api/admin/wallets?q=a', 403, { cookie: c });
      await expect(`${role}: refused to push`, '/api/admin/announcements/000000000000000000000000/push', 403, { cookie: c, method: 'POST', body: {} });
      await expect(`${role}: refused to set a flag`, '/api/flags/bhajan', 403, { cookie: c, method: 'PUT', body: { enabled: true } });
      await expect(`${role}: refused to adjust a wallet`, '/api/admin/wallet/adjust', 403, { cookie: c, method: 'POST', body: {} });
      await expect(`${role}: refused to change billing rules`, '/api/admin/billing/rules', 403, { cookie: c, method: 'PUT', body: { callsEnabled: true } });
    }
    // An editor writes content (here a write that fails validation, so nothing is left behind); a viewer may not.
    if (asRole.editor) {
      const r = await status('/api/content/deities/000000000000000000000000', { method: 'PUT', cookie: asRole.editor, body: { name: 'x' } });
      if (r.code !== 403 && r.code !== 401) pass('editor: may write content', `${r.code}`);
      else fail('editor: may write content', `got ${r.code}`);
    }
    if (asRole.viewer) {
      await expect('viewer: refused to write content', '/api/content/deities/000000000000000000000000', 403, { method: 'PUT', cookie: asRole.viewer, body: { name: 'x' } });
    }
    await expect('admin: may read the audit log', '/api/admin/audit-log?limit=5', 200, { cookie });
    for (const id of made) await status(`/api/admin/operators/${id}`, { method: 'DELETE', cookie });

    await status('/api/admin/logout', { method: 'POST', cookie });
    // The cookie string is now stale server-side only if it were a stored
    // session; this one is stateless, so re-checking it would still pass.
    // What matters is that logout clears it in the browser, which the
    // dashboard e2e covers. Here we only assert the endpoint answers.
    await expect('logout responds', '/api/admin/logout', 200, { method: 'POST', cookie });
  }
} else {
  console.log('\nSign-in: skipped (no ADMIN_PASSWORD given)');
}

console.log(failed ? `\n${failed} FAILED\n` : '\nAll good.\n');
process.exit(failed ? 1 : 0);
