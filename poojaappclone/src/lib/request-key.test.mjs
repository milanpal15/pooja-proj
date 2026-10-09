/**
 *   node --test src/lib/request-key.test.mjs
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
const out = ts.transpileModule(fs.readFileSync(path.join(here, 'request-key.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
new Function('exports', 'module', out)(mod.exports, mod);
const { createRequestKeeper } = mod.exports;

const counter = () => {
  let n = 0;
  return () => `id-${++n}`;
};

test('same order, same id across retries', () => {
  const k = createRequestKeeper(counter());
  const a = k.idFor('pkg:a');
  assert.equal(k.idFor('pkg:a'), a);
  assert.equal(k.idFor('pkg:a'), a);
});

test('a changed order gets a new id', () => {
  const k = createRequestKeeper(counter());
  const a = k.idFor('pkg:a');
  const b = k.idFor('pkg:b');
  assert.notEqual(a, b);
  assert.notEqual(k.idFor('pkg:a'), a, 'going back is a new order too');
});

test('clear() forces a fresh id for the identical order', () => {
  const k = createRequestKeeper(counter());
  const a = k.idFor('x');
  k.clear();
  assert.notEqual(k.idFor('x'), a);
});
