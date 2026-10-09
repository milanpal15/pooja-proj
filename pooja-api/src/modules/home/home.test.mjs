import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { HeroSlide, HomeSection } from '../../models.js';
import { content } from '../content/index.js';
import { publicContent } from '../public/public.routes.js';
import { boot } from '../test-kit.mjs';
import { sanitizeHtmlFragment } from './html-sanitizer.js';
import * as home from './index.js';

let h;
const HOUR = 3_600_000;
const at = (hours) => new Date(Date.now() + hours * HOUR).toISOString();

before(async () => {
  h = await boot(home, 'home_tests', { mount: (app) => { app.use('/api', publicContent); app.use('/api/content', content); } });
  await home.seed();
  await home.seed(); // idempotent
});
after(() => h.stop());

/* ─────────────────────────────────────────────────────────────── sanitiser ── */
test('sanitiser strips script, iframe, handlers, javascript:/data: URLs and style url()', () => {
  const dirty = '<div onclick="x()" style="color:red;background-color:url(http://e/x);position:fixed;padding:4px">hi'
    + '<script>alert(1)</script><iframe src="https://e.com"></iframe><form><input></form><style>a{}</style><link rel="x" href="https://e">'
    + '<a href="javascript:alert(1)">j</a><a href="data:text/html,x">d</a><a href="//evil.com">p</a>'
    + '<img src="data:image/png;base64,AAAA"><img src="/uploads/ok.jpg" onerror="alert(1)" alt="ok"></div>';
  const out = sanitizeHtmlFragment(dirty);
  for (const bad of ['script', 'iframe', 'onclick', 'onerror', 'javascript:', 'data:', 'url(', 'position', '<form', '<style', '<link', 'evil.com']) {
    assert.ok(!out.toLowerCase().includes(bad), `${bad} survived: ${out}`);
  }
  assert.match(out, /color:red/);
  assert.match(out, /padding:4px/);
  assert.match(out, /<img src="\/uploads\/ok\.jpg" alt="ok"/);
});

test('sanitiser keeps bhakti://, https and /route links; drops other attributes and tags', () => {
  const out = sanitizeHtmlFragment('<p class="c"><a href="bhakti://pooja/x">a</a> <a href="https://x.com/y">b</a> <a href="/darshan">c</a> <img src="https://x.com/i.png" alt="i"><table><tr><td>t</td></tr></table></p>');
  assert.match(out, /href="bhakti:\/\/pooja\/x"/);
  assert.match(out, /href="https:\/\/x\.com\/y"/);
  assert.match(out, /href="\/darshan"/);
  assert.match(out, /src="https:\/\/x\.com\/i\.png"/);
  assert.match(out, /class="c"/);
  assert.ok(!out.includes('<table'));
  assert.equal(sanitizeHtmlFragment(undefined), '');
  assert.ok(!sanitizeHtmlFragment('<div style="width:calc(100% - 1px);color:expression(alert(1))">x</div>').includes('expression'));
});

/* ───────────────────────────────────────────────────────────────── seed ── */
test('the default layout is seeded once, in order, equal to today’s Home', async () => {
  const rows = await HomeSection.find().sort({ order: 1 }).lean();
  assert.deepEqual(rows.map((r) => r.key), ['hero', 'astrologer', 'quick-grid', 'festivals', 'pitru-paksha', 'daily', 'temples', 'features', 'books', 'knowledge', 'ancestors', 'darshan']);
  assert.deepEqual(rows.map((r) => r.order), [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]);
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.equal(by['quick-grid'].items.length, 8);
  assert.equal(by.daily.items.length, 4);
  assert.equal(by.features.items.length, 4);
  assert.deepEqual([by.books.source, by.books.tone, by.books.layout, by.books.title], ['custom', 'gold', 'book2', 'Pooja & Paath Books']);
  assert.deepEqual(by.books.items.map((i) => i.title), ['Aarti', 'Chalisa', 'Katha', 'Paath']);
  assert.deepEqual(by.knowledge.items.map((i) => i.deitySlug), ['vishnu', 'shiva', 'ganesh']);
  assert.deepEqual([by.daily.tone, by.knowledge.title, by.temples.title], ['forest', 'Knowledge of the Gods', 'Popular Temples']);
  // The two seasonal blocks carry their own window, so they switch themselves off after Pitru Paksha.
  assert.ok(by['pitru-paksha'].startsAt && by['pitru-paksha'].endsAt && by.ancestors.endsAt);
  assert.deepEqual(by['pitru-paksha'].items.map((i) => i.title), ['Pitru Paksha', '27 Sep to 10 Oct', 'Blessings of ancestors']);
});

/* ──────────────────────────────────────────────── GET /content: filtering ── */
test('home.sections: disabled, out-of-window and empty item-sections are left out; sorted by order', async () => {
  await HomeSection.deleteMany({});
  const mk = (key, extra = {}) => HomeSection.create({ key, source: 'custom', title: key, items: [{ title: 'x' }], order: 1, ...extra });
  await mk('later', { order: 30 });
  await mk('first', { order: 10 });
  await mk('off', { enabled: false, order: 5 });
  await mk('future', { startsAt: new Date(at(24)), order: 6 });
  await mk('expired', { endsAt: new Date(at(-1)), order: 7 });
  await mk('current', { startsAt: new Date(at(-1)), endsAt: new Date(at(1)), order: 20 });
  await mk('empty', { items: [], order: 8 });
  await HomeSection.create({ key: 'fest', source: 'festivals', order: 11 }); // no items needed
  const { body } = await h.call('GET', '/content');
  assert.deepEqual(body.home.sections.map((s) => s.key), ['first', 'fest', 'current', 'later']);
  assert.ok(!('_id' in body.home.sections[0]));
  assert.ok(Array.isArray(body.hero));
});

