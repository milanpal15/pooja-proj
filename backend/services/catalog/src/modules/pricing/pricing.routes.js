import { asyncRouter } from '../../lib/async-handler.js';
import { HttpError, httpErrorHandler } from '../../lib/http-error.js';
import { ChadhavaListing, Pooja, Temple } from '../../models.js';

/**
 * The PRICED SNAPSHOT the orders side buys from (docs/MICROSERVICES.md section 2: orders -> catalog). A booking or a
 * chadhava order is priced from exactly this answer, server-side, at the moment of purchase - a price sent by a client is
 * never accepted, and the caller must not cache it for a purchase (catalog down = the purchase is refused, not guessed).
 *
 * Dates are ISO strings; packages / offerings are the stored rows (disabled ones included, `enabled` says which), so the
 * caller applies the SAME eligibility rules it always did (enabled, published, window, bookable, ...).
 * Only an ENABLED pooja / listing is returned; anything else is a 404 `not_found` - the same answer the monolith's
 * `findOne({ slug, enabled: true })` gave.
 */
export const pricingRoutes = asyncRouter();

const iso = (d) => (d ? new Date(d).toISOString() : null);

pricingRoutes.get('/pricing/pooja/:slug', async (req, res) => {
  const p = await Pooja.findOne({ slug: req.params.slug, enabled: true }).lean();
  if (!p) throw new HttpError(404, 'not_found', 'That pooja is not available.');
  const t = p.templeSlug ? await Temple.findOne({ slug: p.templeSlug }).select('slug name location').lean() : null;
  res.json({
    pooja: {
      slug: p.slug, title: p.title, titleHi: p.titleHi ?? null, enabled: p.enabled !== false,
      templeSlug: p.templeSlug ?? null, place: p.place ?? '', poojaDate: p.poojaDate ?? null,
      publishAt: iso(p.publishAt), bookingClosesAt: iso(p.bookingClosesAt), cancelHours: p.cancelHours ?? 24,
      prasadAvailable: !!p.prasadAvailable, prasadFeeCoins: p.prasadFeeCoins ?? 0,
      packages: (p.packages ?? []).map((k) => ({
        key: k.key, name: k.name ?? null, nameHi: k.nameHi ?? null, persons: k.persons, coins: k.coins,
        order: k.order ?? 0, enabled: k.enabled !== false,
      })),
    },
    temple: t ? { slug: t.slug, name: t.name || '', location: t.location || '' } : null,
    at: new Date().toISOString(),
  });
});

pricingRoutes.get('/pricing/chadhava/:slug', async (req, res) => {
  const l = await ChadhavaListing.findOne({ slug: req.params.slug, enabled: true }).lean();
  if (!l) throw new HttpError(404, 'not_found', 'That chadhava is not available.');
  const t = l.templeSlug ? await Temple.findOne({ slug: l.templeSlug }).select('slug name').lean() : null;
  res.json({
    listing: {
      slug: l.slug, title: l.title, titleHi: l.titleHi ?? null, templeSlug: l.templeSlug ?? null,
      startsAt: iso(l.startsAt), endsAt: iso(l.endsAt), enabled: l.enabled !== false,
      offerings: (l.offerings ?? []).map((o) => ({ key: o.key, title: o.title ?? null, coins: o.coins, order: o.order ?? 0, enabled: o.enabled !== false })),
    },
    temple: t ? { slug: t.slug, name: t.name || '' } : null,
    at: new Date().toISOString(),
  });
});

/** Cheap existence check for the (monolith-owned) public reviews route: `{ exists }`, published and enabled only. */
pricingRoutes.get('/pricing/pooja/:slug/exists', async (req, res) => {
  const p = await Pooja.findOne({ slug: req.params.slug, enabled: true }).select('publishAt').lean();
  res.json({ exists: !!p && (!p.publishAt || new Date(p.publishAt) <= new Date()) });
});

pricingRoutes.use(httpErrorHandler);
