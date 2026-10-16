import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PRESETS, badgeActive, badgePill, layoutLive, matchesAudience, personaLabel, presetOf, samePersona, scheduleLabel, scheduleState, servedLayout, shortDate, visibility, windowLabel } from './audience.js';
import { normaliseRegistry } from './registry.js';

const REG = normaliseRegistry(null); // the closed list of four segments
const KNOWN = REG.audiences.map((a) => a.key);
const NOW = Date.parse('2026-10-16T06:00:00Z'); // 16 Oct 2026, 11:30 IST
const L = (id, extra = {}) => ({ id, name: id, enabled: true, audience: [], startsAt: null, endsAt: null, blocks: [], ...extra });
const p = (segments = [], lang = 'en') => ({ lang, segments });

test('the four segments, closed', () => {
  assert.deepEqual(KNOWN, ['new_user', 'has_booking', 'in_event', 'lapsed']);
});

test('audience: empty = everyone, any-of, unknown matches nobody', () => {
  assert.equal(matchesAudience([], p(), KNOWN), true);
  assert.equal(matchesAudience(undefined, p(), KNOWN), true);
  assert.equal(matchesAudience(['has_booking'], p(), KNOWN), false);
  assert.equal(matchesAudience(['has_booking'], p(['has_booking']), KNOWN), true);
  for (const seg of KNOWN) assert.equal(matchesAudience([seg], p([seg]), KNOWN), true, seg);
  for (const seg of KNOWN) assert.equal(matchesAudience([seg], p(KNOWN.filter((k) => k !== seg)), KNOWN), false, `${seg}: other segments do not match it`);
  assert.equal(matchesAudience(['new_user', 'lapsed'], p(['lapsed']), KNOWN), true, 'any-of');
  assert.equal(matchesAudience(['new_user', 'lapsed'], p(['in_event']), KNOWN), false);
  assert.equal(matchesAudience(['from_the_future'], p(['from_the_future']), KNOWN), false, 'an unknown segment never matches, even if the persona claims it');
  assert.equal(matchesAudience(['from_the_future', 'new_user'], p(['new_user']), KNOWN), true);
});

test('schedule: before, inside, after; open-ended', () => {
  assert.equal(scheduleState({ startsAt: '2026-10-17T00:00:00Z' }, NOW), 'scheduled');
  assert.equal(scheduleState({ endsAt: '2026-10-15T00:00:00Z' }, NOW), 'ended');
  assert.equal(scheduleState({ startsAt: '2026-10-10T00:00:00Z', endsAt: '2026-10-20T00:00:00Z' }, NOW), '');
  assert.equal(scheduleState({}, NOW), '');
  assert.equal(scheduleState({ endsAt: '2026-10-16T06:00:00Z' }, NOW), 'ended', 'the end instant itself is outside');
});

test('visibility of a block for a persona', () => {
  const b = { enabled: true, audience: [], language: 'all' };
  const ctx = (persona, lang = 'en') => ({ now: NOW, lang, persona, known: KNOWN });
  assert.equal(visibility(b, ctx(p())), '');
  assert.equal(visibility({ ...b, enabled: false }, ctx(p())), 'disabled');
  assert.equal(visibility({ ...b, audience: ['has_booking'] }, ctx(p())), 'audience');
  assert.equal(visibility({ ...b, audience: ['has_booking'] }, ctx(p(['has_booking']))), '');
  assert.equal(visibility({ ...b, language: 'hi' }, ctx(p(), 'en')), 'language');
  assert.equal(visibility({ ...b, language: 'hi' }, ctx(p([], 'hi'), 'hi')), '');
  assert.equal(visibility({ ...b, startsAt: '2026-10-29T00:00:00Z' }, ctx(p())), 'scheduled');
  assert.equal(visibility({ ...b, enabled: false, audience: ['x'] }, ctx(p())), 'disabled', 'switched off wins');
});

