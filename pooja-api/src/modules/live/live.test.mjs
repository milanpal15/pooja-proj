import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { Temple } from '../../models.js';
import { ChadhavaListing } from '../chadhava/chadhava.model.js';
import { Pooja } from '../poojas/pooja.model.js';
import { boot } from '../test-kit.mjs';
import * as live from './index.js';
import { LiveJaiLast, LiveStream } from './live.model.js';
import { migrateTempleStreams, seedLive } from './live.seed.js';
import { aartisToday, currentAarti, nextAarti, streamState } from './live.state.js';
import { checkLimiter } from './live.routes.js';
import { isInternalHost, probeAll, probeHls, probeSource, probeYoutubeIds } from './probe.js';

let h;
const YT = 'https://www.youtube.com/watch?v=iD7bdfmqzXE';
const HLS = 'https://cdn.example.com/kashi/live.m3u8';
// 2026-10-07 is a Wednesday. `at('HH:MM')` is that time in IST.
const at = (hhmm, date = '2026-10-07') => new Date(`${date}T${hhmm}:00+05:30`);
const aarti = (time, extra = {}) => ({ name: `A${time}`, nameHi: `आ${time}`, time, days: 'daily', ...extra });
const mkBody = (templeSlug, extra = {}) => ({ templeSlug, sourceType: 'youtube', url: YT, ...extra });

