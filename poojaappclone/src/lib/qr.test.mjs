/**
 *   node --test src/lib/qr.test.mjs
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
const src = ts.transpileModule(fs.readFileSync(path.join(here, 'qr.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
new Function('exports', 'require', 'module', src)(mod.exports, () => ({}), mod);
const Q = mod.exports;

test('Reed-Solomon matches the ISO 18004 worked example (1-M "HELLO WORLD")', () => {
  const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  assert.deepEqual(Q.rsEncode(data, 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
});

test('data codewords: byte mode header, count, terminator and pad bytes', () => {
  const cw = Q.dataCodewords([0x41, 0x42], 16);
  assert.equal(cw.length, 16);
  assert.deepEqual(cw.slice(0, 4), [0x40, 0x24, 0x14, 0x20]); // 0100 00000010 01000001 01000010 0000
  assert.deepEqual(cw.slice(4, 8), [0xec, 0x11, 0xec, 0x11]);
});

test('format bits: known BCH values', () => {
  assert.equal(Q.formatBits('M', 0), 0b101010000010010);
  assert.equal(Q.formatBits('L', 4), 0b110011000101111);
});

test('pass-code sized input is a version 1 (21x21) symbol with intact finder patterns', () => {
  const m = Q.qrMatrix('GRB-4K7Q');
  assert.equal(m.length, 21);
  for (const row of m) assert.equal(row.length, 21);
  for (const [ox, oy] of [[0, 0], [14, 0], [0, 14]]) {
    for (let d = 0; d < 7; d++) {
      assert.ok(m[oy][ox + d] && m[oy + 6][ox + d] && m[oy + d][ox] && m[oy + d][ox + 6], 'finder ring');
    }
    assert.ok(m[oy + 3][ox + 3] && !m[oy + 1][ox + 1], 'finder core and gap');
  }
  assert.ok(m[13][8], 'dark module');
  for (let i = 8; i < 13; i++) assert.equal(m[6][i], i % 2 === 0, 'timing row');
});

test('size grows with the payload and is deterministic', () => {
  assert.equal(Q.qrMatrix('a'.repeat(15)).length, 25); // v2-M
  assert.equal(Q.qrMatrix('a'.repeat(27)).length, 29); // v3-M
  assert.equal(Q.qrMatrix('a'.repeat(60)).length, 33); // v4-L
  assert.deepEqual(Q.qrMatrix('GRB-4K7Q'), Q.qrMatrix('GRB-4K7Q'));
});

test('too long or empty is null (the screen shows the code as text)', () => {
  assert.equal(Q.qrMatrix('x'.repeat(79)), null);
  assert.equal(Q.qrMatrix(''), null);
});

test('qrPath draws exactly the dark modules', () => {
  const m = [[true, true, false], [false, true, false], [true, false, true]];
  assert.equal(Q.qrPath(m), 'M0 0h2v1h-2zM1 1h1v1h-1zM0 2h1v1h-1zM2 2h1v1h-1z');
  assert.equal(Q.qrPath([[true]], 2), 'M2 2h1v1h-1z');
});
