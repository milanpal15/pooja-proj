// requireAuth on a server with NO Firebase key — exactly how CI boots it.
//
// The order matters: a caller with no credentials is 401 whatever the server's
// configuration; 503 is only for a caller who presented a token the server cannot verify.
// (It used to answer 503 first, so the smoke test failed in CI, where there is no key.)
//
// dotenv never overrides a variable that is already set, so these three beat any local `.env`.
process.env.FIREBASE_SERVICE_ACCOUNT = '';
process.env.FIREBASE_SERVICE_ACCOUNT_PATH = '/nonexistent/firebase-service-account.json';
process.env.GOOGLE_APPLICATION_CREDENTIALS = '/nonexistent/firebase-service-account.json';

import assert from 'node:assert/strict';
import { test } from 'node:test';

const { requireAuth } = await import('./require-auth.js');
const { firebaseReady } = await import('../modules/auth/firebase.js');

const run = async (headers = {}) => {
  let status = 200;
  let body;
  const req = { get: (h) => headers[h.toLowerCase()] };
  const res = {
    status(s) { status = s; return this; },
    json(b) { body = b; return this; },
  };
  let nexted = false;
  await requireAuth(req, res, () => { nexted = true; });
  return { status, body, nexted };
};

test('the test really runs with no Firebase key', () => {
  assert.equal(firebaseReady(), false);
});

test('no token is 401, not 503', async () => {
  const r = await run();
  assert.equal(r.status, 401);
  assert.equal(r.body.error, 'missing bearer token');
  assert.equal(r.nexted, false);
});

test('an empty or non-Bearer header is still 401', async () => {
  assert.equal((await run({ authorization: '' })).status, 401);
  assert.equal((await run({ authorization: 'Basic abc' })).status, 401);
  assert.equal((await run({ authorization: 'Bearer ' })).status, 401);
});

test('a token the server cannot verify is 503, and is never trusted', async () => {
  const r = await run({ authorization: 'Bearer some.jwt.token' });
  assert.equal(r.status, 503);
  assert.equal(r.nexted, false);
});
