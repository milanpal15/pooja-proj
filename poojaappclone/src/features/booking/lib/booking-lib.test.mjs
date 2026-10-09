/**
 * Pure booking logic: the status timeline and status chips.
 *
 *   node --test src/features/booking/lib/booking-lib.test.mjs
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
const { timelineSteps } = load(path.join(here, 'timeline.ts'));
const { poojaStatusChip, orderStatusChip, canCancelOrder } = load(path.join(here, 'status.ts'));

test('timeline: reached steps done, next one now; cancelled stops the flow', () => {
  const h = (...s) => s.map((status) => ({ status, at: '2026-10-08T06:12:00Z' }));
  const booked = timelineSteps({ status: 'booked', statusHistory: h('booked') });
  assert.deepEqual(booked.map((s) => s.state), ['done', 'now', 'todo']);
  const done = timelineSteps({ status: 'performed', statusHistory: h('booked', 'sankalp', 'performed') });
  assert.deepEqual(done.map((s) => s.state), ['done', 'done', 'done']);
  const cx = timelineSteps({ status: 'cancelled', statusHistory: h('booked', 'cancelled') });
  assert.deepEqual(cx.map((s) => s.status), ['booked', 'cancelled']);
});

test('status chips: every status has a label and tone', () => {
  for (const s of ['booked', 'sankalp', 'performed', 'cancelled']) assert.ok(poojaStatusChip(s).label.startsWith('ps_'));
  for (const s of ['booked', 'offered', 'cancelled']) assert.ok(orderStatusChip(s).label.startsWith('cs_'));
});

test('a chadhava order is cancellable only while booked', () => {
  assert.equal(canCancelOrder({ status: 'booked' }), true);
  assert.equal(canCancelOrder({ status: 'offered' }), false);
  assert.equal(canCancelOrder({ status: 'cancelled' }), false);
});
