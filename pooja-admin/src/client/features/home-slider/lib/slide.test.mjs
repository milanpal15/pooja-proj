import assert from 'node:assert/strict';
import { test } from 'node:test';

import { blankSlide, draftFrom, isHttpsUrl, newSlug, scheduleLabel, slideStatus, targetLabel, toBody, validateSlide } from './slide.js';

const ok = (over) => ({ ...blankSlide(), title: 'Navratri', type: 'pooja', ref: 'durga', ...over });

test('title is required and every field has its limit', () => {
  assert.equal(validateSlide(ok({ title: '  ' })).title, 'A title is required.');
  assert.deepEqual(validateSlide(ok()), {});
  assert.deepEqual(validateSlide(ok({ title: 'x'.repeat(80), tag: 'y'.repeat(24), subtitle: 'z'.repeat(120), ctaLabel: 'b'.repeat(24) })), {});
  const e = validateSlide(ok({ title: 'x'.repeat(81), tag: 'y'.repeat(25), subtitle: 'z'.repeat(121), ctaLabel: 'b'.repeat(25), tagHi: 'y'.repeat(25) }));
  assert.deepEqual(Object.keys(e).sort(), ['ctaLabel', 'subtitle', 'tag', 'tagHi', 'title']);
});

test('ref is required for pooja, chadhava, temple and link only', () => {
  for (const type of ['pooja', 'chadhava', 'temple', 'link']) assert.ok(validateSlide(ok({ type, ref: '' })).ref, type);
  for (const type of ['bhajan', 'astrologer', 'coins', 'none']) assert.deepEqual(validateSlide(ok({ type, ref: '' })), {}, type);
});

test('links are https only', () => {
  assert.equal(isHttpsUrl('https://example.com/offer?a=1'), true);
  for (const bad of ['http://example.com', 'javascript:alert(1)', 'example.com', '/pooja', 'https://', 'https://a b.com', '']) assert.equal(isHttpsUrl(bad), false, bad);
  assert.ok(validateSlide(ok({ type: 'link', ref: 'http://x.com' })).ref);
  assert.deepEqual(validateSlide(ok({ type: 'link', ref: 'https://x.com' })), {});
});

test('an end before the start is refused', () => {
  assert.ok(validateSlide(ok({ start: '2026-10-10', end: '2026-10-09' })).end);
  assert.deepEqual(validateSlide(ok({ start: '2026-10-10', end: '2026-10-10' })), {});
});

const now = new Date('2026-10-08T10:00:00Z');
test('status: off beats everything; then upcoming, ended, live', () => {
  assert.equal(slideStatus({ enabled: false }, now).key, 'off');
  assert.equal(slideStatus({ enabled: true }, now).label, 'Live');
  assert.equal(slideStatus({ enabled: true, startsAt: '2026-10-20T00:00:00Z' }, now).key, 'upcoming');
  assert.match(slideStatus({ enabled: true, startsAt: '2026-10-20T00:00:00Z' }, now).label, /^Starts 20 Oct/);
  assert.equal(slideStatus({ enabled: true, endsAt: '2026-10-01T00:00:00Z' }, now).key, 'ended');
  assert.equal(slideStatus({ enabled: true, startsAt: '2026-10-05T00:00:00Z', endsAt: '2026-10-19T00:00:00Z' }, now).key, 'live');
  assert.equal(slideStatus({}, now).key, 'live', 'enabled defaults on');
});

test('schedule label', () => {
  assert.equal(scheduleLabel({}), 'Always');
  assert.match(scheduleLabel({ startsAt: '2026-10-05T12:00:00Z' }), /^From 5 Oct/);
  assert.match(scheduleLabel({ endsAt: '2026-10-19T12:00:00Z' }), /^Until 19 Oct/);
  assert.match(scheduleLabel({ startsAt: '2026-10-05T12:00:00Z', endsAt: '2026-10-19T12:00:00Z' }), /^5 Oct – 19 Oct/);
});

test('target label uses names, falls back to the slug, and covers every type', () => {
  const names = { poojas: { durga: 'Navratri Maha Durga' }, listings: { lakshmi: 'Lakshmi Pooja' }, temples: { kashi: 'Kashi Vishwanath' } };
  assert.equal(targetLabel({ type: 'pooja', ref: 'durga' }, names), 'Pooja · Navratri Maha Durga');
  assert.equal(targetLabel({ type: 'pooja', ref: 'gone' }, names), 'Pooja · gone');
  assert.equal(targetLabel({ type: 'chadhava', ref: 'lakshmi' }, names), 'Chadhava · Lakshmi Pooja');
  assert.equal(targetLabel({ type: 'temple', ref: 'kashi' }, names), 'Temple · Kashi Vishwanath');
  assert.equal(targetLabel({ type: 'astrologer' }), 'Astrologer list');
  assert.equal(targetLabel({ type: 'coins' }), 'Add coins');
  assert.equal(targetLabel({ type: 'bhajan' }), 'Bhajan');
  assert.equal(targetLabel({ type: 'link', ref: 'https://example.com/x' }), 'Web link · example.com');
  assert.equal(targetLabel({ type: 'none' }), 'Nothing');
  assert.equal(targetLabel(undefined, {}, '/darshan'), 'Route · /darshan');
});

test('body: trimmed, dates become whole local days, ref dropped when unused', () => {
  const b = toBody(ok({ title: ' Hi ', type: 'coins', ref: 'stale', start: '2026-10-05', end: '2026-10-19', language: 'hi' }), { slug: 's-1', order: 30 });
  assert.equal(b.title, 'Hi');
  assert.deepEqual(b.target, { type: 'coins', ref: '' });
  assert.equal(b.kind, undefined, 'kind is left to the server on edit');
  assert.equal(b.slug, 's-1');
  assert.equal(b.order, 30);
  assert.equal(b.language, 'hi');
  assert.ok(new Date(b.endsAt) > new Date(b.startsAt));
  assert.equal(toBody(ok()).startsAt, null);
});

test('draftFrom round-trips a stored slide', () => {
  const d = draftFrom({ title: 'A', target: { type: 'temple', ref: 'kashi' }, language: 'en', startsAt: null, endsAt: null, enabled: false });
  assert.equal(d.type, 'temple');
  assert.equal(d.ref, 'kashi');
  assert.equal(d.enabled, false);
  assert.equal(d.start, '');
  assert.equal(draftFrom({ title: 'old' }).type, 'none', 'a legacy slide with no target');
});

test('slug is lowercase, dashed and random-suffixed', () => {
  assert.equal(newSlug('Navratri Maha Durga Pooja!', () => 0.123456), 'navratri-maha-durga-pooja-4fzy'.replace(/-[a-z0-9]{4}$/, `-${(0.123456).toString(36).slice(2, 6)}`));
  assert.match(newSlug('', () => 0.5), /^slide-[a-z0-9]{4}$/);
});
