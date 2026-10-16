import assert from 'node:assert/strict';
import test from 'node:test';

import { canDecide, explain, formatValue, hoursLeft, isOwn, split, stripBookkeeping } from './approvals.js';

test('own-request lock', () => {
  const r = { status: 'pending', requestedBy: 'asha' };
  assert.equal(canDecide(r, 'ravi', true), true);
  assert.equal(canDecide(r, 'asha', true), false);
  assert.equal(canDecide(r, 'ravi', false), false);
  assert.equal(canDecide({ ...r, status: 'approved' }, 'ravi', true), false);
  assert.equal(isOwn(r, 'asha'), true);
});

test('split and sort', () => {
  const s = split([
    { id: 1, status: 'pending', requestedAt: '2026-10-02T00:00:00Z' },
    { id: 2, status: 'pending', requestedAt: '2026-10-01T00:00:00Z' },
    { id: 3, status: 'approved', requestedAt: '2026-09-01T00:00:00Z', decidedAt: '2026-09-02T00:00:00Z' },
    { id: 4, status: 'rejected', requestedAt: '2026-09-05T00:00:00Z', decidedAt: '2026-09-06T00:00:00Z' },
  ]);
  assert.deepEqual(s.pending.map((r) => r.id), [2, 1], 'oldest waiting first');
  assert.deepEqual(s.history.map((r) => r.id), [4, 3], 'newest decision first');
});

test('hours left, dates, bookkeeping, errors', () => {
  const now = Date.parse('2026-10-16T00:00:00Z');
  assert.equal(hoursLeft({ expiresAt: '2026-10-16T05:30:00Z' }, now), 6);
  assert.equal(hoursLeft({ expiresAt: '2026-10-15T00:00:00Z' }, now), 0);
  assert.equal(hoursLeft({}, now), 0);
  assert.match(formatValue('graceUntil', '2026-10-28T12:30:00Z'), /2026/);
  assert.equal(formatValue('message', '2026-10-28T12:30:00Z'), undefined);
  assert.deepEqual(stripBookkeeping({ a: 1, version: 3, updatedBy: 'x' }), { a: 1 });
  assert.match(explain({ code: 'own_request' }), /different operator/);
  assert.equal(explain({ message: 'boom' }), 'boom');
});
