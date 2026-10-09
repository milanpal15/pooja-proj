// Pure unit tests — no database. Run: node --test src/modules/operators/session.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';

import { hashPassword, verifyPassword } from './passwords.js';
import { sign, sessionOf } from './session.js';

test('a password verifies against its own hash and nothing else', () => {
  const stored = hashPassword('correct horse');
  assert.match(stored, /^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
  assert.equal(verifyPassword('correct horse', stored), true);
  assert.equal(verifyPassword('wrong', stored), false);
  assert.equal(verifyPassword('x', undefined), false);
  assert.equal(verifyPassword('x', 'md5$a$b'), false);
});

test('a signed session round-trips; a tampered or expired one is refused', () => {
  const req = (token) => ({ headers: { cookie: `pooja_admin=${encodeURIComponent(token)}` } });
  const good = sign({ uid: 'u1', role: 'admin', exp: Date.now() + 60_000 });
  assert.equal(sessionOf(req(good))?.uid, 'u1');

  const [body, mac] = good.split('.');
  const forged = Buffer.from(JSON.stringify({ uid: 'u1', role: 'editor', exp: Date.now() + 60_000 })).toString('base64url');
  assert.equal(sessionOf(req(`${forged}.${mac}`)), null);
  assert.equal(sessionOf(req(`${body}.x`)), null);
  assert.equal(sessionOf(req(sign({ uid: 'u1', role: 'admin', exp: Date.now() - 1 }))), null);
  assert.equal(sessionOf({ headers: {} }), null);
});
