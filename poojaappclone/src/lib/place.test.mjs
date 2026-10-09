/** node --test src/lib/place.test.mjs */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ts = createRequire(import.meta.url)('typescript');
const here = path.dirname(fileURLToPath(import.meta.url));
const out = ts.transpileModule(fs.readFileSync(path.join(here, 'place.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
new Function('exports', 'module', out)(mod.exports, mod);
const { placeLine } = mod.exports;

test('placeLine does not repeat the temple when place already has it', () => {
  assert.equal(placeLine('Kashi Vishwanath', 'Kashi Vishwanath, Varanasi'), 'Kashi Vishwanath, Varanasi');
  assert.equal(placeLine('kashi vishwanath', 'Kashi Vishwanath , Varanasi'), 'kashi vishwanath, Varanasi');
});

test('placeLine prepends the temple when place lacks it, and tolerates blanks', () => {
  assert.equal(placeLine('Kashi Vishwanath', 'Varanasi'), 'Kashi Vishwanath, Varanasi');
  assert.equal(placeLine('', 'Varanasi'), 'Varanasi');
  assert.equal(placeLine(undefined, null), '');
});
