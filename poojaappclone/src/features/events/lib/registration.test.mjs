/**
 *   node --test src/features/events/lib/registration.test.mjs
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadTs } from './load-ts.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const R = loadTs(path.join(here, 'registration.ts'));

const NOW = Date.parse('2026-10-15T10:00:00Z');
const ev = (over = {}) => ({
  blocks: ['registration'],
  status: 'registration_open',
  full: false,
  spotsLeft: null,
  me: null,
  startsAt: '2026-10-17T14:30:00Z',
  schedule: { startsAt: '2026-10-17T14:30:00Z' },
  registration: { mode: 'free', opensAt: null, closesAt: null, fields: [] },
  ...over,
});

test('join plan from data only', () => {
  assert.equal(R.joinPlan(ev(), NOW), 'join');
  assert.equal(R.joinPlan(ev({ me: { registered: true } }), NOW), 'registered');
  assert.equal(R.joinPlan(ev({ full: true }), NOW), 'full');
  assert.equal(R.joinPlan(ev({ spotsLeft: 0 }), NOW), 'full');
  assert.equal(R.joinPlan(ev({ status: 'ended' }), NOW), 'closed');
  assert.equal(R.joinPlan(ev({ registration: { mode: 'free', opensAt: '2026-10-16T00:00:00Z' } }), NOW), 'opens_soon');
  assert.equal(R.joinPlan(ev({ registration: { mode: 'free', closesAt: '2026-10-15T09:00:00Z' } }), NOW), 'closed');
  assert.equal(R.joinPlan(ev({ registration: { mode: 'coins', coins: 10 } }), NOW), 'paid_soon');
  assert.equal(R.joinPlan(ev({ registration: { mode: 'none' } }), NOW), 'none');
  assert.equal(R.joinPlan(ev({ blocks: [] }), NOW), 'none');
  // Started but the window is open: still joinable.
  assert.equal(R.joinPlan(ev({ status: 'live' }), NOW), 'join');
  // Joined beats full.
  assert.equal(R.joinPlan(ev({ full: true, me: { registered: true } }), NOW), 'registered');
});

test('leave: free events, joined, before the start only', () => {
  const joined = ev({ me: { registered: true } });
  assert.equal(R.canLeave(joined, NOW), true);
  assert.equal(R.canLeave(joined, Date.parse('2026-10-17T15:00:00Z')), false);
  assert.equal(R.canLeave(ev(), NOW), false);
  assert.equal(R.canLeave(ev({ me: { registered: true }, registration: { mode: 'coins' } }), NOW), false);
});

const fields = [
  { key: 'name', label: 'Name', labelHi: 'नाम', type: 'text', required: true },
  { key: 'party', label: 'Party size', type: 'number', required: true },
  { key: 'diet', label: 'Diet', type: 'choice', required: false, options: ['Veg', 'Jain'] },
];

test('form fields: known types only', () => {
  const f = R.formFields({ registration: { fields: [...fields, { key: 'x', label: 'X', type: 'hologram' }, { key: '', label: 'no key', type: 'text' }] } });
  assert.deepEqual(f.map((x) => x.key), ['name', 'party', 'diet']);
  assert.deepEqual(R.formFields({}), []);
});

test('labels: Hindi only when written', () => {
  assert.equal(R.fieldLabel(fields[0], 'hi'), 'नाम');
  assert.equal(R.fieldLabel(fields[0], 'en'), 'Name');
  assert.equal(R.fieldLabel(fields[1], 'hi'), 'Party size');
});

test('validation: required, number, choice', () => {
  assert.deepEqual(R.validateAnswers(fields, {}).errors, { name: 'required', party: 'required' });
  assert.deepEqual(R.validateAnswers(fields, { name: ' ', party: '2' }).errors, { name: 'required' });
  assert.deepEqual(R.validateAnswers(fields, { name: 'A', party: 'two' }).errors, { party: 'number' });
  assert.deepEqual(R.validateAnswers(fields, { name: 'A', party: '2', diet: 'Vegan' }).errors, { diet: 'choice' });
  assert.equal(R.validateAnswers(fields, { name: 'A', party: '2.5', diet: 'Jain' }).ok, true);
  assert.equal(R.validateAnswers(fields, { name: 'A', party: '2', diet: '' }).ok, true);
  assert.equal(R.validateAnswers([], {}).ok, true);
});

test('clean answers: trimmed, numbers typed, blanks dropped', () => {
  assert.deepEqual(R.cleanAnswers(fields, { name: ' Asha ', party: '3', diet: '' }), { name: 'Asha', party: 3 });
});

test('join failures map to messages', () => {
  assert.deepEqual(R.joinFailure(409, 'full'), { key: 'ev_join_full', reload: true });
  assert.equal(R.joinFailure(409, 'closed').key, 'ev_join_closed');
  assert.equal(R.joinFailure(409, 'paid_not_available').key, 'ev_join_paid');
  assert.deepEqual(R.joinFailure(400, 'missing_field', { field: 'name' }), { key: 'ev_join_missing', field: 'name', reload: false });
  assert.equal(R.joinFailure(400, 'bad_answer').key, 'ev_join_bad');
  assert.equal(R.joinFailure(401).key, 'ev_join_signin');
  assert.equal(R.joinFailure(0).key, 'ev_join_offline');
  assert.equal(R.joinFailure(500).key, 'ev_join_failed');
});
