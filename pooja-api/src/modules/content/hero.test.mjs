// Home slider contract (docs/POOJA_AND_HOME.md 1b).
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { HeroSlide } from '../../models.js';
import * as home from '../home/index.js';
import { publicContent } from '../public/public.routes.js';
import { boot } from '../test-kit.mjs';
import { content } from './index.js';
import { heroHref } from './resources/hero-target.js';
import { seedContent } from './content.seed.js';

let h;
const HOUR = 3_600_000;
const at = (hours) => new Date(Date.now() + hours * HOUR).toISOString();
const slide = (extra = {}) => ({ slug: `s${Math.random().toString(36).slice(2, 8)}`, title: 'T', image: '/uploads/a.jpg', ...extra });
const post = (body) => h.call('POST', '/content/hero', { body: slide(body) });

before(async () => {
  h = await boot(home, 'hero_tests', { mount: (app) => { app.use('/api', publicContent); app.use('/api/content', content); } });
});
after(() => h.stop());

describe('validation', () => {
  test('limits and required title', async () => {
    assert.equal((await post({ title: '' })).body.code, 'title_required');
    assert.equal((await post({ title: 'x'.repeat(81) })).body.code, 'bad_slide');
    assert.equal((await post({ tag: 'x'.repeat(25) })).body.code, 'bad_slide');
    assert.equal((await post({ subtitle: 'x'.repeat(121) })).body.code, 'bad_slide');
    assert.equal((await post({ ctaLabel: 'x'.repeat(25) })).body.code, 'bad_slide');
    assert.equal((await post({ title: 'x'.repeat(80), tag: 'x'.repeat(24), subtitle: 'x'.repeat(120), ctaLabel: 'x'.repeat(24) })).status, 201);
  });
  test('target rules', async () => {
    assert.equal((await post({ target: { type: 'nope' } })).body.code, 'bad_target');
    for (const type of ['pooja', 'chadhava', 'temple', 'link']) assert.equal((await post({ target: { type, ref: '' } })).body.code, 'bad_target', type);
    for (const ref of ['http://x.com', 'javascript:alert(1)', 'not a url']) assert.equal((await post({ target: { type: 'link', ref } })).body.code, 'bad_target', ref);
    assert.equal((await post({ target: { type: 'pooja', ref: '../x' } })).body.code, 'bad_target');
    assert.equal((await post({ language: 'fr' })).body.code, 'bad_language');
    assert.equal((await post({ target: { type: 'bhajan' } })).status, 201);
  });
  test('a PUT is validated as the merged document', async () => {
    const c = await post({});
    assert.equal((await h.call('PUT', `/content/hero/${c.body._id}`, { body: { title: '' } })).body.code, 'title_required');
    assert.equal((await h.call('PUT', `/content/hero/${c.body._id}`, { body: { target: { type: 'link', ref: 'http://x' } } })).status, 400);
  });
});

describe('target -> href', () => {
  const cases = [
    [{ type: 'pooja', ref: 'navratri' }, '/pooja/navratri'],
    [{ type: 'chadhava', ref: 'diya' }, '/chadhava/diya'],
    [{ type: 'temple', ref: 'kashi' }, '/poojas?temple=kashi'],
    [{ type: 'bhajan' }, '/bhajan'],
    [{ type: 'astrologer' }, '/astrologers'],
    [{ type: 'coins' }, '/wallet'],
    [{ type: 'link', ref: 'https://example.com/a?b=1' }, 'https://example.com/a?b=1'],
    [{ type: 'none' }, ''],
  ];
  test('every type resolves on create, in the admin list and in the public hero', async () => {
    await HeroSlide.deleteMany({});
    for (const [i, [target, href]] of cases.entries()) {
      const c = await post({ slug: `t${i}`, target, order: i });
      assert.equal(c.status, 201);
      assert.equal(c.body.href, href, target.type);
    }
    const list = (await h.call('GET', '/content/hero')).body;
    assert.deepEqual(list.map((r) => r.href), cases.map((c) => c[1]));
    const pub = (await h.call('GET', '/content')).body.hero;
    assert.deepEqual(pub.map((r) => r.href), cases.map((c) => c[1]));
    assert.deepEqual(pub[0].target, { type: 'pooja', ref: 'navratri' });
  });
  test('non-https links stored around the API are dropped on read', async () => {
    await HeroSlide.deleteMany({});
    await HeroSlide.create({ slug: 'bad', title: 'B', image: '/u.jpg', target: { type: 'link', ref: 'http://evil' } });
    await HeroSlide.create({ slug: 'js', title: 'B', image: '/u.jpg', target: { type: 'link', ref: 'javascript:alert(1)' }, order: 1 });
    assert.deepEqual((await h.call('GET', '/content')).body.hero.map((r) => r.href), ['', '']);
    assert.equal(heroHref({ type: 'link', ref: 'ftp://x' }), '');
  });
  test('a legacy slide with only href keeps it', async () => {
    await HeroSlide.deleteMany({});
    await HeroSlide.create({ slug: 'old', title: 'O', deitySlug: 'shiva', href: '/darshan' });
    assert.equal((await h.call('GET', '/content')).body.hero[0].href, '/darshan');
  });
});

