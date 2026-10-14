import { redactWho } from '../../access/redact.js';
import { asyncRouter } from '../../lib/async-handler.js';
import { routeUnlessCatalog as owned, unlessCatalog } from '../../lib/catalog-guard.js';
import { routeUnlessOrders as ordersOwn } from '../../lib/orders-guard.js';
import { HttpError, httpErrorHandler } from '../../lib/http-error.js';
import { crud } from '../content/crud.factory.js';
import { ChadhavaCategory, ChadhavaListing, Offering } from './chadhava.model.js';
import { prepareCategory, prepareListing } from './chadhava.validate.js';
import * as svc from './chadhava.service.js';

const FIELDS = ['key', 'name', 'nameHi', 'coins', 'order', 'enabled'];

/** Whitelist + validate an offering body; `base` is the stored row on update. */
function clean(body, base = {}) {
  const o = { ...base };
  for (const k of FIELDS) if (body?.[k] !== undefined) o[k] = body[k];
  if (typeof o.key !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,39}$/.test(o.key)) {
    throw new HttpError(400, 'bad_offering', 'Key must be lowercase letters, digits, - or _.');
  }
  if (typeof o.name !== 'string' || !o.name.trim()) throw new HttpError(400, 'bad_offering', 'Name is required.');
  if (!Number.isInteger(o.coins) || o.coins < 0) throw new HttpError(400, 'bad_offering', 'Coins must be a whole number, zero or more.');
  return o;
}

/** e-Chadhava listings and orders, paid in coins. See docs/POOJA_AND_HOME.md §4. */
export function chadhavaRouters({ requireAuth }) {
  const pub = asyncRouter();
  const devotee = asyncRouter();
  const admin = asyncRouter();

  pub.get('/chadhava/offerings', owned, async (_req, res) => res.json(await svc.catalogue()));

  pub.get('/chadhava/listings', owned, async (req, res) => res.json(await svc.listListings(req.query)));
  pub.get('/chadhava/listings/:slug', owned, async (req, res) => res.json({ listing: await svc.listingDetail(req.params.slug) }));

  // The free-amount chadhava is gone; old app builds get a clear answer rather than a 404.
  devotee.post('/chadhava', ordersOwn, (_req, res) => res.status(410).json({ error: 'This chadhava is no longer offered. Please update the app.', code: 'gone' }));

  devotee.post('/chadhava/orders', ordersOwn, requireAuth, async (req, res) => {
    const out = await svc.placeOrder(req.token.uid, req.body);
    res.status(out.created ? 201 : 200).json({ order: out.order, balance: out.balance });
  });
  devotee.get('/chadhava/orders', ordersOwn, requireAuth, async (req, res) => res.json({ orders: await svc.listForDevotee(req.token.uid) }));
  devotee.post('/chadhava/orders/:id/cancel', ordersOwn, requireAuth, async (req, res) => res.json(await svc.cancelOrder(req.token.uid, req.params.id)));

  // The catalogue is area `content` (editors may edit it); the order list is area `orders`.
  admin.get('/admin/offerings', owned, async (_req, res) => res.json(await Offering.find().sort({ order: 1, createdAt: 1 }).lean()));

  admin.post('/admin/offerings', owned, async (req, res) => {
    const data = clean(req.body);
    try {
      res.status(201).json(await Offering.create(data));
    } catch (e) {
      if (e?.code === 11000) throw new HttpError(409, 'duplicate_key', 'An offering with that key already exists.');
      throw e;
    }
  });

  admin.put('/admin/offerings/:id', owned, async (req, res) => {
    const existing = /^[0-9a-f]{24}$/i.test(req.params.id) ? await Offering.findById(req.params.id).lean() : null;
    if (!existing) throw new HttpError(404, 'offering_not_found', 'Offering not found.');
    const data = clean(req.body, existing);
    delete data._id;
    try {
      res.json(await Offering.findByIdAndUpdate(existing._id, { $set: data }, { new: true }).lean());
    } catch (e) {
      if (e?.code === 11000) throw new HttpError(409, 'duplicate_key', 'An offering with that key already exists.');
      throw e;
    }
  });

  admin.delete('/admin/offerings/:id', owned, async (req, res) => {
    if (/^[0-9a-f]{24}$/i.test(req.params.id)) await Offering.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  });

  // CATALOG_URL set (phase 3): the public listings, the catalogue, and these definition routes live in the catalog service and
  // answer 404 here (`owned`); the orders (devotee + admin) answer 404 here once ORDERS_URL is set (phase 5, `ordersOwn`).
  // Listings and categories are area `content` (generic CRUD with validation); orders are area `orders`.
  admin.use('/admin/chadhava-listings', unlessCatalog(crud('ChadhavaListing', ChadhavaListing, undefined, { prepare: prepareListing })));
  admin.use('/admin/chadhava-categories', unlessCatalog(crud('ChadhavaCategory', ChadhavaCategory, undefined, { prepare: prepareCategory })));

  admin.get('/admin/chadhava-orders', ordersOwn, async (req, res) => res.json({ orders: redactWho(await svc.listOrdersForAdmin(req.query.limit), req) }));
  admin.put('/admin/chadhava-orders/:id/status', ordersOwn, async (req, res) => res.json({ order: await svc.markOffered(req.params.id, req.body?.status) }));

  pub.use(httpErrorHandler);
  devotee.use(httpErrorHandler);
  admin.use(httpErrorHandler);
  return { public: pub, devotee, admin };
}