/** HH:MM in IST for "now plus minutes", clamped into the day. */
const nowIstMinutes = () => { const d = new Date(Date.now() + 5.5 * 3_600_000); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

before(async () => {
  h = await boot(live, 'live_tests');
  for (const [slug, name] of [['kashi', 'Kashi Vishwanath'], ['ujjain', 'Mahakal'], ['somnath', 'Somnath'], ['dwarka', 'Dwarka'], ['gaya', 'Gaya']]) {
    await Temple.create({ slug, name, location: `${name} town`, about: `About ${name}`, lat: 25.3, lng: 83 });
  }
});
after(() => h.stop());

/* ──────────────────────────────────────────────────────── state derivation ── */

test('aarti windows run start to +90 min in IST, honour weekdays, and the latest start wins an overlap', () => {
  const s = { enabled: true, broadcasting: false, aartis: [aarti('05:00'), aarti('19:00'), aarti('19:30'), aarti('12:00', { days: [0] })] };
  assert.equal(currentAarti(s, at('04:59')), null);
  assert.equal(currentAarti(s, at('05:00')).time, '05:00');
  assert.equal(currentAarti(s, at('06:29')).time, '05:00');
  assert.equal(currentAarti(s, at('06:30')), null);
  assert.equal(currentAarti(s, at('19:45')).time, '19:30');
  assert.equal(currentAarti(s, at('12:10')), null); // 12:00 is Sundays only; the 7th is a Wednesday
  assert.equal(currentAarti(s, at('12:10', '2026-10-11')).time, '12:00'); // a Sunday
  assert.equal(nextAarti(s, at('05:00')).time, '19:00');
  assert.equal(nextAarti(s, at('20:00')), null);
  assert.deepEqual(aartisToday(s, at('08:00')).map((a) => a.time), ['05:00', '19:00', '19:30']);
});

test('the IST day, not the server day, decides: 23:30 UTC is already tomorrow in India', () => {
  const s = { enabled: true, broadcasting: false, aartis: [aarti('06:00', { days: [4] })] }; // Thursday only
  assert.equal(nextAarti(s, new Date('2026-10-07T23:30:00Z')).time, '06:00'); // Wed 23:30 UTC = Thu 05:00 IST
});

test('state: live when broadcasting or unknown; upcoming/offline when not; hidden when disabled', () => {
  const base = { enabled: true, aartis: [aarti('18:00')] };
  assert.equal(streamState({ ...base, broadcasting: true }, at('03:00')), 'live');
  assert.equal(streamState({ ...base, broadcasting: null }, at('03:00')), 'live'); // the operator's switch
  assert.equal(streamState({ ...base, broadcasting: undefined }, at('03:00')), 'live');
  assert.equal(streamState({ ...base, broadcasting: false }, at('03:00')), 'upcoming');
  assert.equal(streamState({ ...base, broadcasting: false }, at('18:30')), 'offline'); // none starts later today
  assert.equal(streamState({ enabled: true, broadcasting: false, aartis: [] }, at('03:00')), 'offline');
  assert.equal(streamState({ ...base, enabled: false, broadcasting: true }, at('03:00')), 'hidden');
});

/* ───────────────────────────────────────────────────────── admin validation ── */

test('admin create: slug derives from the temple; row carries computed state; bad input is refused', async () => {
  const post = (b) => h.call('POST', '/admin/live-streams', { body: b });
  const ok = await post(mkBody('kashi', { aartis: [aarti('05:00', { days: [1, 3] })], jaiText: 'Jai Bholenath' }));
  assert.equal(ok.status, 201);
  assert.equal(ok.body.slug, 'kashi');
  assert.equal(ok.body.state, 'live');
  assert.equal(ok.body.verified, false);
  assert.equal(ok.body.broadcasting, null);

  const dup = await post(mkBody('kashi'));
  assert.deepEqual([dup.status, dup.body.code], [409, 'duplicate_temple']);
  assert.equal((await post(mkBody('nowhere'))).body.code, 'bad_temple');
  assert.equal((await post({ sourceType: 'youtube', url: YT })).status, 400); // no temple
  for (const b of [{ url: 'rtmp://x/y' }, { url: 'not a url' }, { url: 'http://x.com/a.m3u8', sourceType: 'hls' }, { url: 'https://x.com/page', sourceType: 'hls' }, { url: HLS, sourceType: 'youtube' }, { url: '' }, { sourceType: 'dash' }]) {
    const r = await post(mkBody('ujjain', b));
    assert.equal(r.status, 400, JSON.stringify(b));
  }
  assert.equal((await post(mkBody('ujjain', { url: 'rtmp://x/y' }))).body.code, 'bad_stream_url');
  assert.equal((await post(mkBody('ujjain', { categorySlug: 'ghost' }))).body.code, 'bad_category');
  assert.equal((await post(mkBody('ujjain', { aartis: [aarti('25:00')] }))).status, 400);
  assert.equal((await post(mkBody('ujjain', { aartis: [aarti('5:00')] }))).status, 400);
  assert.equal((await post(mkBody('ujjain', { aartis: [aarti('05:00', { days: [7] })] }))).status, 400);
  assert.equal((await post(mkBody('ujjain', { aartis: [aarti('05:00', { days: 'weekly' })] }))).status, 400);
  assert.equal((await post(mkBody('ujjain', { aartis: [{ ...aarti('05:00'), name: 'x'.repeat(61) }] }))).status, 400);
  assert.equal((await post(mkBody('ujjain', { aartis: Array.from({ length: 13 }, (_, i) => aarti(hhmm(i * 60))) }))).status, 400);
  assert.equal((await post(mkBody('ujjain', { aartis: Array.from({ length: 12 }, (_, i) => aarti(hhmm(i * 60))) }))).status, 201);
  await LiveStream.deleteOne({ slug: 'ujjain' });
});

test('admin: embed snippets normalise, partial PUT merges, a new link resets the probe, delete works', async () => {
  const iframe = '<iframe src="https://www.youtube.com/embed/iD7bdfmqzXE?si=zz" title="x"></iframe>';
  const c = await h.call('POST', '/admin/live-streams', { body: mkBody('somnath', { url: iframe }) });
  assert.equal(c.body.url, YT);
  await LiveStream.updateOne({ slug: 'somnath' }, { $set: { broadcasting: true, viewers: 5, checkedAt: new Date() } });
  const keep = await h.call('PUT', `/admin/live-streams/${c.body._id}`, { body: { jaiText: 'Jai Somnath' } });
  assert.equal(keep.body.jaiText, 'Jai Somnath');
  assert.equal(keep.body.url, YT);
  assert.equal(keep.body.broadcasting, true); // untouched link keeps its probe
  const swap = await h.call('PUT', `/admin/live-streams/${c.body._id}`, { body: { sourceType: 'hls', url: HLS } });
  assert.equal(swap.body.broadcasting, null);
  assert.equal(swap.body.checkedAt, null);
  assert.equal((await h.call('PUT', `/admin/live-streams/${c.body._id}`, { body: { templeSlug: 'kashi' } })).status, 400);
  assert.equal((await h.call('PUT', '/admin/live-streams/000000000000000000000000', { body: {} })).status, 404);
  assert.equal((await h.call('PUT', '/admin/live-streams/nope', { body: {} })).status, 400);
  const list = await h.call('GET', '/admin/live-streams');
  assert.ok(list.body.every((r) => r.state && 'verified' in r));
  assert.equal((await h.call('DELETE', `/admin/live-streams/${c.body._id}`)).status, 200);
});

test('categories CRUD and ordering; streams reorder with PUT order', async () => {
  const a = await h.call('POST', '/admin/live-categories', { body: { name: 'Char Dham' } });
  assert.equal(a.status, 201);
  assert.equal(a.body.slug, 'char-dham');
  assert.equal((await h.call('POST', '/admin/live-categories', { body: { name: 'Char Dham' } })).status, 409);
  assert.equal((await h.call('POST', '/admin/live-categories', { body: { name: '' } })).status, 400);
  const b = await h.call('POST', '/admin/live-categories', { body: { name: 'Other', slug: 'other' } });
  const ord = await h.call('PUT', '/admin/live-categories/order', { body: { ids: [b.body._id, a.body._id] } });
  assert.deepEqual(ord.body.map((r) => r.slug), ['other', 'char-dham']);
  assert.equal((await h.call('PUT', '/admin/live-categories/order', { body: { ids: ['x'] } })).status, 400);
  assert.equal((await h.call('PUT', '/admin/live-categories/order', { body: { ids: ['000000000000000000000000'] } })).status, 404);

  await LiveStream.deleteMany({});
  const s1 = await h.call('POST', '/admin/live-streams', { body: mkBody('dwarka', { categorySlug: 'char-dham' }) });
  const s2 = await h.call('POST', '/admin/live-streams', { body: mkBody('gaya') });
  const so = await h.call('PUT', '/admin/live-streams/order', { body: { ids: [s2.body._id, s1.body._id] } });
  assert.deepEqual(so.body.map((r) => r.slug), ['gaya', 'dwarka']);
  assert.equal((await h.call('PUT', '/admin/live-streams/order', { body: { ids: [s1.body._id, s1.body._id] } })).status, 400);
  await h.call('DELETE', `/admin/live-streams/${s1.body._id}`);
  await h.call('DELETE', `/admin/live-streams/${s2.body._id}`);
  await h.call('DELETE', `/admin/live-categories/${a.body._id}`);
  await h.call('DELETE', `/admin/live-categories/${b.body._id}`);
});

/* ───────────────────────────────────────────────────────────── public shapes ── */

test('public list: enabled only, live before upcoming before offline, no url anywhere, schedule is today and bounded', async () => {
  await LiveStream.deleteMany({});
  const nowM = nowIstMinutes();
  const later = hhmm(Math.min(1439, nowM + 30));
  const mk = (slug, extra) => LiveStream.create({ slug, templeSlug: slug, sourceType: 'hls', url: HLS, aartis: [], ...extra });
  await mk('kashi', { order: 3, broadcasting: false });                               // offline
  await mk('ujjain', { order: 2, broadcasting: false, aartis: [aarti(later)] });      // upcoming (if later < 23:59 rule below)
  await mk('somnath', { order: 5, broadcasting: true, viewers: 12, startedAt: new Date() });
  await mk('dwarka', { order: 1, broadcasting: null });                               // unverified live
  await mk('gaya', { order: 0, enabled: false, broadcasting: true });
  const { body, status } = await h.call('GET', '/live');
  assert.equal(status, 200);
  const states = Object.fromEntries(body.streams.map((c) => [c.slug, c.state]));
  assert.equal(states.gaya, undefined);
  assert.deepEqual(body.streams.slice(0, 2).map((c) => c.slug), ['dwarka', 'somnath']); // live group by order
  assert.equal(states.kashi, 'offline');
  if (nowM + 30 <= 1439) {
    assert.equal(states.ujjain, 'upcoming');
    assert.deepEqual(body.streams.map((c) => c.slug), ['dwarka', 'somnath', 'ujjain', 'kashi']);
    assert.equal(body.schedule[0].streamSlug, 'ujjain');
    assert.equal(body.schedule[0].isNext, true);
  }
  const some = body.streams.find((c) => c.slug === 'somnath');
  assert.equal(some.viewers, 12);
  assert.equal(some.verified, true);
  assert.equal(some.templeName, 'Somnath');
  assert.equal(some.place, 'Somnath town');
  assert.equal(body.streams.find((c) => c.slug === 'dwarka').verified, false);
  assert.equal(body.streams.find((c) => c.slug === 'kashi').viewers, null);
  assert.ok(!JSON.stringify(body).includes('cdn.example.com'), 'cards never carry the url');
  assert.ok(Array.isArray(body.categories));
  assert.ok(body.schedule.length <= 12);
});

test('schedule caps at 12 and detail exposes url only while live', async () => {
  await LiveStream.deleteMany({});
  const nowM = nowIstMinutes();
  const start = Math.max(0, nowM); // starting now counts as "remaining"
  await LiveStream.create({ slug: 'kashi', templeSlug: 'kashi', sourceType: 'hls', url: HLS, broadcasting: false, aartis: Array.from({ length: 12 }, (_, i) => aarti(hhmm(Math.min(1439, start + i)))) });
  await LiveStream.create({ slug: 'ujjain', templeSlug: 'ujjain', sourceType: 'youtube', url: YT, broadcasting: false, aartis: Array.from({ length: 3 }, (_, i) => aarti(hhmm(Math.min(1439, start + i)))) });
  const { body } = await h.call('GET', '/live');
  assert.ok(body.schedule.length <= 12);
  assert.ok(body.schedule.every((x, i, a) => i === 0 || a[i - 1].time <= x.time));

  await LiveStream.updateOne({ slug: 'kashi' }, { $set: { broadcasting: false, aartis: [] } });
  const off = (await h.call('GET', '/live/kashi')).body.stream;
  assert.equal(off.state, 'offline');
  assert.equal('url' in off, false);
  await LiveStream.updateOne({ slug: 'kashi' }, { $set: { broadcasting: true } });
  const on = (await h.call('GET', '/live/kashi')).body.stream;
  assert.equal(on.url, HLS);
  assert.equal(on.jaiCount, null);
  assert.equal(on.temple.name, 'Kashi Vishwanath');
  assert.equal(on.temple.lat, 25.3);
  assert.equal(on.chadhava, null);
  assert.equal(on.pooja, null);
  assert.deepEqual(on.more, []); // only other *live* streams; ujjain is not broadcasting
  await LiveStream.updateOne({ slug: 'ujjain' }, { $set: { broadcasting: true } });
  assert.deepEqual((await h.call('GET', '/live/kashi')).body.stream.more.map((c) => c.slug), ['ujjain']);
  assert.ok(!JSON.stringify((await h.call('GET', '/live/kashi')).body.stream.more).includes(YT));

  await LiveStream.updateOne({ slug: 'kashi' }, { $set: { enabled: false } });
  const gone = await h.call('GET', '/live/kashi');
  assert.deepEqual([gone.status, gone.body.code], [404, 'not_found']);
  assert.equal((await h.call('GET', '/live/missing')).status, 404);
});

test('detail: aartisToday statuses, chadhava and pooja summaries', async () => {
  await LiveStream.deleteMany({});
  const nowM = nowIstMinutes();
  const t = (m) => hhmm(Math.max(0, Math.min(1439, m)));
  await ChadhavaListing.create({ slug: 'kashi-chad', title: 'Kashi Chadhava', templeSlug: 'kashi', offerings: [{ key: 'a', coins: 51 }, { key: 'b', coins: 21 }, { key: 'c', coins: 5, enabled: false }] });
  await Pooja.create({ slug: 'kashi-p', title: 'Kashi Pooja', templeSlug: 'kashi', packages: [{ key: 'i', persons: 1, coins: 551 }, { key: 'p', persons: 2, coins: 301 }] });
  await LiveStream.create({ slug: 'kashi', templeSlug: 'kashi', sourceType: 'hls', url: HLS, broadcasting: true, aartis: [aarti(t(nowM - 5), { name: 'Now' }), aarti(t(nowM + 1000), { name: 'Later' })] });
  const d = (await h.call('GET', '/live/kashi')).body.stream;
  assert.deepEqual(d.chadhava, { slug: 'kashi-chad', title: 'Kashi Chadhava', fromCoins: 21 });
  assert.deepEqual(d.pooja, { slug: 'kashi-p', title: 'Kashi Pooja', fromCoins: 301 });
  assert.equal(d.currentAarti.name, 'Now');
  if (nowM + 1000 <= 1439) assert.deepEqual(d.aartisToday.map((a) => a.status), ['live', 'upcoming']);
  else assert.equal(d.aartisToday[0].status, 'live');
});

/* ─────────────────────────────────────────────────────────────────── Jai ── */

test('jai: needs a token, 409 outside an aarti, counts per window, 429 within 60 s per user, resets after', async () => {
  await LiveStream.deleteMany({});
  await LiveJaiLast.deleteMany({});
  const nowM = nowIstMinutes();
  await LiveStream.create({ slug: 'kashi', templeSlug: 'kashi', sourceType: 'hls', url: HLS, broadcasting: true, aartis: [aarti(hhmm(Math.max(0, nowM - 5)))] });
  await LiveStream.create({ slug: 'ujjain', templeSlug: 'ujjain', sourceType: 'hls', url: HLS, broadcasting: true, aartis: [] });
  await LiveStream.create({ slug: 'somnath', templeSlug: 'somnath', sourceType: 'hls', url: HLS, broadcasting: false, aartis: [aarti(hhmm(Math.max(0, nowM - 5)))] });

  assert.equal((await h.call('POST', '/live/kashi/jai')).status, 401);
  assert.equal((await h.call('POST', '/live/nothing/jai', { uid: 'u1' })).status, 404);
  const none = await h.call('POST', '/live/ujjain/jai', { uid: 'u1' });
  assert.deepEqual([none.status, none.body.code], [409, 'no_aarti']);
  assert.equal((await h.call('POST', '/live/somnath/jai', { uid: 'u1' })).status, 409); // off air

  assert.deepEqual((await h.call('POST', '/live/kashi/jai', { uid: 'u1' })).body, { jaiCount: 1 });
  const fast = await h.call('POST', '/live/kashi/jai', { uid: 'u1' });
  assert.deepEqual([fast.status, fast.body.code], [429, 'too_fast']);
  assert.deepEqual((await h.call('POST', '/live/kashi/jai', { uid: 'u2' })).body, { jaiCount: 2 }); // another devotee is not throttled
  assert.equal((await h.call('GET', '/live/kashi')).body.stream.jaiCount, 2);

  // 61 s later the same devotee may tap again.
  await LiveJaiLast.updateOne({ uid: 'u1', streamSlug: 'kashi' }, { $set: { lastAt: new Date(Date.now() - 61_000) } });
  assert.deepEqual((await h.call('POST', '/live/kashi/jai', { uid: 'u1' })).body, { jaiCount: 3 });

  // Concurrent double-tap from one devotee: exactly one lands.
  await LiveJaiLast.updateOne({ uid: 'u1', streamSlug: 'kashi' }, { $set: { lastAt: new Date(Date.now() - 61_000) } });
  const both = await Promise.all([h.call('POST', '/live/kashi/jai', { uid: 'u1' }), h.call('POST', '/live/kashi/jai', { uid: 'u1' })]);
  assert.deepEqual(both.map((r) => r.status).sort(), [200, 429]);

  // A new aarti window starts from zero: move the stream onto a different aarti index.
  await LiveStream.updateOne({ slug: 'kashi' }, { $set: { aartis: [aarti('23:59', { days: [] }), aarti(hhmm(Math.max(0, nowM - 5)))] } });
  assert.equal((await h.call('GET', '/live/kashi')).body.stream.jaiCount, null);
});

/* ──────────────────────────────────────────────────────────────── probing ── */

const resp = (status, body = '', headers = {}) => new Response(body, { status, headers });

test('hls probe: manifest, non-manifest, errors, redirects, internal addresses', async () => {
  assert.equal((await probeHls(HLS, { fetchImpl: async () => resp(200, '#EXTM3U\n#EXT-X-VERSION:3') })).broadcasting, true);
  assert.equal((await probeHls(HLS, { fetchImpl: async () => resp(200, '<html>') })).broadcasting, false);
  assert.equal((await probeHls(HLS, { fetchImpl: async () => resp(404) })).broadcasting, false);
  assert.equal((await probeHls(HLS, { fetchImpl: async () => { throw new Error('down'); } })).broadcasting, false);
  assert.equal((await probeHls('https://cdn.example.com/a.mp4', { fetchImpl: async () => resp(200, 'x', { 'content-type': 'video/mp4' }) })).broadcasting, true);
  assert.equal((await probeHls('https://cdn.example.com/a.mp4', { fetchImpl: async () => resp(200, 'x', { 'content-type': 'text/html' }) })).broadcasting, false);
  let calls = 0;
  const redirecting = async () => (calls++ === 0 ? resp(302, '', { location: 'https://edge.example.com/m.m3u8' }) : resp(200, '#EXTM3U'));
  assert.equal((await probeHls(HLS, { fetchImpl: redirecting })).broadcasting, true);
  let fetched = false;
  const toInternal = await probeHls(HLS, { fetchImpl: async () => { if (fetched) throw new Error('should not follow'); fetched = true; return resp(302, '', { location: 'https://169.254.169.254/latest' }); } });
  assert.equal(toInternal.broadcasting, false);
  assert.equal((await probeHls('https://localhost/a.m3u8', { fetchImpl: async () => { throw new Error('never'); } })).broadcasting, false);
  for (const bad of ['localhost', '127.0.0.1', '10.1.2.3', '192.168.0.9', '172.20.1.1', '169.254.169.254', '[::1]', 'db.internal']) assert.equal(isInternalHost(bad), true, bad);
  assert.equal(isInternalHost('cdn.example.com'), false);
  assert.equal(isInternalHost('172.32.0.1'), false);
});

test('youtube probe: no key means unknown; with a key the Data API decides; the watch page is never fetched', async () => {
  const noKey = await probeYoutubeIds(['iD7bdfmqzXE'], { apiKey: '', fetchImpl: async () => { throw new Error('must not fetch'); } });
  assert.deepEqual(noKey.get('iD7bdfmqzXE'), { broadcasting: null, viewers: null, startedAt: null, probeNote: 'YOUTUBE_API_KEY not set — live status is not verified' });

  const urls = [];
  const api = async (u) => {
    urls.push(String(u));
    return Response.json({ items: [
      { id: 'liveVideo111', snippet: { liveBroadcastContent: 'live' }, liveStreamingDetails: { concurrentViewers: '1234', actualStartTime: '2026-10-07T00:00:00Z' } },
      { id: 'upcoming111', snippet: { liveBroadcastContent: 'upcoming' } },
      { id: 'finished111', snippet: { liveBroadcastContent: 'none' } },
    ] });
  };
  const r = await probeYoutubeIds(['liveVideo111', 'upcoming111', 'finished111', 'missing1111'], { apiKey: 'K', fetchImpl: api });
  assert.equal(urls.length, 1); // batched
  assert.ok(urls[0].startsWith('https://www.googleapis.com/youtube/v3/videos?') && urls[0].includes('liveStreamingDetails'));
  assert.deepEqual([r.get('liveVideo111').broadcasting, r.get('liveVideo111').viewers], [true, 1234]);
  assert.equal(r.get('liveVideo111').startedAt.toISOString(), '2026-10-07T00:00:00.000Z');
  assert.deepEqual(['upcoming111', 'finished111', 'missing1111'].map((i) => r.get(i).broadcasting), [false, false, false]);
  // An API failure is "unknown", not "offline".
  const failing = await probeYoutubeIds(['iD7bdfmqzXE'], { apiKey: 'K', fetchImpl: async () => resp(403) });
  assert.equal(failing.get('iD7bdfmqzXE').broadcasting, null);
  assert.equal((await probeSource({ sourceType: 'youtube', url: 'https://example.com/x' }, { apiKey: 'K' })).broadcasting, false);
});

test('probeAll caches results on the rows and skips disabled streams', async () => {
  await LiveStream.deleteMany({});
  await LiveStream.create({ slug: 'kashi', templeSlug: 'kashi', sourceType: 'hls', url: HLS });
  await LiveStream.create({ slug: 'ujjain', templeSlug: 'ujjain', sourceType: 'youtube', url: YT });
  await LiveStream.create({ slug: 'somnath', templeSlug: 'somnath', sourceType: 'hls', url: HLS, enabled: false });
  const fetchImpl = async (u) => (String(u).includes('googleapis') ? Response.json({ items: [{ id: 'iD7bdfmqzXE', snippet: { liveBroadcastContent: 'live' }, liveStreamingDetails: { concurrentViewers: '9' } }] }) : resp(200, '#EXTM3U'));
  assert.equal(await probeAll({ apiKey: 'K', fetchImpl }), 2);
  const rows = Object.fromEntries((await LiveStream.find().lean()).map((s) => [s.slug, s]));
  assert.deepEqual([rows.kashi.broadcasting, rows.ujjain.broadcasting, rows.ujjain.viewers], [true, true, 9]);
  assert.ok(rows.kashi.checkedAt);
  assert.equal(rows.somnath.checkedAt, null);
  await probeAll({ apiKey: '', fetchImpl });
  const again = await LiveStream.findOne({ slug: 'ujjain' }).lean();
  assert.equal(again.broadcasting, null);
  assert.match(again.probeNote, /YOUTUBE_API_KEY/);
});

test('POST /admin/live-streams/check validates, reports, and is limited to 10 a minute', async () => {
  const post = (b) => h.call('POST', '/admin/live-streams/check', { body: b });
  assert.equal((await post({ sourceType: 'hls', url: 'junk' })).status, 400);
  assert.equal((await post({ sourceType: 'hls', url: 'https://localhost/a.m3u8' })).body.broadcasting, false);
  const y = await post({ sourceType: 'youtube', url: YT });
  assert.equal(y.status, 200);
  if (!process.env.YOUTUBE_API_KEY) {
    assert.deepEqual([y.body.broadcasting, y.body.viewers, y.body.ok], [null, null, true]);
    assert.match(y.body.message, /YOUTUBE_API_KEY/);
  }
  checkLimiter.reset('tester');
  let last;
  for (let i = 0; i < 11; i++) last = await post({ sourceType: 'youtube', url: YT });
  assert.deepEqual([last.status, last.body.code], [429, 'too_many_checks']);
  checkLimiter.reset('tester');
});

/* ───────────────────────────────────────────────────────── seed + migration ── */

test('seed: three categories once; Temple.liveUrl migrates to streams idempotently', async () => {
  await LiveStream.deleteMany({});
  await (await import('./live.model.js')).LiveCategory.deleteMany({});
  await Temple.updateOne({ slug: 'kashi' }, { $set: { liveUrl: YT, order: 4 } });
  await Temple.updateOne({ slug: 'ujjain' }, { $set: { liveUrl: HLS } });
  await Temple.updateOne({ slug: 'somnath' }, { $set: { liveUrl: '   ' } });
  await Temple.updateOne({ slug: 'dwarka' }, { $set: { liveUrl: 'rtmp://nope' } });
  assert.equal(await seedLive(), 2);
  assert.deepEqual((await h.call('GET', '/admin/live-categories')).body.map((c) => c.slug), ['jyotirlinga', 'shakti-peeth', 'ganga-aarti']);
  const rows = Object.fromEntries((await LiveStream.find().lean()).map((s) => [s.slug, s]));
  assert.deepEqual(Object.keys(rows).sort(), ['kashi', 'ujjain']);
  assert.deepEqual([rows.kashi.sourceType, rows.kashi.url, rows.kashi.enabled, rows.kashi.order], ['youtube', YT, true, 4]);
  assert.deepEqual([rows.ujjain.sourceType, rows.ujjain.url], ['hls', HLS]);

  // Second run: nothing new, and an operator's edit survives.
  await LiveStream.updateOne({ slug: 'kashi' }, { $set: { jaiText: 'Jai Kashi' } });
  assert.equal(await seedLive(), 0);
  assert.equal(await migrateTempleStreams(), 0);
  assert.equal(await LiveStream.countDocuments(), 2);
  assert.equal((await LiveStream.findOne({ slug: 'kashi' }).lean()).jaiText, 'Jai Kashi');
  assert.equal(await (await import('./live.model.js')).LiveCategory.countDocuments(), 3);
});