describe('public list', () => {
  test('enabled + window + order + cap of 8, language passes through', async () => {
    await HeroSlide.deleteMany({});
    for (let i = 1; i <= 10; i++) await HeroSlide.create({ slug: `n${i}`, title: `N${i}`, image: '/u.jpg', order: 100 - i, language: i === 10 ? 'hi' : 'all' });
    await HeroSlide.create({ slug: 'off', title: 'x', image: '/u.jpg', order: 0, enabled: false });
    await HeroSlide.create({ slug: 'fut', title: 'x', image: '/u.jpg', order: 0, startsAt: new Date(at(3)) });
    await HeroSlide.create({ slug: 'past', title: 'x', image: '/u.jpg', order: 0, endsAt: new Date(at(-3)) });
    const hero = (await h.call('GET', '/content')).body.hero;
    assert.equal(hero.length, 8);
    assert.deepEqual(hero.map((s) => s.slug), ['n10', 'n9', 'n8', 'n7', 'n6', 'n5', 'n4', 'n3']);
    assert.equal(hero[0].language, 'hi');
    assert.equal(hero[1].language, 'all');
    // Disabled/expired slides do not eat into the cap.
    await HeroSlide.deleteMany({ slug: { $in: ['n10', 'n9', 'n8', 'n7', 'n6', 'n5', 'n4', 'n3'] } });
    assert.deepEqual((await h.call('GET', '/content')).body.hero.map((s) => s.slug), ['n2', 'n1']);
  });
  test('language is stored via the API', async () => {
    assert.equal((await post({ language: 'en' })).body.language, 'en');
  });
});

describe('PUT /content/hero/order', () => {
  test('rewrites order as 10, 20, ...', async () => {
    await HeroSlide.deleteMany({});
    const ids = [];
    for (const s of ['a', 'b', 'c']) ids.push((await post({ slug: s, order: 1 })).body._id);
    const r = await h.call('PUT', '/content/hero/order', { body: { ids: [ids[2], ids[0], ids[1]] } });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.map((x) => [x.slug, x.order]), [['c', 10], ['a', 20], ['b', 30]]);
    assert.deepEqual((await h.call('GET', '/content')).body.hero.map((s) => s.slug), ['c', 'a', 'b']);
  });
  test('refuses bad bodies', async () => {
    for (const ids of [undefined, 'x', ['nope'], ['000000000000000000000001', '000000000000000000000001']]) {
      assert.equal((await h.call('PUT', '/content/hero/order', { body: { ids } })).status, 400);
    }
  });
});

describe('seed', () => {
  test('three sample slides only into an empty collection', async () => {
    await HeroSlide.deleteMany({});
    await seedContent();
    const rows = await HeroSlide.find().sort({ order: 1 }).lean();
    assert.deepEqual(rows.map((r) => r.target.type), ['pooja', 'astrologer', 'coins']);
    assert.equal(rows[0].target.ref, 'navratri');
    await HeroSlide.deleteOne({ _id: rows[1]._id });
    await seedContent();
    assert.equal(await HeroSlide.countDocuments(), 2);
  });
});
