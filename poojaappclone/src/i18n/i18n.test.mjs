/**
 * The i18n guard: `en/` and `hi/` must have the same namespace files and the
 * same keys in each. "Add keys to BOTH" (AGENTS.md §5) is a failing test here
 * rather than a convention.
 *
 *   node --test src/i18n/i18n.test.mjs
 *
 * The .ts sources are transpiled on the fly with the project's own
 * TypeScript, so this needs no extra tooling.
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

/** Load a .ts module (relative imports only) as CommonJS. */
function load(file, cache = new Map()) {
  const abs = path.resolve(file);
  if (cache.has(abs)) return cache.get(abs).exports;
  const out = ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  cache.set(abs, mod);
  const req = (spec) => {
    if (!spec.startsWith('.')) throw new Error(`unexpected import ${spec} in ${abs}`);
    return load(path.resolve(path.dirname(abs), `${spec}.ts`), cache);
  };
  new Function('exports', 'require', 'module', out)(mod.exports, req, mod);
  return mod.exports;
}

const namespaces = (lang) =>
  fs
    .readdirSync(path.join(here, lang))
    .filter((f) => f.endsWith('.ts'))
    .sort();

test('en/ and hi/ have the same namespace files', () => {
  assert.deepEqual(namespaces('en'), namespaces('hi'));
});

test('every namespace exports identical key sets in en and hi', () => {
  for (const file of namespaces('en')) {
    if (file === 'index.ts') continue;
    const en = Object.values(load(path.join(here, 'en', file)))[0];
    const hi = Object.values(load(path.join(here, 'hi', file)))[0];
    assert.deepEqual(Object.keys(en).sort(), Object.keys(hi).sort(), `${file} differs`);
  }
});

test('no key is defined in two namespaces', () => {
  for (const lang of ['en', 'hi']) {
    const seen = new Set();
    for (const file of namespaces(lang)) {
      if (file === 'index.ts') continue;
      for (const key of Object.keys(Object.values(load(path.join(here, lang, file)))[0])) {
        assert.ok(!seen.has(key), `${lang}: ${key} is defined twice`);
        seen.add(key);
      }
    }
  }
});

test('the merged trees have identical key sets', () => {
  const en = load(path.join(here, 'en', 'index.ts')).en;
  const hi = load(path.join(here, 'hi', 'index.ts')).hi;
  assert.deepEqual(Object.keys(en).sort(), Object.keys(hi).sort());
});
