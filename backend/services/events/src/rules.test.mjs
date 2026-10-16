// Pure rules of the completion engine and registration: no database, no network.
// Run: node --test --test-concurrency=1 src/rules.test.mjs
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { PASS_ALPHABET, makePassCode, validateAnswers } from './engine/registration.js';
import { currentMilestoneKey, doneKeysOf, eventComplete, milestoneOpenState, ruleMet } from './engine/rules.js';
import { planEvent, planMilestone } from './engine/rewards.js';

const T = (s) => new Date(s).getTime();

describe('ruleMet', () => {
  test('all / atLeast / any, and an empty set is never complete', () => {
    assert.equal(ruleMet({ rule: 'all' }, 2, 3), false);
    assert.equal(ruleMet({ rule: 'all' }, 3, 3), true);
    assert.equal(ruleMet({ rule: 'any' }, 0, 3), false);
    assert.equal(ruleMet({ rule: 'any' }, 1, 3), true);
    assert.equal(ruleMet({ rule: 'atLeast', n: 2 }, 1, 3), false);
    assert.equal(ruleMet({ rule: 'atLeast', n: 2 }, 2, 3), true);
    assert.equal(ruleMet({ rule: 'all' }, 0, 0), false);
    assert.equal(ruleMet({ rule: 'any' }, 1, 0), false);
  });
  test('an atLeast that an edit pushed above the total means "all"; a missing rule means "all"', () => {
    assert.equal(ruleMet({ rule: 'atLeast', n: 9 }, 2, 3), false);
    assert.equal(ruleMet({ rule: 'atLeast', n: 9 }, 3, 3), true);
    assert.equal(ruleMet(undefined, 3, 3), true);
    assert.equal(ruleMet(undefined, 2, 3), false);
  });
});

describe('milestoneOpenState', () => {
  const item = (key, opensAt) => ({ key, opensAt: opensAt ? new Date(opensAt) : null, tasks: [] });
  const daily = (missed) => ({ order: 'daily', missed, items: [item('d1', '2026-03-10T00:30:00+05:30'), item('d2', '2026-03-11T00:30:00+05:30'), item('d3', '2026-03-12T00:30:00+05:30')] });
  const sched = { mode: 'multiday', startsAt: new Date('2026-03-09T18:30:00Z'), endsAt: new Date('2026-03-13T18:30:00Z') };
  const at = (ms_, i, done, when) => milestoneOpenState(ms_, i, new Set(done), T(when), sched);

  test('any: only opensAt', () => {
    const ms = { order: 'any', items: [item('a'), item('b', '2026-03-10T10:00:00Z')] };
    assert.equal(at(ms, 0, [], '2026-03-01T00:00:00Z').open, true);
    assert.deepEqual([at(ms, 1, [], '2026-03-10T09:59:59Z').open, at(ms, 1, [], '2026-03-10T09:59:59Z').reason], [false, 'locked']);
    assert.equal(at(ms, 1, [], '2026-03-10T10:00:00Z').open, true);
    assert.equal(at(ms, 1, [], '2027-01-01T00:00:00Z').open, true, 'no window for non-daily events');
  });
  test('sequential: n opens when n-1 is complete (and at its own opensAt)', () => {
    const ms = { order: 'sequential', items: [item('a'), item('b'), item('c', '2026-03-10T10:00:00Z')] };
    assert.equal(at(ms, 1, [], '2026-03-10T11:00:00Z').reason, 'locked');
    assert.equal(at(ms, 1, ['a'], '2026-03-10T11:00:00Z').open, true);
    assert.equal(at(ms, 2, ['a', 'b'], '2026-03-10T09:00:00Z').reason, 'locked', 'previous done but its own time has not come');
    assert.equal(at(ms, 2, ['a', 'b'], '2026-03-10T10:00:00Z').open, true);
    assert.equal(at(ms, 2, ['a'], '2026-03-10T11:00:00Z').reason, 'locked', 'c needs b, the one before it');
  });
  test('daily + lock_at_end: only during its own IST day', () => {
    const ms = daily('lock_at_end');
    assert.equal(at(ms, 0, [], '2026-03-09T18:29:00Z').reason, 'locked'); // 23:59 IST on the 9th
    assert.equal(at(ms, 0, [], '2026-03-09T19:00:00Z').open, true); // 00:30 IST on the 10th
    assert.equal(at(ms, 0, [], '2026-03-10T18:29:59Z').open, true); // 23:59:59 IST on the 10th
    assert.equal(at(ms, 0, [], '2026-03-10T18:30:00Z').reason, 'missed'); // 00:00 IST on the 11th
    assert.equal(at(ms, 0, ['d1'], '2026-03-12T00:00:00Z').open, true, 'a completed milestone is never "missed"');
  });
  test('daily + catch_up_next: stays open through the IST day the next milestone opens', () => {
    const ms = daily('catch_up_next');
    assert.equal(at(ms, 0, [], '2026-03-11T18:29:59Z').open, true);
    assert.equal(at(ms, 0, [], '2026-03-11T18:30:00Z').reason, 'missed');
    // the last milestone is open until the event ends
    assert.equal(at(ms, 2, [], '2026-03-13T18:29:00Z').open, true);
    assert.equal(at(ms, 2, [], '2026-03-13T18:30:00Z').reason, 'missed');
  });
  test('daily + catch_up_any: open until the event ends', () => {
    const ms = daily('catch_up_any');
    assert.equal(at(ms, 0, [], '2026-03-13T18:29:00Z').open, true);
    assert.equal(at(ms, 0, [], '2026-03-13T18:30:00Z').reason, 'missed');
    const open = milestoneOpenState(ms, 0, new Set(), T('2030-01-01T00:00:00Z'), { mode: 'always' });
    assert.equal(open.open, true, 'no end, no window');
  });
});