test('hero: schedule-filtered, enabled only, html cleaned again on read', async () => {
  await HeroSlide.deleteMany({});
  await HeroSlide.insertMany([
    { slug: 'a', title: 'A', deitySlug: 'shiva', order: 2 },
    { slug: 'b', kind: 'html', html: '<div onclick="x()">B<script>1</script></div>', order: 1 }, // written around the API
    { slug: 'c', title: 'C', deitySlug: 'shiva', startsAt: new Date(at(5)), order: 3 },
    { slug: 'd', title: 'D', deitySlug: 'shiva', endsAt: new Date(at(-5)), order: 4 },
    { slug: 'e', title: 'E', deitySlug: 'shiva', enabled: false, order: 5 },
  ]);
  const { body } = await h.call('GET', '/content');
  assert.deepEqual(body.hero.map((s) => s.slug), ['b', 'a']);
  assert.equal(body.hero[0].html, '<div>B</div>');
  assert.equal(body.hero[1].kind, 'banner');
});

/* ───────────────────────────────────────────────── hero writes (sanitiser) ── */
test('hero writes: html is sanitised on save, kinds are validated, 20 KB cap', async () => {
  const ok = await h.call('POST', '/content/hero', { body: { slug: 'promo', kind: 'html', html: '<b onclick="x">hi</b><script>1</script>', htmlHi: '<i>नमस्ते</i><iframe></iframe>' } });
  assert.equal(ok.status, 201);
  assert.deepEqual([ok.body.html, ok.body.htmlHi], ['<b>hi</b>', '<i>नमस्ते</i>']);
  assert.equal((await h.call('POST', '/content/hero', { body: { slug: 'p2', kind: 'html', html: '  ' } })).body.code, 'html_required');
  // A banner without a picture is allowed (gradient), but still needs a title.
  assert.equal((await h.call('POST', '/content/hero', { body: { slug: 'p3', kind: 'banner' } })).body.code, 'title_required');
  assert.equal((await h.call('POST', '/content/hero', { body: { slug: 'p3b', kind: 'banner', title: 'No picture' } })).status, 201);
  assert.equal((await h.call('POST', '/content/hero', { body: { slug: 'p4', kind: 'nope', image: '/uploads/x.jpg' } })).body.code, 'bad_kind');
  assert.equal((await h.call('POST', '/content/hero', { body: { slug: 'p5', kind: 'html', html: `<p>${'x'.repeat(21 * 1024)}</p>` } })).body.code, 'html_too_large');
  assert.equal((await h.call('POST', '/content/hero', { body: { slug: 'p6', kind: 'banner', title: 'P6', image: '/uploads/x.jpg', startsAt: '2026-01-01T00:00:00Z' } })).status, 201);
  // A partial update is validated as the merged document.
  assert.equal((await h.call('PUT', `/content/hero/${ok.body._id}`, { body: { html: '' } })).body.code, 'html_required');
  assert.equal((await h.call('PUT', `/content/hero/${ok.body._id}`, { body: { title: 'T', html: '<u onmouseover="x">u</u>' } })).body.html, '<u>u</u>');
});

/* ──────────────────────────────────────────────── admin home-sections CRUD ── */
test('admin home-sections: CRUD, validation, full docs, order rewrite', async () => {
  await HomeSection.deleteMany({});
  const c = await h.call('POST', '/admin/home-sections', { body: { key: 'pitru-paksha', source: 'custom', title: 'Pitru Paksha Special', tone: 'purple', layout: 'photo3', items: [{ title: 'Pind Daan', href: '/pooja/x', badge: 'special' }], order: 40 } });
  assert.equal(c.status, 201);
  assert.equal((await h.call('POST', '/admin/home-sections', { body: { key: 'pitru-paksha', title: 'dup' } })).status, 409);
  assert.equal((await h.call('POST', '/admin/home-sections', { body: { key: 'Bad Key' } })).status, 400);
  assert.equal((await h.call('POST', '/admin/home-sections', { body: { key: 'x1', tone: 'pink' } })).body.code, 'bad_section');
  assert.equal((await h.call('POST', '/admin/home-sections', { body: { key: 'x2', items: [{ badge: 'huge' }] } })).body.code, 'bad_section');
  const off = await h.call('POST', '/admin/home-sections', { body: { key: 'hidden', title: 'H', enabled: false, items: [{ title: 'x' }], order: 50 } });
  const list = await h.call('GET', '/admin/home-sections');
  assert.deepEqual(list.body.map((s) => s.key), ['pitru-paksha', 'hidden']); // disabled ones included
  assert.equal((await h.call('PUT', `/admin/home-sections/${c.body._id}`, { body: { title: 'Renamed' } })).body.title, 'Renamed');
  const ord = await h.call('PUT', '/admin/home-sections/order', { body: { ids: [off.body._id, c.body._id] } });
  assert.deepEqual(ord.body.map((s) => [s.key, s.order]), [['hidden', 10], ['pitru-paksha', 20]]);
  assert.equal((await h.call('PUT', '/admin/home-sections/order', { body: { ids: ['nope'] } })).status, 400);
  assert.equal((await h.call('PUT', '/admin/home-sections/000000000000000000000000', { body: {} })).status, 404);
  await h.call('DELETE', `/admin/home-sections/${c.body._id}`);
  assert.equal((await h.call('GET', '/admin/home-sections')).body.length, 1);
});
