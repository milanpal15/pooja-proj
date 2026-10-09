import { ChadhavaListing } from '../chadhava/chadhava.model.js';
import { Pooja } from '../poojas/pooja.model.js';
import { HttpError } from '../../lib/http-error.js';
import { Temple } from '../../models.js';
import { LiveCategory, LiveJaiCount, LiveJaiLast, LiveStream } from './live.model.js';
import { aartisToday, currentAarti, istParts, isVerified, nextAarti, streamState, windowKey } from './live.state.js';

const THROTTLE_MS = 60_000;
const RANK = { live: 0, upcoming: 1, offline: 2 };
const hhmmOf = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const nameOf = (a) => ({ name: a.name, nameHi: a.nameHi || '' });

function card(s, temple, now) {
  const cur = currentAarti(s, now);
  const next = nextAarti(s, now);
  const state = streamState(s, now);
  return {
    slug: s.slug,
    templeSlug: s.templeSlug,
    templeName: temple?.name || s.templeSlug,
    place: temple?.location || '',
    categorySlug: s.categorySlug || '',
    state,
    verified: isVerified(s),
    currentAarti: cur ? nameOf(cur) : null,
    startedAt: state === 'live' && s.startedAt ? new Date(s.startedAt).toISOString() : null,
    viewers: state === 'live' && typeof s.viewers === 'number' ? s.viewers : null,
    nextAarti: next ? { ...nameOf(next), time: next.time } : null,
    cover: s.cover || '',
    sourceType: s.sourceType,
  };
}

const sortCards = (cards, orderOf) =>
  cards.sort((a, b) => RANK[a.state] - RANK[b.state] || orderOf(a) - orderOf(b));

async function templesFor(streams) {
  const rows = await Temple.find({ slug: { $in: streams.map((s) => s.templeSlug) } }).lean();
  return new Map(rows.map((t) => [t.slug, t]));
}

export async function listPublic(now = new Date()) {
  const [streams, categories] = await Promise.all([
    LiveStream.find({ enabled: true }).lean(),
    LiveCategory.find({ enabled: true }).sort({ order: 1, createdAt: 1 }).lean(),
  ]);
  const temples = await templesFor(streams);
  const order = new Map(streams.map((s) => [s.slug, s.order ?? 0]));
  const cards = sortCards(streams.map((s) => card(s, temples.get(s.templeSlug), now)), (c) => order.get(c.slug));

  const { minutes } = istParts(now);
  const upcoming = streams
    .flatMap((s) => aartisToday(s, now).filter((a) => a.start >= minutes).map((a) => ({ s, a })))
    .sort((x, y) => x.a.start - y.a.start || (x.s.order ?? 0) - (y.s.order ?? 0))
    .slice(0, 12);
  const schedule = upcoming.map(({ s, a }, i) => ({
    streamSlug: s.slug,
    templeName: temples.get(s.templeSlug)?.name || s.templeSlug,
    name: a.name,
    nameHi: a.nameHi || '',
    time: hhmmOf(a.start),
    isNext: i === 0,
  }));
  return { categories: categories.map((c) => ({ slug: c.slug, name: c.name, nameHi: c.nameHi || '' })), streams: cards, schedule };
}

async function chadhavaFor(s, now) {
  const base = { enabled: true, $and: [{ $or: [{ startsAt: null }, { startsAt: { $lte: now } }] }, { $or: [{ endsAt: null }, { endsAt: { $gt: now } }] }] };
  const l = s.chadhavaListingSlug
    ? await ChadhavaListing.findOne({ ...base, slug: s.chadhavaListingSlug }).lean()
    : await ChadhavaListing.findOne({ ...base, templeSlug: s.templeSlug }).sort({ order: 1 }).lean();
  const coins = (l?.offerings ?? []).filter((o) => o.enabled !== false).map((o) => o.coins);
  return l && coins.length ? { slug: l.slug, title: l.title, fromCoins: Math.min(...coins) } : null;
}

