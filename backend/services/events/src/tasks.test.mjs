// Pure unit tests (no database): the task-kind registry and derived status.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { deriveStatus, effectiveEnd } from './events/status.js';
import { TASK_KINDS, getKind, listKinds } from './tasks/index.js';
import counter, { MAX_ADD, MIN_ADD_INTERVAL_MS } from './tasks/counter.js';

const NINE = ['self_mark', 'counter', 'live_darshan', 'bhajan_listened', 'chadhava_offered', 'pooja_booked', 'location', 'qr_checkin', 'photo'];

describe('task-kind registry', () => {
  test('lists all nine kinds from the contract', () => {
    assert.deepEqual(Object.keys(TASK_KINDS).sort(), [...NINE].sort());
    assert.equal(getKind('nope'), null);
    assert.equal(getKind('__proto__'), null);
  });

  test('every kind has the full module shape and a JSON-only listing', () => {
    for (const k of NINE) {
      const m = getKind(k);
      for (const fn of ['validate', 'evaluate', 'summary']) assert.equal(typeof m[fn], 'function', `${k}.${fn}`);
      assert.match(m.minAppVersion, /^\d+\.\d+\.\d+$/);
      assert.ok(Array.isArray(m.signals));
      assert.equal(m.configSchema.type, 'object');
      assert.equal(typeof m.title, 'string');
    }
    const listing = listKinds();
    assert.equal(listing.length, 9);
    assert.ok(listing.every((l) => !('validate' in l) && 'interactive' in l && 'configSchema' in l && 'signals' in l));
    assert.deepEqual(JSON.parse(JSON.stringify(listing)), listing);
    assert.deepEqual(getKind('chadhava_offered').signals, ['chadhava.offered']);
    assert.deepEqual(getKind('pooja_booked').signals, ['pooja.booked']);
  });

  test('validate normalises config, reports field errors and returns catalog refs', () => {
    assert.deepEqual(getKind('counter').validate({ label: ' Om ', target: '108' }).config, { label: 'Om', target: 108 });
    assert.equal(getKind('counter').validate({ target: 0 }).errors[0].field, 'target');
    assert.equal(getKind('counter').validate({}).errors.length, 1);
    const live = getKind('live_darshan').validate({ streamSlug: 'kashi', minutes: 10 });
    assert.deepEqual(live.refs, [{ type: 'stream', slug: 'kashi', field: 'streamSlug' }]);
    assert.equal(getKind('live_darshan').validate({ streamSlug: 'Bad Slug!', minutes: 10 }).errors[0].field, 'streamSlug');
    assert.equal(getKind('location').validate({ lat: 91, lng: 0, radiusM: 100 }).errors[0].field, 'lat');
    assert.equal(getKind('location').validate({ lat: 1, lng: 2, radiusM: 5, name: 'A' }).errors[0].field, 'radiusM');
    assert.deepEqual(getKind('photo').validate({}).config, { needsApproval: true });
    assert.equal(getKind('pooja_booked').validate({ poojaSlug: 'x' }).refs[0].type, 'pooja');
    assert.equal(getKind('chadhava_offered').validate({}).errors.length, 1);
    assert.equal(getKind('bhajan_listened').validate({ aartiSlug: 'a', minutes: 3 }).refs[0].type, 'aarti');
  });

  test('summary is localised', () => {
    const c = { label: '', target: 108 };
    assert.match(getKind('counter').summary(c, 'en'), /108/);
    assert.notEqual(getKind('self_mark').summary({}, 'en'), getKind('self_mark').summary({}, 'hi'));
  });

  test('self_mark, counter and location evaluate; the other six say "not implemented"', () => {
    assert.equal(getKind('self_mark').evaluate({}, {}, {}).done, true);
    for (const k of NINE.filter((x) => !['self_mark', 'counter', 'location'].includes(x))) {
      assert.throws(() => getKind(k).evaluate({}, {}, {}), /not implemented/, k);
    }
  });
});

