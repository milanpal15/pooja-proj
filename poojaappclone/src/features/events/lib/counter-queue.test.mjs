/**
 *   node --test src/features/events/lib/counter-queue.test.mjs
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadTs } from './load-ts.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const Q = loadTs(path.join(here, 'counter-queue.ts'));

test('resumes from the server count, plus unsent taps from an earlier session', () => {
  const s = Q.initCounter(54, 108, 6);
  assert.equal(Q.shown(s), 60);
  assert.equal(Q.unsent(s), 6);
  assert.equal(Q.shown(Q.initCounter(54, 108)), 54);
});

test('unsent taps never push the display past the target; bad input is safe', () => {
  assert.equal(Q.shown(Q.initCounter(100, 108, 50)), 108);
  const s = Q.initCounter(undefined, 'x');
  assert.equal(Q.shown(s), 0);
  assert.equal(Q.initCounter(108, 108).done, true);
  assert.equal(Q.unsent(Q.initCounter(108, 108, 5)), 0);
});

test('taps batch into one request; a second flush waits for the first', () => {
  let s = Q.initCounter(0, 108);
  for (let i = 0; i < 5; i++) s = Q.tap(s);
  assert.equal(Q.shown(s), 5);
  const b = Q.nextBatch(s);
  assert.equal(b.add, 5);
  s = b.state;
  assert.equal(Q.shown(s), 5); // inflight still shows
  s = Q.tap(s);
  assert.equal(Q.shown(s), 6);
  assert.equal(Q.nextBatch(s), null); // one request at a time
  s = Q.applySuccess(s, 5, false);
  assert.equal(s.confirmed, 5);
  assert.equal(Q.shown(s), 6); // the tap made during flight is still pending
  assert.equal(Q.nextBatch(s).add, 1);
});

test('a batch is at most 200', () => {
  let s = Q.initCounter(0, 1000);
  for (let i = 0; i < 450; i++) s = Q.tap(s);
  const b = Q.nextBatch(s);
  assert.equal(b.add, 200);
  assert.equal(b.state.pending, 250);
});

test('taps stop at the target', () => {
  let s = Q.initCounter(106, 108);
  for (let i = 0; i < 10; i++) s = Q.tap(s);
  assert.equal(Q.shown(s), 108);
  assert.equal(s.pending, 2);
});

test('the server count wins: success adopts it, done finishes the counter', () => {
  let s = Q.initCounter(0, 108);
  for (let i = 0; i < 3; i++) s = Q.tap(s);
  s = Q.nextBatch(s).state;
  s = Q.applySuccess(s, 40, false); // somebody (another device) had counted more
  assert.equal(Q.shown(s), 40);
  s = Q.applySuccess(Q.nextBatch(Q.tap(s)).state, 108, true);
  assert.equal(s.done, true);
  assert.equal(Q.shown(s), 108);
  assert.equal(Q.nextBatch(Q.tap(s)), null);
  assert.equal(Q.unsent(s), 0);
});

test('429 too_fast adopts the server count and puts the unapplied batch back — no tap is lost', () => {
  let s = Q.initCounter(10, 108);
  for (let i = 0; i < 4; i++) s = Q.tap(s);
  s = Q.nextBatch(s).state;
  s = Q.tap(Q.tap(s)); // two more while in flight
  s = Q.applyTooFast(s, 10);
  assert.equal(s.confirmed, 10);
  assert.equal(s.inflight, 0);
  assert.equal(s.pending, 6); // 4 rejected + 2 waiting
  assert.equal(Q.shown(s), 16);
  // The server may be ahead: adopt it, and never keep more pending than room.
  const s2 = Q.applyTooFast(Q.nextBatch(Q.initCounter(0, 10, 9)).state, 8);
  assert.equal(Q.shown(s2), 10);
  assert.equal(s2.pending, 2);
});

test('offline puts the batch back; nothing is lost', () => {
  let s = Q.initCounter(0, 108);
  for (let i = 0; i < 7; i++) s = Q.tap(s);
  s = Q.nextBatch(s).state;
  s = Q.applyOffline(s);
  assert.equal(s.pending, 7);
  assert.equal(s.inflight, 0);
  assert.equal(Q.unsent(s), 7);
});

test('a definitive refusal drops everything waiting', () => {
  let s = Q.initCounter(0, 108);
  s = Q.tap(Q.tap(s));
  s = Q.applyRejected(Q.nextBatch(s).state);
  assert.equal(Q.unsent(s), 0);
  assert.equal(Q.shown(s), 0);
});

test('flush timing: debounce, but never closer than the server cap', () => {
  assert.equal(Q.flushDelay(1000, null), Q.DEBOUNCE_MS);
  assert.equal(Q.flushDelay(1000, 900), Q.DEBOUNCE_MS);
  assert.ok(Q.DEBOUNCE_MS >= Q.MIN_GAP_MS);
  assert.ok(Q.MIN_GAP_MS > 400);
});

test('persisted unsent taps: key per devotee and task, tolerant parser', () => {
  assert.equal(Q.unsentKey('u1', 'yatra', 'm2', 't1'), 'events.counter.v1.u1.yatra.m2.t1');
  assert.notEqual(Q.unsentKey('u1', 'a', 'm', 't'), Q.unsentKey('u2', 'a', 'm', 't'));
  assert.equal(Q.parseUnsent('{"pending":12}'), 12);
  assert.equal(Q.parseUnsent('nope'), 0);
  assert.equal(Q.parseUnsent(null), 0);
  assert.equal(Q.parseUnsent('{"pending":-3}'), 0);
});
