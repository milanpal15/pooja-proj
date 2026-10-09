import mongoose from 'mongoose';

import { asyncRouter } from '../../lib/async-handler.js';
import { HttpError, httpErrorHandler } from '../../lib/http-error.js';
import { Pooja } from './pooja.model.js';
import { cleanPooja } from './pooja.validate.js';
import * as svc from './pooja.service.js';

const dup = (e) => {
  if (e?.code === 11000) throw new HttpError(409, 'duplicate_slug', 'A pooja with that slug already exists.');
  throw e;
};

/** Poojas and their packages. See docs/POOJA_AND_HOME.md §2. */
export function poojaRouters() {
  const pub = asyncRouter();
  const admin = asyncRouter();

  pub.get('/poojas', async (req, res) => res.json(await svc.listPublic(req.query)));
  pub.get('/poojas/:slug', async (req, res) => res.json({ pooja: await svc.detailPublic(req.params.slug) }));
  pub.get('/poojas/:slug/reviews', async (req, res) => res.json({ reviews: await svc.reviewsPublic(req.params.slug, req.query) }));

  admin.get('/admin/poojas', async (_req, res) => res.json(await svc.adminRows()));

  admin.post('/admin/poojas', async (req, res) => {
    const doc = await Pooja.create(cleanPooja(req.body)).catch(dup);
    res.status(201).json(svc.adminView(doc.toObject(), 0));
  });

  // Before `/:id`, or "import-sevas" would be read as an id.
  admin.post('/admin/poojas/import-sevas', async (_req, res) => res.json(await svc.importSevas()));

  const load = async (id) => {
    const p = mongoose.isValidObjectId(id) ? await Pooja.findById(id).lean() : null;
    if (!p) throw new HttpError(404, 'not_found', 'Pooja not found.');
    return p;
  };

  admin.get('/admin/poojas/:id', async (req, res) => {
    const p = await load(req.params.id);
    res.json(svc.adminView(p, await svc.bookingCountFor(p.slug)));
  });

  admin.put('/admin/poojas/:id', async (req, res) => {
    const p = await load(req.params.id);
    const data = cleanPooja(req.body, p);
    const saved = await Pooja.findByIdAndUpdate(p._id, { $set: data }, { new: true }).lean().catch(dup);
    res.json(svc.adminView(saved, await svc.bookingCountFor(saved.slug)));
  });

  admin.delete('/admin/poojas/:id', async (req, res) => {
    if (mongoose.isValidObjectId(req.params.id)) await Pooja.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  });

  pub.use(httpErrorHandler);
  admin.use(httpErrorHandler);
  return { public: pub, admin };
}