describe('counter.evaluate', () => {
  const ctx = (now = 1_000_000) => ({ config: { target: 20 }, now });
  test('add accumulates, is resumable via set, and is done at the target', () => {
    let r = counter.evaluate({}, { add: 5 }, ctx());
    assert.deepEqual([r.state.count, r.done], [5, false]);
    r = counter.evaluate(r.state, { set: 3 }, ctx(1_000_100)); // never lowers
    assert.equal(r.state.count, 5);
    r = counter.evaluate(r.state, { set: 9 }, ctx(1_000_200));
    assert.equal(r.state.count, 9);
    r = counter.evaluate(r.state, { add: 9 }, ctx(9_000_000));
    assert.equal(r.state.count, 18);
    r = counter.evaluate(r.state, { add: 9 }, ctx(9_100_000));
    assert.deepEqual([r.state.count, r.done], [20, true]); // clamped
    assert.equal(r.how.en, 'Counted 20');
  });
  test('rate cap: an add within 400 ms of the last accepted one changes nothing; a set is never rate-capped', () => {
    const big = (now) => ({ config: { target: 1000 }, now });
    const first = counter.evaluate({}, { add: 5 }, big(1_000_000));
    assert.equal(first.state.count, 5);
    const fast = counter.evaluate(first.state, { add: 1 }, big(1_000_000 + MIN_ADD_INTERVAL_MS - 1));
    assert.equal(fast.tooFast, true);
    assert.equal(fast.state.count, 5);
    const ok = counter.evaluate(first.state, { add: MAX_ADD }, big(1_000_000 + MIN_ADD_INTERVAL_MS));
    assert.equal(ok.state.count, 5 + MAX_ADD);
    assert.equal(counter.evaluate(first.state, { set: 50 }, big(1_000_001)).state.count, 50);
  });
  test('garbage reports are flagged invalid', () => {
    assert.equal(counter.evaluate({}, { add: -1 }, ctx()).invalid, true);
    assert.equal(counter.evaluate({}, {}, ctx()).invalid, true);
    assert.equal(counter.evaluate({}, { add: MAX_ADD + 1 }, ctx()).invalid, true);
    assert.equal(counter.evaluate({}, { add: 1.5 }, ctx()).invalid, true);
    assert.equal(counter.evaluate({}, { set: -3 }, ctx()).invalid, true);
  });
});

describe('deriveStatus', () => {
  const t = (s) => new Date(s);
  const ev = (o) => ({ published: true, schedule: { mode: 'multiday', startsAt: t('2026-03-10T00:00:00Z'), endsAt: t('2026-03-12T00:00:00Z') }, ...o });
  test('draft, scheduled, live, ended', () => {
    assert.equal(deriveStatus(ev({ published: false }), t('2026-03-11T00:00:00Z')), 'draft');
    assert.equal(deriveStatus(ev(), t('2026-03-01T00:00:00Z')), 'scheduled');
    assert.equal(deriveStatus(ev(), t('2026-03-11T00:00:00Z')), 'live');
    assert.equal(deriveStatus(ev(), t('2026-03-12T00:00:00Z')), 'ended');
  });
  test('registration_open needs the block, an open window, room, and a not-yet-started event', () => {
    const reg = { mode: 'free', capacity: 2, opensAt: t('2026-03-02T00:00:00Z'), closesAt: t('2026-03-09T00:00:00Z') };
    const e = ev({ registration: reg });
    assert.equal(deriveStatus(e, t('2026-03-01T00:00:00Z')), 'scheduled'); // window not open yet
    assert.equal(deriveStatus(e, t('2026-03-05T00:00:00Z')), 'registration_open');
    assert.equal(deriveStatus(e, t('2026-03-05T00:00:00Z'), { registered: 2 }), 'scheduled'); // full
    assert.equal(deriveStatus(e, t('2026-03-05T00:00:00Z'), { registered: null }), 'registration_open'); // unknown is not full
    assert.equal(deriveStatus(e, t('2026-03-10T12:00:00Z')), 'live');
    assert.equal(deriveStatus(ev({ registration: { mode: 'none' } }), t('2026-03-05T00:00:00Z')), 'scheduled');
  });
  test('always is live while published; single without an end closes at the end of its IST day', () => {
    assert.equal(deriveStatus({ published: true, schedule: { mode: 'always' } }, t('2030-01-01T00:00:00Z')), 'live');
    const single = { published: true, schedule: { mode: 'single', startsAt: t('2026-03-10T13:00:00Z'), endsAt: null } };
    assert.equal(new Date(effectiveEnd(single.schedule)).toISOString(), '2026-03-10T18:30:00.000Z');
    assert.equal(deriveStatus(single, t('2026-03-10T18:00:00Z')), 'live');
    assert.equal(deriveStatus(single, t('2026-03-10T18:30:00Z')), 'ended');
  });
});
