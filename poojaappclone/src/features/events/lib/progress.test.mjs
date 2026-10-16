/**
 *   node --test src/features/events/lib/progress.test.mjs
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadTs } from './load-ts.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const P = loadTs(path.join(here, 'progress.ts'));

const detail = () => ({
  slug: 'e',
  blocks: ['milestones'],
  me: { registered: true, progress: { done: 0, total: 2 }, currentMilestoneKey: 'm1' },
  milestones: {
    items: [
      { key: 'm1', title: 'Day 1', titleHi: 'दिन 1', tasks: [{ key: 't1', kind: 'counter', config: { target: 108 }, state: { count: 10 } }, { key: 't2', kind: 'self_mark' }] },
      { key: 'm2', title: 'Day 2', locked: true },
    ],
  },
});

test('findTask', () => {
  assert.equal(P.findTask(detail(), 'm1', 't2').task.kind, 'self_mark');
  assert.equal(P.findTask(detail(), 'm1', 'zz'), null);
  assert.equal(P.findTask(null, 'm1', 't1'), null);
});

test('applyProgress folds the task state and me, without touching the input', () => {
  const d = detail();
  const out = P.applyProgress(d, 'm1', {
    task: { key: 't1', done: false, state: { count: 60 } },
    milestone: { key: 'm1', done: false },
    event: {},
    awarded: { coins: 0 },
    completion: null,
    me: { registered: true, progress: { done: 0, total: 2 }, currentMilestoneKey: 'm1' },
  });
  assert.equal(out.milestones.items[0].tasks[0].state.count, 60);
  assert.equal(d.milestones.items[0].tasks[0].state.count, 10);
  assert.equal(out.milestones.items[0].done, undefined);
  assert.equal(out.milestones.items[1].locked, true);
});

test('a completed milestone is marked done and me.progress follows the server', () => {
  const out = P.applyProgress(detail(), 'm1', {
    task: { key: 't2', done: true, completedAt: '2026-10-15T01:00:00Z', state: {} },
    milestone: { key: 'm1', done: true, justCompleted: true },
    event: {},
    awarded: { coins: 11 },
    completion: null,
    me: { registered: true, progress: { done: 1, total: 2 }, currentMilestoneKey: 'm2' },
  });
  assert.equal(out.milestones.items[0].done, true);
  assert.equal(out.milestones.items[0].tasks[1].done, true);
  assert.equal(out.me.progress.done, 1);
  assert.equal(out.me.currentMilestoneKey, 'm2');
});

test('response without me keeps the detail me', () => {
  const out = P.applyProgress(detail(), 'm1', { task: { key: 't2', done: true }, milestone: { key: 'm1' }, event: {}, awarded: { coins: 0 }, completion: null });
  assert.equal(out.me.currentMilestoneKey, 'm1');
  assert.equal(P.applyMe(detail(), undefined).me.currentMilestoneKey, 'm1');
  assert.equal(P.applyMe(detail(), null).me, null);
});

test("today's title from the current milestone key, in the language", () => {
  const items = detail().milestones.items;
  assert.equal(P.todayTitle('m1', items, 'en'), 'Day 1');
  assert.equal(P.todayTitle('m1', items, 'hi'), 'दिन 1');
  assert.equal(P.todayTitle('m2', items, 'hi'), 'Day 2');
  assert.equal(P.todayTitle('nope', items, 'en'), '');
  assert.equal(P.todayTitle(null, items, 'en'), '');
});

test('how lines follow the language and drop blanks', () => {
  const c = { how: [{ text: 'Chanted 108 times', textHi: '108 बार जप' }, { text: 'Marked done' }, { text: '  ' }] };
  assert.deepEqual(P.howLines(c, 'en'), ['Chanted 108 times', 'Marked done']);
  assert.deepEqual(P.howLines(c, 'hi'), ['108 बार जप', 'Marked done']);
});

test('pips: one per milestone, none for long events', () => {
  assert.deepEqual(P.pips({ done: 2, total: 4 }), [true, true, false, false]);
  assert.equal(P.pips({ done: 1, total: 60 }), null);
  assert.equal(P.pips({ done: 0, total: 0 }), null);
});

test('task action', () => {
  assert.equal(P.taskAction({ kind: 'self_mark' }), 'mark');
  assert.equal(P.taskAction({ kind: 'self_mark', done: true }), 'done');
  assert.equal(P.taskAction({ kind: 'counter', config: { target: 9 }, state: { count: 2 } }), 'count');
  assert.equal(P.taskAction({ kind: 'counter', config: {} }), 'none');
  assert.equal(P.taskAction({ kind: 'location' }), 'none');
  assert.equal(P.taskAction({ kind: 'from_the_future' }), 'none');
});

test('share text fills the placeholders', () => {
  assert.equal(P.shareText('{title} · {event} bhakti://events/{slug}', { title: 'Day 5', event: 'Yatra', slug: 'yatra' }), 'Day 5 · Yatra bhakti://events/yatra');
});

test('task failures', () => {
  assert.equal(P.taskFailure(0).key, 'ev_task_offline');
  assert.equal(P.taskFailure(403, 'not_registered').key, 'ev_task_join_first');
  assert.deepEqual(P.taskFailure(409, 'locked'), { key: 'ev_task_locked', reload: true });
  assert.equal(P.taskFailure(409, 'closed').key, 'ev_task_closed');
  assert.equal(P.taskFailure(422, 'task_not_supported').key, 'ev_task_update');
  assert.equal(P.taskFailure(500).key, 'ev_task_failed');
  assert.equal(P.taskFailure(401).key, 'ev_task_signin');
});

test('needs join: only when a registration block exists and the caller has not joined', () => {
  const base = { blocks: ['registration'], registration: { mode: 'free' }, me: { registered: false } };
  assert.equal(P.needsJoin(base), true);
  assert.equal(P.needsJoin({ ...base, me: { registered: true } }), false);
  assert.equal(P.needsJoin({ ...base, registration: { mode: 'none' } }), false);
  assert.equal(P.needsJoin({ ...base, blocks: ['milestones'] }), false);
  assert.equal(P.needsJoin({ ...base, me: null }), true);
});

test('today row carries the milestone number', () => {
  const items = detail().milestones.items;
  assert.deepEqual(P.todayRow('m2', items, 'en'), { index: 2, title: 'Day 2' });
  assert.deepEqual(P.todayRow('m1', items, 'hi'), { index: 1, title: 'दिन 1' });
  assert.equal(P.todayRow('zz', items, 'en'), null);
});

test('applyProgress marks a reached stop on the route and moves doneKm', () => {
  const d = {
    ...detail(),
    route: {
      start: { name: 'A', lat: 0, lng: 0 },
      end: { name: 'B', lat: 0, lng: 0 },
      path: [],
      lengthKm: 31,
      stops: [
        { milestoneKey: 'm1', taskKey: 't1', order: 1, name: 'One', lat: 1, lng: 1, radiusM: 150, routeKm: 12.4, done: false, locked: false },
        { milestoneKey: 'm2', taskKey: 't1', order: 2, name: 'Two', lat: 1, lng: 1, radiusM: 150, routeKm: 20, done: false, locked: true },
      ],
      progress: { doneKm: 0, totalKm: 31, stopsDone: 0, stopsTotal: 2 },
    },
  };
  const out = P.applyProgress(d, 'm1', { task: { key: 't1', done: true, completedAt: 'x' }, milestone: { key: 'm1', done: true }, event: {}, awarded: { coins: 0 }, completion: null });
  assert.equal(out.route.stops[0].done, true);
  assert.equal(out.route.stops[0].state, 'done');
  assert.equal(out.route.progress.stopsDone, 1);
  assert.equal(out.route.progress.doneKm, 12.4);
  assert.equal(out.route.stops[1].done, false);
  // a not-done answer, or an event without a route, changes nothing about the route
  const same = P.applyProgress(d, 'm1', { task: { key: 't1', done: false }, milestone: { key: 'm1' }, event: {}, awarded: { coins: 0 }, completion: null });
  assert.equal(same.route.stops[0].done, false);
  assert.equal(P.applyProgress(detail(), 'm1', { task: { key: 't1', done: true }, milestone: { key: 'm1' }, event: {}, awarded: { coins: 0 }, completion: null }).route, undefined);
});
