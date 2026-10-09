/**
 * Chadhava cart maths, route-param round trip and temple matching.
 *
 *   node --test src/features/chadhava/lib/chadhava-lib.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const here = path.dirname(fileURLToPath(import.meta.url));
const out = ts.transpileModule(fs.readFileSync(path.join(here, 'cart.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
new Function('exports', 'module', out)(mod.exports, mod);
const { bump, cartCount, cartTotal, cartItems, encodeCart, decodeCart, listingsForTemple } = mod.exports;

test('bump clamps to 0..20 and drops zero quantities', () => {
  let c = bump({}, 'a', 1);
  assert.deepEqual(c, { a: 1 });
  c = bump(c, 'a', 50);
  assert.equal(c.a, 20);
  c = bump(c, 'a', -50);
  assert.deepEqual(c, {});
  assert.deepEqual(bump({}, 'a', -1), {});
});

test('an 11th distinct offering is refused', () => {
  let c = {};
  for (let i = 0; i < 10; i++) c = bump(c, `k${i}`, 1);
  assert.equal(Object.keys(bump(c, 'k10', 1)).length, 10);
  assert.equal(bump(c, 'k3', 1).k3, 2, 'more of an existing one is fine');
});

test('total and count', () => {
  const offerings = [{ key: 'a', coins: 51 }, { key: 'b', coins: 101 }, { key: 'gone', coins: 9 }];
  assert.equal(cartTotal(offerings, { a: 2, b: 1 }), 203);
  assert.equal(cartTotal(offerings, {}), 0);
  assert.equal(cartCount({ a: 2, b: 1 }), 3);
});

test('payload is sorted and has no zero quantities', () => {
  assert.deepEqual(cartItems({ b: 1, a: 2, c: 0 }), [{ key: 'a', qty: 2 }, { key: 'b', qty: 1 }]);
});

test('route param round trip; junk is ignored', () => {
  assert.equal(encodeCart({ b: 1, a: 2 }), 'a:2,b:1');
  assert.deepEqual(decodeCart('a:2,b:1'), { a: 2, b: 1 });
  assert.deepEqual(decodeCart('a:2,,x:0,y:-3,z:abc,w:99'), { a: 2, w: 20 });
  assert.deepEqual(decodeCart(undefined), {});
});

test('temple matching works on slug or name', () => {
  const ls = [{ templeName: 'Kashi Vishwanath' }, { templeName: 'Siddhivinayak' }];
  assert.equal(listingsForTemple(ls, undefined).length, 2);
  assert.equal(listingsForTemple(ls, 'kashi-vishwanath').length, 1);
  assert.equal(listingsForTemple(ls, 'kashi', 'Siddhivinayak').length, 1);
  assert.equal(listingsForTemple(ls, 'nowhere').length, 0);
});

test('a listing tied to no temple is offered at every temple', () => {
  const ls = [{ templeName: 'Kashi Vishwanath' }, { templeName: '' }];
  assert.equal(listingsForTemple(ls, 'kashi-vishwanath').length, 2);
  assert.equal(listingsForTemple(ls, 'nowhere').length, 1);
});