test('which layout a persona is served', () => {
  const doc = { layouts: [
    L('new-users', { audience: ['new_user'] }),
    L('navratri', { startsAt: '2026-10-10T00:00:00Z', endsAt: '2026-10-19T00:00:00Z', audience: ['has_booking'] }),
    L('diwali', { startsAt: '2026-10-29T00:00:00Z' }),
    L('off', { enabled: false }),
    L('default'),
  ] };
  const serve = (persona) => servedLayout(doc, persona, NOW, KNOWN).id;
  assert.equal(serve(p()), 'default', 'nothing matches: the fallback');
  assert.equal(serve(p(['new_user'])), 'new-users');
  assert.equal(serve(p(['has_booking'])), 'navratri', 'live now and for them');
  assert.equal(serve(p(['new_user', 'has_booking'])), 'new-users', 'priority order: the first match wins');
  assert.equal(serve(p(['lapsed'])), 'default');
  assert.equal(servedLayout(doc, p(['has_booking']), Date.parse('2026-10-25T00:00:00Z'), KNOWN).id, 'default', 'Navratri has ended');
  assert.equal(servedLayout(doc, p(), Date.parse('2026-11-01T00:00:00Z'), KNOWN).id, 'diwali', 'Diwali has begun and is for everyone');
  assert.equal(servedLayout({ layouts: [L('x', { audience: ['future'] }), L('default')] }, p(['future']), NOW, KNOWN).id, 'default', 'an unknown audience hides the layout');
  assert.equal(layoutLive(L('a', { enabled: false }), NOW), false);
  assert.equal(layoutLive(L('a', { startsAt: '2026-10-10T00:00:00Z' }), NOW), true);
});

test('presets, custom personas and their labels', () => {
  assert.equal(PRESETS.length, 3);
  assert.equal(presetOf(p(['has_booking'], 'hi')).label, 'Hindi · has bookings');
  assert.equal(presetOf(p(['has_booking', 'lapsed'], 'hi')), null);
  assert.equal(samePersona(p(['a', 'b']), p(['b', 'a'])), true);
  assert.equal(personaLabel(p(['has_booking', 'lapsed'], 'hi'), REG), 'Hindi · has a booking + hasn\'t opened in 14 days');
  assert.equal(personaLabel(p(), REG), 'English · everyone');
  assert.equal(personaLabel(p(['new_user']), REG), 'English · new users');
});

test('schedule labels, India time', () => {
  assert.equal(shortDate('2026-10-31T18:29:00.000Z'), '31 Oct');
  assert.equal(shortDate('2026-10-31T18:31:00.000Z'), '1 Nov', 'a minute after IST midnight is the next day');
  assert.equal(windowLabel({ startsAt: '2026-10-10T18:30:00.000Z', endsAt: '2026-10-19T18:29:00.000Z' }), '11–19 Oct');
  assert.equal(windowLabel({ startsAt: '2026-10-28T18:30:00.000Z', endsAt: '2026-11-03T18:29:00.000Z' }), '29 Oct–3 Nov');
  assert.equal(windowLabel({ startsAt: '2026-10-28T18:30:00.000Z' }), 'from 29 Oct');
  assert.equal(windowLabel({ endsAt: '2026-11-03T18:29:00.000Z' }), 'until 3 Nov');
  assert.equal(windowLabel({}), '');
  const nav = L('n', { startsAt: '2026-10-10T18:30:00.000Z', endsAt: '2026-10-19T18:29:00.000Z' });
  assert.equal(scheduleLabel(nav, NOW), 'live 11–19 Oct');
  assert.equal(scheduleLabel(nav, Date.parse('2026-10-25T00:00:00Z')), '11–19 Oct', 'no "live" once it has ended');
  assert.equal(scheduleLabel(L('d', { startsAt: '2026-10-28T18:30:00.000Z' }), NOW), 'from 29 Oct');
  assert.equal(scheduleLabel(L('x'), NOW), '');
});

test('badge expiry: the badge goes, the tile stays', () => {
  const it = { badge: 'new', badgeUntil: '2026-10-31T18:29:00.000Z' };
  assert.equal(badgeActive(it, NOW), true);
  assert.equal(badgeActive(it, Date.parse('2026-11-01T00:00:00Z')), false);
  assert.equal(badgeActive({ badge: 'new' }, NOW), true, 'no end date: shown for ever');
  assert.equal(badgeActive({ badge: '', badgeUntil: '2027-01-01T00:00:00Z' }, NOW), false);
  assert.deepEqual(badgePill(it, NOW), { text: 'NEW · until 31 Oct', expired: false });
  assert.deepEqual(badgePill(it, Date.parse('2026-11-05T00:00:00Z')), { text: 'NEW · ended 31 Oct', expired: true });
  assert.deepEqual(badgePill({ badge: 'soon' }, NOW), { text: 'SOON', expired: false });
  assert.equal(badgePill({ badge: '' }, NOW), null);
});