describe('currentMilestoneKey / eventComplete / doneKeysOf', () => {
  const ms = { order: 'sequential', completion: { rule: 'atLeast', n: 2 }, items: [{ key: 'a', tasks: [] }, { key: 'b', tasks: [] }, { key: 'c', tasks: [] }] };
  test('first not-done open milestone; null when none', () => {
    assert.equal(currentMilestoneKey(ms, new Set(), 0, null), 'a');
    assert.equal(currentMilestoneKey(ms, new Set(['a']), 0, null), 'b');
    assert.equal(currentMilestoneKey(ms, new Set(['a', 'b', 'c']), 0, null), null);
  });
  test('removed milestones do not count; the event rule runs over the live ones', () => {
    assert.deepEqual([...doneKeysOf(ms, ['a', 'gone'])], ['a']);
    assert.equal(eventComplete(ms, new Set(['a'])), false);
    assert.equal(eventComplete(ms, new Set(['a', 'c'])), true);
  });
});

describe('pass codes and answers', () => {
  test('format <PREFIX>-<4 chars> from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i += 1) {
      const c = makePassCode('navratri-garba');
      assert.match(c, /^NAV-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
    }
    assert.equal(makePassCode('7-up').startsWith('UPX-'), true, 'digits are skipped, short slugs padded');
    assert.equal(PASS_ALPHABET.length, 31);
    for (const bad of ['I', 'L', 'O', '0', '1']) assert.equal(PASS_ALPHABET.includes(bad), false);
  });
  const fields = [
    { key: 'party', label: 'Party', type: 'number', required: true },
    { key: 'diet', label: 'Diet', type: 'choice', options: ['veg', 'jain'], required: false },
    { key: 'note', label: 'Note', type: 'text', required: false },
  ];
  const fail = (answers) => { try { validateAnswers(fields, answers); } catch (e) { return [e.status, e.code, e.extra.field]; } return null; };
  test('required, types, options, unknown keys dropped', () => {
    assert.deepEqual(validateAnswers(fields, { party: '3', diet: 'jain', note: ' hi ', junk: 1 }), { party: 3, diet: 'jain', note: 'hi' });
    assert.deepEqual(validateAnswers(fields, { party: 2 }), { party: 2 });
    assert.deepEqual(fail({}), [400, 'missing_field', 'party']);
    assert.deepEqual(fail({ party: '   ' }), [400, 'missing_field', 'party']);
    assert.deepEqual(fail({ party: 'many' }), [400, 'bad_answer', 'party']);
    assert.deepEqual(fail({ party: 1, diet: 'meat' }), [400, 'bad_answer', 'diet']);
    assert.deepEqual(fail({ party: 1, note: 5 }), [400, 'bad_answer', 'note']);
    assert.deepEqual(fail({ party: 1, note: 'x'.repeat(501) }), [400, 'bad_answer', 'note']);
    assert.deepEqual(fail([]), [400, 'bad_answer', undefined]);
    assert.deepEqual(validateAnswers([], undefined), {});
  });
});

describe('reward plans (the wallet keys)', () => {
  const ev = {
    slug: 'yatra', rewards: [
      { kind: 'coins', coins: 5, trigger: { on: 'milestone', milestoneKey: 'm1' } },
      { kind: 'badge', badgeSlug: 'pilgrim', trigger: { on: 'milestone', milestoneKey: 'm1' } },
      { kind: 'coins', coins: 100, trigger: { on: 'event' } },
      { kind: 'certificate', trigger: { on: 'event' } },
    ],
  };
  test('milestone: own coins get the base key, each coin reward its index; badges listed; certificates ignored', () => {
    const p = planMilestone(ev, { key: 'm1', coins: 10 }, 'u1');
    assert.deepEqual(p.credits, [{ key: 'event-ms:yatra:m1:u1', amount: 10 }, { key: 'event-ms:yatra:m1:u1:0', amount: 5 }]);
    assert.deepEqual(p.badgeSlugs, ['pilgrim']);
    assert.equal(p.coinsKey, 'event-ms:yatra:m1:u1');
    assert.deepEqual(planMilestone(ev, { key: 'm2', coins: 0 }, 'u1').credits, []);
  });
  test('event: one coin reward = the base key; several = key:<rewardIndex>', () => {
    assert.deepEqual(planEvent(ev, 'u1').credits, [{ key: 'event-done:yatra:u1', amount: 100 }]);
    const two = { slug: 'y', rewards: [{ kind: 'coins', coins: 1, trigger: { on: 'event' } }, { kind: 'badge', badgeSlug: 'b', trigger: { on: 'event' } }, { kind: 'coins', coins: 2, trigger: { on: 'event' } }] };
    assert.deepEqual(planEvent(two, 'u1').credits, [{ key: 'event-done:y:u1:0', amount: 1 }, { key: 'event-done:y:u1:2', amount: 2 }]);
    assert.deepEqual(planEvent(two, 'u1').badgeSlugs, ['b']);
  });
});
