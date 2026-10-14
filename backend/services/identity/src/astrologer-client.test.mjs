// Identity -> the astrologer owner: CALLS_URL set = the calls service's directory endpoints, unset = the monolith's internal endpoints (rollback).
// The request and response SHAPES are identical either way. Run: node --test src/astrologer-client.test.mjs   (no database needed)
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { verifyServiceToken } from '@bhakti/common';

import { createAstrologerClient } from './lib/astrologer-client.js';
import { loadConfig } from './config.js';

const SECRET = 'test-secret-test-secret-1234';
const base = { INTERNAL_JWT_SECRET: SECRET, MONOLITH_URL: 'http://monolith:4100/' };
const decoded = { uid: 'u1', email: 'a@x.co', email_verified: true, phone_number: '+919000000001', firebase: { sign_in_provider: 'google.com' }, name: 'Ignored', picture: 'ignored' };

function fake(answer) {
  const seen = [];
  return { seen, fetchImpl: async (url, init) => { seen.push({ url: String(url), init }); return new Response(JSON.stringify(answer), { status: 200 }); } };
}

test('CALLS_URL set: claim and active go to the calls service\'s directory, signed `identity`; unset: to the monolith\'s internal endpoints', async () => {
  for (const [env, claimUrl, activeUrl] of [
    [{ ...base, CALLS_URL: 'http://calls:4080/' }, 'http://calls:4080/internal/calls/directory/astrologers/claim', 'http://calls:4080/internal/calls/directory/astrologers/active?uid=u+1'],
    [base, 'http://monolith:4100/internal/astrologers/claim', 'http://monolith:4100/internal/astrologers/active?uid=u+1'],
  ]) {
    const f = fake({ astrologer: { id: 7, name: 'Pt. Sharma' } });
    const c = createAstrologerClient(loadConfig(env), { fetchImpl: f.fetchImpl });
    assert.deepEqual(await c.claim(decoded, 'req-1'), { id: '7', name: 'Pt. Sharma' });
    assert.deepEqual(await c.active('u 1', 'req-1'), { id: '7', name: 'Pt. Sharma' });
    assert.equal(f.seen[0].url, claimUrl);
    assert.equal(f.seen[1].url, activeUrl);
    assert.equal(f.seen[0].init.method, 'POST');
    assert.equal(verifyServiceToken(f.seen[0].init.headers.authorization.replace(/^Bearer /, ''), { secret: SECRET }).iss, 'identity');
    // only the verified identifiers cross; the name and picture of the token do not
    assert.deepEqual(JSON.parse(f.seen[0].init.body), { decoded: { uid: 'u1', email: 'a@x.co', email_verified: true, phone_number: '+919000000001', firebase: { sign_in_provider: 'google.com' } } });
  }
});

test('a null answer is null; the shape is { id: string, name }', async () => {
  const c = createAstrologerClient(loadConfig({ ...base, CALLS_URL: 'http://calls:4080' }), { fetchImpl: fake({ astrologer: null }).fetchImpl });
  assert.equal(await c.claim(decoded), null);
  assert.equal(await c.active('u1'), null);
});

test('CALLS_URL is an optional switch: absent it is empty, and it is trimmed', () => {
  assert.equal(loadConfig(base).callsUrl, '');
  assert.equal(loadConfig({ ...base, CALLS_URL: ' http://calls:4080// ' }).callsUrl, 'http://calls:4080');
});
