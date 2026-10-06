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

console.log('\nGated — a stranger must not reach these:');
await expect('GET /api/flags/full', '/api/flags/full', 401);
await expect('GET /api/analytics/summary', '/api/analytics/summary', 401);
await expect('GET /api/users', '/api/users', 401);
await expect('GET /api/visitors', '/api/visitors', 401);
await expect('GET /api/payments', '/api/payments', 401);
await expect('GET /api/content/deities', '/api/content/deities', 401);
await expect('GET /api/admin/policies', '/api/admin/policies', 401);

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

/* The sign-in round trip, when a password is available. */
if (PASSWORD) {
  console.log('\nSign-in:');
  await expect('wrong password rejected', '/api/admin/login', 401, {
    method: 'POST',
    body: { password: `${PASSWORD}-wrong` },
  });

  const { res } = await status('/api/admin/login', { method: 'POST', body: { password: PASSWORD } });
  if (res.status !== 200) {
    fail('correct password accepted', `got ${res.status}`);
  } else {
    pass('correct password accepted');

    const setCookie = res.headers.get('set-cookie') || '';
    const cookie = setCookie.split(';')[0];
    if (!/HttpOnly/i.test(setCookie)) fail('session cookie is HttpOnly');
    else pass('session cookie is HttpOnly');
    if (!/SameSite=Strict/i.test(setCookie)) fail('session cookie is SameSite=Strict');
    else pass('session cookie is SameSite=Strict');
    // Secure only makes sense over TLS; locally the server omits it.
    if (BASE.startsWith('https://')) {
      if (!/Secure/i.test(setCookie)) fail('session cookie is Secure over https');
      else pass('session cookie is Secure over https');
    }

    await expect('session opens /api/users', '/api/users', 200, { cookie });
    await expect('session opens content CRUD', '/api/content/deities', 200, { cookie });

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
