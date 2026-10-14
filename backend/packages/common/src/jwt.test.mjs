import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AuthError, bearer, signServiceToken, verifyServiceToken } from './index.js';

const secret = 'test-secret-test-secret-1234';
const claims = { iss: 'mobile-bff', sub: 'uid1', role: 'editor', perms: ['content:view'], reqId: 'r-1' };

test('round trip carries every claim and a 60 s expiry', () => {
  const now = 1_700_000_000_000;
  const t = signServiceToken(claims, { secret, now });
  const c = verifyServiceToken(t, { secret, now: now + 1000 });
  assert.equal(c.iss, 'mobile-bff');
  assert.equal(c.sub, 'uid1');
  assert.equal(c.role, 'editor');
  assert.deepEqual(c.perms, ['content:view']);
  assert.equal(c.reqId, 'r-1');
  assert.equal(c.exp - c.iat, 60);
});

test('missing token', () => {
  assert.throws(() => verifyServiceToken(undefined, { secret }), (e) => e instanceof AuthError && e.code === 'missing_token');
});

test('expired token', () => {
  const now = Date.now();
  const t = signServiceToken(claims, { secret, now });
  assert.throws(() => verifyServiceToken(t, { secret, now: now + 61_000 }), (e) => e.code === 'token_expired');
  assert.doesNotThrow(() => verifyServiceToken(t, { secret, now: now + 59_000 }));
});

test('wrong issuer', () => {
  const t = signServiceToken(claims, { secret });
  assert.throws(() => verifyServiceToken(t, { secret, issuers: ['admin-bff'] }), (e) => e.code === 'wrong_issuer');
  assert.doesNotThrow(() => verifyServiceToken(t, { secret, issuers: ['mobile-bff'] }));
});

test('wrong secret / tampered payload', () => {
  const t = signServiceToken(claims, { secret });
  assert.throws(() => verifyServiceToken(t, { secret: 'another-secret-another-1234' }), (e) => e.code === 'bad_signature');
  const [h, , s] = t.split('.');
  const evil = Buffer.from(JSON.stringify({ ...claims, role: 'admin', exp: 9e9 })).toString('base64url');
  assert.throws(() => verifyServiceToken(`${h}.${evil}.${s}`, { secret }), (e) => e.code === 'bad_signature');
});

test('alg none and garbage are malformed', () => {
  const h = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
  const p = Buffer.from(JSON.stringify({ iss: 'x', exp: 9e9 })).toString('base64url');
  assert.throws(() => verifyServiceToken(`${h}.${p}.`, { secret }), (e) => e.code === 'malformed_token');
  assert.throws(() => verifyServiceToken('abc', { secret }), (e) => e.code === 'malformed_token');
});

test('short or missing secret is refused', () => {
  assert.throws(() => signServiceToken(claims, { secret: 'x' }), (e) => e.code === 'not_configured');
  assert.throws(() => verifyServiceToken('a.b.c', {}), (e) => e.code === 'not_configured');
});

test('bearer()', () => {
  assert.equal(bearer('Bearer abc'), 'abc');
  assert.equal(bearer('Basic abc'), null);
  assert.equal(bearer(undefined), null);
});

// Golden vector shared with pooja-api/src/lib/engagement-client.test.mjs: the monolith signs with its own copy of
// this algorithm (it cannot import this package), so both sides pin the exact same bytes.
test('golden token: the format the monolith mirrors', () => {
  const t = signServiceToken(
    { iss: 'monolith', sub: 'op1', role: 'admin', perms: ['money:edit'], reqId: 'r1' },
    { secret: 'golden-secret-0123456789', now: 1_700_000_000_000 },
  );
  assert.equal(t, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJtb25vbGl0aCIsInN1YiI6Im9wMSIsInJvbGUiOiJhZG1pbiIsInBlcm1zIjpbIm1vbmV5OmVkaXQiXSwicmVxSWQiOiJyMSIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxNzAwMDAwMDYwfQ.YFCXlm0KXLMkVoBf3adqOy80Y9Vo4S-O7NI3hYqk2-Q');
});
