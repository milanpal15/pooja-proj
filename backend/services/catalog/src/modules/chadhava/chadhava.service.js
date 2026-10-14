import { ctx } from '../../lib/context.js';
import { HttpError } from '../../lib/http-error.js';
import { inWindow } from '../../lib/window.js';
import { Temple } from '../../models.js';
import { ChadhavaCategory, ChadhavaListing, Offering } from './chadhava.model.js';

const iso = (d) => (d ? new Date(d).toISOString() : null);
export const liveOfferings = (l) => (l.offerings ?? []).filter((o) => o.enabled !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

/** The old flat catalogue, still served until the dashboard drops its page. */
export async function catalogue() {
  const [rows, serviceFee, minAmount] = await Promise.all([
    Offering.find({ enabled: true }).sort({ order: 1, createdAt: 1 }).lean(),
    ctx.settings.getNumber('chadhavaServiceFee', 5),
    ctx.settings.getNumber('chadhavaMinAmount', 1),
  ]);
  return {
    offerings: rows.map((o) => ({ key: o.key, name: o.name, nameHi: o.nameHi || '', coins: o.coins, order: o.order })),
    serviceFee,
    minAmount,
  };
}

/* ───────────────────────────────────────────────────────────────── public ── */

async function templeNames(rows) {
  const temples = await Temple.find({ slug: { $in: [...new Set(rows.map((r) => r.templeSlug).filter(Boolean))] } }).select('slug name').lean();
  return new Map(temples.map((t) => [t.slug, t.name]));
}

const cardView = (l, temples) => {
  const coins = liveOfferings(l).map((o) => o.coins);
  return {
    slug: l.slug, title: l.title, titleHi: l.titleHi || '', banner: l.banner || '', templeName: temples.get(l.templeSlug) || '',
    place: l.place || '', startsAt: iso(l.startsAt), endsAt: iso(l.endsAt), category: l.category || '',
    summary: l.summary || '', summaryHi: l.summaryHi || '', fromCoins: coins.length ? Math.min(...coins) : 0,
  };
};

export async function listListings({ category } = {}, now = new Date()) {
  const [rows, cats] = await Promise.all([
    ChadhavaListing.find({ enabled: true }).sort({ order: 1, createdAt: 1 }).lean(),
    ChadhavaCategory.find({ enabled: true }).sort({ order: 1, createdAt: 1 }).lean(),
  ]);
  const open = rows.filter((l) => inWindow(l, now) && liveOfferings(l).length > 0 && (typeof category !== 'string' || !category || l.category === category));
  const temples = await templeNames(open);
  return {
    listings: open.map((l) => cardView(l, temples)),
    categories: cats.map((c) => ({ slug: c.slug, name: c.name, nameHi: c.nameHi || '', image: c.image || '' })),
  };
}

export async function listingDetail(slug, now = new Date()) {
  const l = typeof slug === 'string' ? await ChadhavaListing.findOne({ slug, enabled: true }).lean() : null;
  if (!l) throw new HttpError(404, 'not_found', 'Listing not found.');
  const temples = await templeNames([l]);
  return {
    ...cardView(l, temples),
    open: inWindow(l, now),
    gallery: l.gallery ?? [], intro: l.intro || '', introHi: l.introHi || '',
    howItWorks: (l.howItWorks ?? []).map((h) => ({ text: h.text || '', textHi: h.textHi || '' })),
    offerings: liveOfferings(l).map((o) => ({
      key: o.key, title: o.title || '', titleHi: o.titleHi || '', desc: o.desc || '', descHi: o.descHi || '', coins: o.coins,
      image: o.image || '', label: o.label || '', labelHi: o.labelHi || '',
    })),
  };
}
