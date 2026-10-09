/**
 * Pure Home logic: shelf dispatch/filtering, schedule windows, flag hiding, href
 * resolution, HTML rewriting and navigation policy, slides, featured pooja,
 * next seva, panchang summary, greeting, search.
 *
 *   node --test src/features/home/lib/home-lib.test.mjs
 *
 * Transpiles the .ts with the project's TypeScript, like i18n.test.mjs.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const here = path.dirname(fileURLToPath(import.meta.url));

function load(file, cache = new Map()) {
  const abs = path.resolve(file);
  if (cache.has(abs)) return cache.get(abs).exports;
  const out = ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  cache.set(abs, mod);
  const req = (spec) => {
    if (!spec.startsWith('.')) throw new Error(`unexpected import ${spec} in ${abs}`);
    return load(path.resolve(path.dirname(abs), `${spec}.ts`), cache);
  };
  new Function('exports', 'require', 'module', out)(mod.exports, req, mod);
  return mod.exports;
}

const { inWindow } = load(path.join(here, 'schedule.ts'));
const { resolveHref } = load(path.join(here, 'href.ts'));
const { pick } = load(path.join(here, 'pick.ts'));
const { renderableSections, shelfSections, visibleItems, chunk } = load(path.join(here, 'sections.ts'));
const { rewriteUploads, wrapHtml, classifyNavigation, originOf } = load(path.join(here, 'html.ts'));
const { DEFAULT_SECTIONS } = load(path.join(here, '..', 'constants', 'default-layout.ts'));
const { visibleSlides, toSlides } = load(path.join(here, 'slides.ts'));
const { daysUntil } = load(path.join(here, 'days.ts'));
const { pickFeaturedPooja } = load(path.join(here, 'featured.ts'));
const { pickNextSeva } = load(path.join(here, 'next-seva.ts'));
const { summarisePanchang } = load(path.join(here, 'panchang-summary.ts'));
const { firstName, avatarInitial } = load(path.join(here, 'greeting.ts'));
const { searchPath } = load(path.join(here, 'search.ts'));
const { deityForWeekday } = load(path.join(here, 'weekday-deity.ts'));
const { toneFor } = load(path.join(here, 'tones.ts'));

const NOW = Date.parse('2026-10-08T10:00:00Z');

test('inWindow: open ends, before start, after end', () => {
  assert.equal(inWindow(null, null, NOW), true);
  assert.equal(inWindow('2026-10-09T00:00:00Z', null, NOW), false);
  assert.equal(inWindow('2026-10-01T00:00:00Z', '2026-10-07T00:00:00Z', NOW), false);
  assert.equal(inWindow('2026-10-01T00:00:00Z', '2026-10-09T00:00:00Z', NOW), true);
  assert.equal(inWindow('garbage', undefined, NOW), true);
});

test('resolveHref: routes, bhakti://, https, and refusals', () => {
  assert.deepEqual(resolveHref('/pooja/x'), { kind: 'route', path: '/pooja/x' });
  assert.deepEqual(resolveHref('bhakti://pooja/x'), { kind: 'route', path: '/pooja/x' });
  assert.deepEqual(resolveHref('bhakti:///alarm'), { kind: 'route', path: '/alarm' });
  assert.deepEqual(resolveHref('https://a.b/c'), { kind: 'external', url: 'https://a.b/c' });
  for (const bad of ['http://a.b', 'javascript:alert(1)', '//evil.com/x', 'data:text/html,x', 'pooja', '', 'bhakti://', null, undefined]) {
    assert.equal(resolveHref(bad), null, String(bad));
  }
});

test('pick: Hindi twin only when reading Hindi and non-empty', () => {
  assert.equal(pick(true, 'Hello', 'नमस्ते'), 'नमस्ते');
  assert.equal(pick(true, 'Hello', '  '), 'Hello');
  assert.equal(pick(false, 'Hello', 'नमस्ते'), 'Hello');
  assert.equal(pick(true, undefined, undefined), '');
});

test('visibleItems: hides only a known-off flag', () => {
  const items = [{ title: 'a', flag: 'liveDarshan' }, { title: 'b', flag: 'unknownKey' }, { title: 'c' }];
  assert.deepEqual(visibleItems(items, { liveDarshan: false }).map((i) => i.title), ['b', 'c']);
  assert.deepEqual(visibleItems(items, { liveDarshan: true }).map((i) => i.title), ['a', 'b', 'c']);
});

test('renderableSections: order, schedule, disabled, empty sections', () => {
  const sections = [
    { key: 'c', source: 'custom', layout: 'book2', order: 30, items: [{ title: 'x', flag: 'bhajan' }] },
    { key: 'a', source: 'hero', order: 10 },
    { key: 'expired', source: 'festivals', order: 15, endsAt: '2026-10-01T00:00:00Z' },
    { key: 'off', source: 'darshan', order: 16, enabled: false },
    { key: 'empty', source: 'daily', order: 20, items: [] },
    { key: 'future', source: 'custom', order: 40, startsAt: '2026-11-01T00:00:00Z', items: [{ title: 'y' }] },
  ];
  assert.deepEqual(renderableSections(sections, {}, NOW).map((s) => s.key), ['a', 'c']);
  assert.deepEqual(renderableSections(sections, { bhajan: false }, NOW).map((s) => s.key), ['a']);
});

test('shelfSections: skips every source the fixed layout renders itself', () => {
  const sources = ['hero', 'astrologer', 'grid', 'festivals', 'daily', 'temples', 'features', 'darshan', 'custom', 'knowledge'];
  const out = shelfSections(sources.map((source) => ({ key: source, source })));
  assert.deepEqual(out.map((s) => s.source), ['custom', 'knowledge']);
});

test('default layout: shelves are the four seeded keys, in order, and honour schedule', () => {
  const keysAt = (d) => shelfSections(renderableSections(DEFAULT_SECTIONS, {}, d)).map((s) => s.key);
  assert.deepEqual(keysAt(new Date('2026-10-05T06:00:00Z')), ['pitru-paksha', 'books', 'knowledge', 'ancestors']);
  // The two seasonal shelves switch themselves off after Pitru Paksha.
  assert.deepEqual(keysAt(new Date('2026-12-01T06:00:00Z')), ['books', 'knowledge']);
  const books = DEFAULT_SECTIONS.find((s) => s.key === 'books');
  assert.equal(books.layout, 'book2');
  assert.equal(books.tone, 'gold');
});

test('chunk', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 3), [[1, 2, 3], [4, 5]]);
  assert.deepEqual(chunk([], 3), []);
});

test('rewriteUploads: only src attributes starting /uploads/', () => {
  const html = `<img src="/uploads/a.jpg"><img SRC='/uploads/b.png'><a href="/uploads/c">x</a><img src="https://x/y.png">`;
  const out = rewriteUploads(html, 'https://api.test/');
  assert.match(out, /src="https:\/\/api\.test\/uploads\/a\.jpg"/);
  assert.match(out, /SRC='https:\/\/api\.test\/uploads\/b\.png'/);
  assert.match(out, /href="\/uploads\/c"/);
  assert.match(out, /src="https:\/\/x\/y\.png"/);
});

test('wrapHtml: restrictive CSP with the API origin', () => {
  const doc = wrapHtml('<p>hi</p>', 'http://127.0.0.1:4000');
  assert.match(doc, /default-src 'none'; img-src https: http:\/\/127\.0\.0\.1:4000; style-src 'unsafe-inline'/);
  assert.match(doc, /<body><p>hi<\/p><\/body>/);
  assert.equal(originOf('https://api.test/x/y'), 'https://api.test');
  assert.equal(originOf('nonsense'), '');
});

test('classifyNavigation: only about:blank loads; bhakti/https are handed off', () => {
  assert.equal(classifyNavigation('about:blank'), 'load');
  assert.equal(classifyNavigation('bhakti://pooja'), 'route');
  assert.equal(classifyNavigation('https://a.b'), 'external');
  for (const u of ['http://a.b', 'javascript:1', 'data:text/html,x', 'file:///etc/passwd', 'intent://x']) {
    assert.equal(classifyNavigation(u), 'block', u);
  }
});

test('visibleSlides: enabled, window and language audience', () => {
  const rows = [
    { slug: 'all', title: 'a' },
    { slug: 'hi', title: 'b', language: 'hi' },
    { slug: 'en', title: 'c', language: 'en' },
    { slug: 'off', title: 'd', enabled: false },
    { slug: 'old', title: 'e', endsAt: '2026-10-01T00:00:00Z' },
    { slug: 'soon', title: 'f', startsAt: '2026-11-01T00:00:00Z' },
  ];
  assert.deepEqual(visibleSlides(rows, 'hi', NOW).map((s) => s.slug), ['all', 'hi']);
  assert.deepEqual(visibleSlides(rows, 'en', NOW).map((s) => s.slug), ['all', 'en']);
});

test('toSlides: Hindi twins, cta, href, and drops empty cards', () => {
  const finish = { image: (u) => (u ? `https://h${u}` : undefined), html: (h) => `W(${h})` };
  const rows = [
    { slug: 'a', title: 'Navratri', titleHi: 'नवरात्रि', tag: '9 nights', ctaLabel: 'Book', href: '/pooja/x', image: '/u/a.jpg' },
    { slug: 'blank' },
    { slug: 'h', kind: 'html', title: 't', html: '<b>x</b>' },
  ];
  const en = toSlides(rows, false, finish);
  assert.equal(en.length, 2);
  assert.deepEqual([en[0].title, en[0].tag, en[0].cta, en[0].href, en[0].image], ['Navratri', '9 nights', 'Book', '/pooja/x', 'https://h/u/a.jpg']);
  assert.equal(en[1].kind, 'html');
  assert.equal(en[1].html, 'W(<b>x</b>)');
  assert.equal(toSlides(rows, true, finish)[0].title, 'नवरात्रि');
});

test('daysUntil: local calendar days', () => {
  const now = new Date(2026, 9, 8, 23, 30).getTime();
  assert.equal(daysUntil('2026-10-08', now), 0);
  assert.equal(daysUntil('2026-10-11', now), 3);
  assert.equal(daysUntil('2026-10-07', now), -1);
  assert.equal(daysUntil(null, now), null);
  assert.equal(daysUntil('nope', now), null);
});

test('pickFeaturedPooja: nearest dated festival pooja inside the window', () => {
  const now = new Date(2026, 9, 8, 10).getTime();
  const p = (slug, poojaDate, festivalName = 'F') => ({ slug, poojaDate, festivalName, festivalSlug: festivalName ? 'f' : '' });
  const list = [p('every', null), p('past', '2026-10-01'), p('nofest', '2026-10-09', ''), p('far', '2026-12-30'), p('b', '2026-10-15'), p('a', '2026-10-11')];
  assert.deepEqual(pickFeaturedPooja(list, now).pooja.slug, 'a');
  assert.equal(pickFeaturedPooja(list, now).days, 3);
  assert.equal(pickFeaturedPooja([p('x', null)], now), null);
  assert.equal(pickFeaturedPooja([], now), null);
});

test('pickNextSeva: live dated bookings only, soonest first', () => {
  const now = new Date(2026, 9, 8, 10).getTime();
  const b = (id, status, poojaDate) => ({ id, status, poojaDate });
  const list = [b('c', 'cancelled', '2026-10-09'), b('p', 'performed', '2026-10-09'), b('d', 'booked', null), b('x', 'booked', '2026-10-20'), b('y', 'sankalp', '2026-10-10'), b('old', 'booked', '2026-10-01')];
  assert.equal(pickNextSeva(list, now).booking.id, 'y');
  assert.equal(pickNextSeva([b('c', 'cancelled', '2026-10-09')], now), null);
});

test('summarisePanchang: omits what cannot be computed', () => {
  const at = (h, m) => new Date(2026, 9, 8, h, m);
  const full = {
    tithi: 'Trayodashi', tithiHi: 'त्रयोदशी', nakshatra: 'Hasta', nakshatraHi: 'हस्त',
    sunrise: at(6, 14), sunset: at(17, 58), rahuKaal: { start: at(13, 30), end: at(15, 0) },
  };
  assert.deepEqual(summarisePanchang(full, false).map((c) => [c.key, c.value]), [
    ['tithi', 'Trayodashi'], ['nakshatra', 'Hasta'], ['sun', '06:14 · 17:58'], ['rahu', '13:30 – 15:00'],
  ]);
  assert.equal(summarisePanchang(full, true)[0].value, 'त्रयोदशी');
  const gaps = { ...full, nakshatra: '', nakshatraHi: '', sunrise: null, rahuKaal: null };
  assert.deepEqual(summarisePanchang(gaps, false).map((c) => c.key), ['tithi']);
});

test('greeting, search, weekday deity, tones', () => {
  assert.equal(firstName('  coco  demon '), 'coco');
  assert.equal(firstName(undefined), '');
  assert.equal(avatarInitial('coco demon'), 'C');
  assert.equal(avatarInitial(''), 'ॐ');
  assert.equal(searchPath('  shani '), '/poojas?q=shani');
  assert.equal(searchPath('a b&c'), '/poojas?q=a%20b%26c');
  assert.equal(searchPath('  '), '/poojas');
  const ds = [{ id: 'shiva' }, { id: 'shani' }];
  assert.equal(deityForWeekday(ds, 6).id, 'shani');
  assert.equal(deityForWeekday(ds, 4).id, 'shiva');
  assert.deepEqual(toneFor('x', false), toneFor('x', false));
  assert.notDeepEqual(toneFor('x', false), toneFor('x', true));
});
