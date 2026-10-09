import { HttpError } from '../../lib/http-error.js';
import { istToday } from '../../lib/ist.js';
import { getNumberSetting } from '../../lib/settings.js';
import { Booking, Festival, Seva, Temple } from '../../models.js';
import { Pooja, PoojaReview } from './pooja.model.js';

const HOUR = 3_600_000;

export const enabledPackages = (p) => (p.packages ?? []).filter((k) => k.enabled !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
const published = (p, now) => !p.publishAt || new Date(p.publishAt) <= now;
const closed = (p, now) => !!p.bookingClosesAt && new Date(p.bookingClosesAt) <= now;
const dateGone = (p, now) => !!p.poojaDate && p.poojaDate < istToday(now);

/** Can a devotee book it right now? (enabled, published, a package, window open, not past.) */
export const isBookable = (p, now = new Date()) =>
  p.enabled !== false && published(p, now) && enabledPackages(p).length > 0 && !closed(p, now) && !dateGone(p, now);

/** `open` | `closing` (closes within 48 h) | `closed`. */
export function openState(p, now = new Date()) {
  if (closed(p, now) || dateGone(p, now)) return 'closed';
  return p.bookingClosesAt && new Date(p.bookingClosesAt).getTime() - now.getTime() <= 48 * HOUR ? 'closing' : 'open';
}

/** The dashboard's status column. */
export function adminStatus(p, now = new Date()) {
  if (p.enabled === false || enabledPackages(p).length === 0) return 'draft';
  if (!published(p, now)) return 'scheduled';
  const s = openState(p, now);
  if (s === 'closed') return 'ended';
  return s === 'closing' ? 'closing' : 'live';
}

/* ───────────────────────────────────────────────────────────────── public ── */

async function lookups(rows) {
  const temples = await Temple.find({ slug: { $in: [...new Set(rows.map((r) => r.templeSlug).filter(Boolean))] } }).lean();
  const festivals = await Festival.find({ slug: { $in: [...new Set(rows.map((r) => r.festivalSlug).filter(Boolean))] } }).lean();
  return { temples: new Map(temples.map((t) => [t.slug, t])), festivals: new Map(festivals.map((f) => [f.slug, f])) };
}

function cardView(p, { temples, festivals }, now) {
  const pk = enabledPackages(p);
  const coins = pk.map((k) => k.coins);
  return {
    slug: p.slug, title: p.title, titleHi: p.titleHi || '', tagline: p.tagline || '', taglineHi: p.taglineHi || '',
    // The dashboard has no separate banner field: the first gallery picture is the list banner.
    banner: p.banner || p.gallery?.[0] || '', templeSlug: p.templeSlug || '', templeName: temples.get(p.templeSlug)?.name || '',
    place: p.place || '', poojaDate: p.poojaDate ?? null, tithi: p.tithi || '',
    festivalSlug: p.festivalSlug || '', festivalName: festivals.get(p.festivalSlug)?.name || '',
    fromCoins: coins.length ? Math.min(...coins) : 0, toCoins: coins.length ? Math.max(...coins) : 0,
    packageCount: pk.length, status: openState(p, now),
  };
}

const byDate = (a, b) => {
  if (a.poojaDate !== b.poojaDate) {
    if (!a.poojaDate) return 1;
    if (!b.poojaDate) return -1;
    return a.poojaDate < b.poojaDate ? -1 : 1;
  }
  return (a.order ?? 0) - (b.order ?? 0);
};

const has = (hay, needle) => String(hay ?? '').toLowerCase().includes(String(needle).toLowerCase());

export async function listPublic(query = {}, now = new Date()) {
  const rows = (await Pooja.find({ enabled: true }).lean()).filter((p) => isBookable(p, now)).sort(byDate);
  const look = await lookups(rows);
  const q = (k) => (typeof query[k] === 'string' ? query[k].trim() : '');
  const [temple, festival, tithi, place, text] = [q('temple'), q('festival'), q('tithi'), q('place'), q('q')];
  const shown = rows.filter((p) =>
    (!temple || !p.templeSlug || p.templeSlug === temple) && (!festival || p.festivalSlug === festival) &&
    (!tithi || has(p.tithi, tithi)) && (!place || has(p.place, place)) &&
    (!text || [p.title, p.titleHi, p.tagline, p.taglineHi, p.place].some((f) => has(f, text))));
  // Filter options come from everything listed, not from the current result, so the chips do not vanish as you pick one.
  const uniq = (xs) => [...new Set(xs.filter(Boolean))];
  return {
    poojas: shown.map((p) => cardView(p, look, now)),
    filters: {
      temples: uniq(rows.map((p) => p.templeSlug)).map((slug) => ({ slug, name: look.temples.get(slug)?.name || slug })),
      festivals: uniq(rows.map((p) => p.festivalSlug)).map((slug) => ({ slug, name: look.festivals.get(slug)?.name || slug, nameHi: look.festivals.get(slug)?.nameHi || '' })),
      tithis: uniq(rows.map((p) => p.tithi)),
      places: uniq(rows.map((p) => p.place)),
    },
  };
}

async function ratingFor(slug) {
  const [r] = await PoojaReview.aggregate([
    { $match: { poojaSlug: slug, hidden: false } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  return r ? { avg: Math.round(r.avg * 10) / 10, count: r.count } : null;
}

/** A pooja the app may show: enabled and published. (A closed one still opens, marked `closed`, so a shared link explains itself.) */
export async function findPublic(slug, now = new Date()) {
  const p = typeof slug === 'string' ? await Pooja.findOne({ slug, enabled: true }).lean() : null;
  return p && published(p, now) ? p : null;
}

export async function detailPublic(slug, now = new Date()) {
  const p = await findPublic(slug, now);
  if (!p) throw new HttpError(404, 'not_found', 'Pooja not found.');
  const look = await lookups([p]);
  const t = look.temples.get(p.templeSlug);
  return {
    ...cardView(p, look, now),
    gallery: p.gallery ?? [], about: p.about || '', aboutHi: p.aboutHi || '',
    benefits: p.benefits ?? [], included: p.included ?? [], process: p.process ?? [], faqs: p.faqs ?? [],
    temple: t ? { slug: t.slug, name: t.name || '', about: p.templeAbout || t.about || '', aboutHi: p.templeAboutHi || t.aboutHi || '', image: p.templeImage || t.imageUrl || '' } : null,
    bookingClosesAt: p.bookingClosesAt ? new Date(p.bookingClosesAt).toISOString() : null,
    cancelHours: p.cancelHours ?? 24,
    prasadAvailable: !!p.prasadAvailable, prasadFeeCoins: p.prasadFeeCoins ?? 0,
    packages: enabledPackages(p).map((k) => ({
      key: k.key, name: k.name || '', nameHi: k.nameHi || '', persons: k.persons, coins: k.coins,
      perks: k.perks ?? [], perksHi: k.perksHi ?? [], image: k.image || '',
    })),
    rating: await ratingFor(p.slug),
  };
}

export async function reviewsPublic(slug, { limit, before } = {}) {
  const p = await findPublic(slug);
  if (!p) throw new HttpError(404, 'not_found', 'Pooja not found.');
  const q = { poojaSlug: p.slug, hidden: false };
  if (before) {
    const d = new Date(before);
    if (Number.isNaN(d.getTime())) throw new HttpError(400, 'bad_before', 'before must be an ISO date.');
    q.createdAt = { $lt: d };
  }
  const rows = await PoojaReview.find(q).sort({ createdAt: -1, _id: -1 }).limit(Math.min(Math.max(Number(limit) || 20, 1), 50)).lean();
  return rows.map((r) => ({ id: String(r._id), name: r.name || 'Devotee', rating: r.rating, text: r.text || '', createdAt: r.createdAt, packageName: r.packageName || '' }));
}

/* ──────────────────────────────────────────────────────────────── admin ── */

export async function adminRows(now = new Date()) {
  const rows = await Pooja.find().sort({ poojaDate: 1, order: 1, createdAt: 1 }).lean();
  const counts = await Booking.aggregate([{ $match: { status: { $ne: 'cancelled' }, poojaSlug: { $exists: true } } }, { $group: { _id: '$poojaSlug', n: { $sum: 1 } } }]);
  const byslug = new Map(counts.map((c) => [c._id, c.n]));
  return rows.map((p) => adminView(p, byslug.get(p.slug) ?? 0, now));
}

export const adminView = (p, bookingCount, now = new Date()) => ({ ...p, id: String(p._id), status: adminStatus(p, now), bookingCount });

export const bookingCountFor = (slug) => Booking.countDocuments({ poojaSlug: slug, status: { $ne: 'cancelled' } });

/* ───────────────────────────────────────────────────────── migrations/seeds ── */

/**
 * One package per Seva, `persons: 1`, priced as the seva was. Idempotent: a
 * seva that already became a pooja (or whose slug is taken) is `skipped`.
 */
export async function importSevas() {
  const sevas = await Seva.find().sort({ order: 1 }).lean();
  const temples = new Map((await Temple.find().lean()).map((t) => [t.slug, t]));
  const prasadFee = Math.max(0, Math.round(await getNumberSetting('prasadDelivery', 0)));
  let created = 0;
  let skipped = 0;
  for (const s of sevas) {
    const price = Math.round(Number(s.price) || 0);
    const exists = await Pooja.exists({ $or: [{ slug: s.slug }, { importedFromSeva: s.slug }] });
    if (exists || price < 1) { skipped++; continue; }
    const t = temples.get(s.templeSlug);
    await Pooja.create({
      slug: s.slug, title: s.name || s.slug, titleHi: s.nameHi, tagline: s.duration || '', about: s.description, aboutHi: s.descriptionHi,
      templeSlug: s.templeSlug || '', place: t?.location || '', deitySlug: s.deitySlugs?.[0] || '', poojaDate: null,
      prasadAvailable: prasadFee > 0, prasadFeeCoins: prasadFee,
      packages: [{ key: 'individual', name: 'Individual', nameHi: 'व्यक्तिगत', persons: 1, coins: price, order: 0, enabled: true }],
      importedFromSeva: s.slug, enabled: s.enabled !== false, order: s.order ?? 0,
    });
    created++;
  }
  return { created, skipped };
}

const SAMPLE = '[SAMPLE] ';
const samples = () => {
  const day = (n) => new Date(Date.now() + n * 86_400_000 + 5.5 * HOUR).toISOString().slice(0, 10);
  const pk = (key, name, persons, coins, order) => ({ key, name, persons, coins, order, perks: [`Sankalp for ${persons} ${persons === 1 ? 'person' : 'people'}`], enabled: true });
  const base = { prasadAvailable: true, prasadFeeCoins: 99, cancelHours: 24, enabled: true };
  return [
    {
      ...base, slug: 'sample-navratri-durga-pooja', title: `${SAMPLE}Navratri Durga Pooja`, titleHi: 'नवरात्रि दुर्गा पूजा',
      tagline: 'Sample content - replace or delete from the dashboard', place: 'Varanasi', tithi: 'Ashtami', deitySlug: 'durga',
      poojaDate: day(9), bookingClosesAt: new Date(Date.now() + 8 * 86_400_000), order: 0,
      about: 'Sample pooja shipped so the screens are not empty. Edit or delete it in the dashboard.',
      packages: [pk('individual', 'Individual', 1, 551, 0), pk('partner', 'Partner', 2, 851, 1), pk('family', 'Family', 4, 1251, 2), pk('extended', 'Extended family', 6, 1651, 3)],
    },
    {
      ...base, slug: 'sample-rudrabhishek', title: `${SAMPLE}Rudrabhishek`, titleHi: 'रुद्राभिषेक', tagline: 'Sample content - replace or delete from the dashboard',
      place: 'Ujjain', tithi: 'Pradosh', deitySlug: 'shiva', poojaDate: day(5), bookingClosesAt: new Date(Date.now() + 4 * 86_400_000), order: 1,
      packages: [pk('individual', 'Individual', 1, 351, 0), pk('family', 'Family', 4, 951, 1)],
    },
    {
      ...base, slug: 'sample-daily-archana', title: `${SAMPLE}Daily Archana`, titleHi: 'दैनिक अर्चना', tagline: 'Sample content - performed every day',
      place: 'Varanasi', deitySlug: 'ganesh', poojaDate: null, order: 2, prasadAvailable: false, prasadFeeCoins: 0,
      packages: [pk('individual', 'Individual', 1, 151, 0)],
    },
  ];
};

/** Module seed: sevas become poojas on a database that has none; samples only when that found nothing. */
export async function seedPoojas() {
  if ((await Pooja.countDocuments()) > 0) return;
  if ((await Seva.countDocuments()) > 0) {
    const { created } = await importSevas();
    if (created > 0) return;
  }
  await Pooja.insertMany(samples());
}
