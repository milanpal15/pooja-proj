import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkOutcome, clock, daysKey, daysLabel, linkProblem, streamStatus, validateStream, draftFrom } from './live.js';

test('clock', () => {
  assert.equal(clock('04:00'), '4:00 am');
  assert.equal(clock('12:05'), '12:05 pm');
  assert.equal(clock('00:30'), '12:30 am');
});
test('days round trip', () => {
  assert.equal(daysKey('daily'), 'daily');
  assert.equal(daysKey([5, 4, 3, 2, 1]), 'weekdays');
  assert.equal(daysLabel([1, 3]), 'Mon, Wed');
});
test('status is honest about unverified', () => {
  assert.deepEqual(streamStatus({ state: 'live', verified: false, enabled: true }).note, 'not verified');
  assert.equal(streamStatus({ state: 'live', verified: true, enabled: true }).note, '');
  assert.equal(streamStatus({ state: 'live', enabled: false }).label, 'Hidden');
  assert.equal(streamStatus({ state: 'upcoming', nextAarti: { name: 'Ganga', time: '18:45' } }).label, 'Starts 6:45 pm');
  assert.equal(streamStatus({ state: 'offline' }).label, 'Source offline');
});
test('link problems', () => {
  assert.ok(linkProblem('youtube', ''));
  assert.ok(linkProblem('youtube', 'http://x'));
  assert.ok(linkProblem('hls', 'https://x/y'));
  assert.equal(linkProblem('hls', 'https://x/y.m3u8'), '');
});
test('check outcome', () => {
  assert.equal(checkOutcome({ ok: true, broadcasting: null }).tone, 'warn');
  assert.equal(checkOutcome({ ok: true, broadcasting: true }).tone, 'ok');
});
test('validate', () => {
  const d = { ...draftFrom({}), templeSlug: 'a', url: 'https://youtube.com/watch?v=x' };
  assert.deepEqual(validateStream(d), {});
  assert.ok(validateStream(d, { taken: ['a'] }).templeSlug);
  assert.ok(validateStream({ ...d, aartis: [{ name: 'x', time: '', days: 'daily' }] }).aartis);
});
