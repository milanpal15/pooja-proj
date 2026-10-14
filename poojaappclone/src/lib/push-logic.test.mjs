/**
 *   node --test src/lib/push-logic.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Transpile the .ts on the fly (works on every Node version CI uses, unlike importing .ts directly).
const require = createRequire(import.meta.url);
const ts = require('typescript');
const here = path.dirname(fileURLToPath(import.meta.url));
const out = ts.transpileModule(fs.readFileSync(path.join(here, 'push-logic.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
new Function('exports', 'require', 'module', out)(mod.exports, () => ({}), mod);
const { needsRegistration, routeForNotification, usableToken } = mod.exports;

test('an incoming-call notification opens the astrologer home, and only for an astrologer', () => {
  assert.equal(routeForNotification({ type: 'incoming_call', callId: 'c1' }, { astrologer: true }), '/astro-home');
  assert.equal(routeForNotification({ type: 'incoming_call' }, { astrologer: false }), null);
});

test('anything else just opens the app', () => {
  for (const d of [undefined, null, {}, { type: 'booking' }, 'x', 5]) assert.equal(routeForNotification(d, { astrologer: true }), null);
});

test('a usable token is a trimmed non-empty string within the server limit', () => {
  assert.equal(usableToken('  abc  '), 'abc');
  for (const bad of [undefined, null, '', '   ', 42, {}, 'x'.repeat(4097)]) assert.equal(usableToken(bad), null);
  assert.equal(usableToken('x'.repeat(4096))?.length, 4096);
});

test('registration is repeated only when the token or the account changed', () => {
  assert.equal(needsRegistration(null, 't', 'u'), true);
  assert.equal(needsRegistration({ token: 't', uid: 'u' }, 't', 'u'), false);
  assert.equal(needsRegistration({ token: 't', uid: 'u' }, 't2', 'u'), true);
  assert.equal(needsRegistration({ token: 't', uid: 'u' }, 't', 'u2'), true);
});