async function poojaFor(s, now) {
  const today = istParts(now).date;
  const p = s.poojaSlug
    ? await Pooja.findOne({ enabled: true, slug: s.poojaSlug }).lean()
    : await Pooja.findOne({ enabled: true, templeSlug: s.templeSlug, $or: [{ poojaDate: null }, { poojaDate: { $gte: today } }] }).sort({ order: 1 }).lean();
  const coins = (p?.packages ?? []).filter((k) => k.enabled !== false).map((k) => k.coins);
  const closed = p?.bookingClosesAt && new Date(p.bookingClosesAt) <= now;
  return p && coins.length && !closed ? { slug: p.slug, title: p.title, fromCoins: Math.min(...coins) } : null;
}

async function jaiCountFor(s, cur, now) {
  if (!cur) return null;
  const row = await LiveJaiCount.findOne({ streamSlug: s.slug, windowKey: windowKey(s, cur, now) }).lean();
  return row?.count > 0 ? row.count : null;
}

export async function detailPublic(slug, now = new Date()) {
  const s = await LiveStream.findOne({ slug: String(slug), enabled: true }).lean();
  if (!s) throw new HttpError(404, 'not_found', 'Stream not found.');
  const [temple, all] = [await Temple.findOne({ slug: s.templeSlug }).lean(), await LiveStream.find({ enabled: true, slug: { $ne: s.slug } }).lean()];
  const base = card(s, temple, now);
  const cur = currentAarti(s, now);
  const { minutes } = istParts(now);
  const others = await templesFor(all);
  const more = sortCards(all.map((o) => card(o, others.get(o.templeSlug), now)), () => 0).filter((c) => c.state === 'live').slice(0, 6);
  const [jaiCount, chadhava, pooja] = await Promise.all([jaiCountFor(s, cur, now), chadhavaFor(s, now), poojaFor(s, now)]);
  return {
    ...base,
    ...(base.state === 'live' ? { url: s.url } : {}),
    jaiText: s.jaiText || 'Jai',
    jaiTextHi: s.jaiTextHi || '',
    jaiCount,
    aartisToday: aartisToday(s, now).map((a) => ({
      ...nameOf(a),
      time: hhmmOf(a.start),
      status: cur && cur.index === a.index ? 'live' : a.start <= minutes ? 'done' : 'upcoming',
    })),
    temple: {
      slug: s.templeSlug,
      name: temple?.name || s.templeSlug,
      about: temple?.about || '',
      place: temple?.location || '',
      ...(typeof temple?.lat === 'number' ? { lat: temple.lat } : {}),
      ...(typeof temple?.lng === 'number' ? { lng: temple.lng } : {}),
    },
    chadhava,
    pooja,
    more,
  };
}

/** One tap of "Jai". 429 when the same devotee tapped this stream in the last 60 s; 409 outside an aarti window. */
export async function sayJai(uid, slug, now = new Date()) {
  const s = await LiveStream.findOne({ slug: String(slug), enabled: true }).lean();
  if (!s) throw new HttpError(404, 'not_found', 'Stream not found.');
  const cur = streamState(s, now) === 'live' ? currentAarti(s, now) : null;
  if (!cur) throw new HttpError(409, 'no_aarti', 'There is no aarti in progress.');
  const key = windowKey(s, cur, now);

  // Atomic throttle: the upsert only matches when the last tap is old enough; a recent row makes the
  // upsert collide with the unique index (E11000), which is the "too fast" answer.
  try {
    await LiveJaiLast.findOneAndUpdate({ uid, streamSlug: s.slug, lastAt: { $lte: new Date(now.getTime() - THROTTLE_MS) } }, { $set: { lastAt: now } }, { upsert: true });
  } catch (e) {
    if (e?.code !== 11000) throw e;
    const row = await LiveJaiCount.findOne({ streamSlug: s.slug, windowKey: key }).lean();
    throw new HttpError(429, 'too_fast', 'Already said Jai a moment ago.', { jaiCount: row?.count ?? 0 });
  }
  const row = await LiveJaiCount.findOneAndUpdate({ streamSlug: s.slug, windowKey: key }, { $inc: { count: 1 }, $set: { updatedAt: now } }, { upsert: true, new: true }).lean();
  return { jaiCount: row.count };
}

/** Admin row: stored fields + computed state. */
export function adminView(s, now = new Date()) {
  const next = nextAarti(s, now);
  return { ...s, state: streamState(s, now), verified: isVerified(s), nextAarti: next ? { ...nameOf(next), time: next.time } : null };
}
