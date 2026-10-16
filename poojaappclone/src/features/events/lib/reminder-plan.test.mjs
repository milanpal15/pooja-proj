/**
 *   node --test src/features/events/lib/reminder-plan.test.mjs
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadTs } from './load-ts.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const R = loadTs(path.join(here, 'reminder-plan.ts'));

const NOW = Date.parse('2026-10-15T10:00:00Z');

test('plans the instant the next milestone opens', () => {
  assert.equal(R.planReminder('2026-10-16T04:00:00Z', NOW), Date.parse('2026-10-16T04:00:00Z'));
});

test('no reminder when there is nothing real to schedule', () => {
  assert.equal(R.planReminder(null, NOW), null);
  assert.equal(R.planReminder(undefined, NOW), null);
  assert.equal(R.planReminder('garbage', NOW), null);
  assert.equal(R.planReminder('2026-10-15T09:00:00Z', NOW), null); // already open
  assert.equal(R.planReminder('2026-10-15T10:00:30Z', NOW), null); // too close to bother
});

test('bookkeeping map: one reminder per event', () => {
  let m = R.parseReminders(null);
  assert.deepEqual(m, {});
  m = R.withReminder(m, 'yatra', { id: 'n1', at: 100 });
  m = R.withReminder(m, 'yatra', { id: 'n2', at: 200 });
  m = R.withReminder(m, 'garba', { id: 'n3', at: 300 });
  assert.deepEqual(Object.keys(m).sort(), ['garba', 'yatra']);
  assert.equal(m.yatra.id, 'n2');
  assert.ok(R.alreadyScheduled(m, 'yatra', 200));
  assert.ok(!R.alreadyScheduled(m, 'yatra', 100));
  m = R.withoutReminder(m, 'yatra');
  assert.deepEqual(Object.keys(m), ['garba']);
  assert.deepEqual(R.withoutReminder({}, 'x'), {});
});

test('parse is tolerant; prune drops fired reminders', () => {
  assert.deepEqual(R.parseReminders('nope'), {});
  assert.deepEqual(R.parseReminders('[1,2]'), {});
  assert.deepEqual(R.parseReminders('{"a":{"id":"x","at":5},"b":{"id":1}}'), { a: { id: 'x', at: 5 } });
  assert.deepEqual(R.pruneReminders({ a: { id: 'x', at: 5 }, b: { id: 'y', at: 50 } }, 10), { b: { id: 'y', at: 50 } });
});
