import { BLOCK_NAMES } from '../events/validate.js';
import { HttpError } from '../lib/http-error.js';
import { Event, EventType } from '../models/index.js';
import { asyncRouter, duplicateAsConflict, fieldReader, isObj, objectId, withId } from './simple-crud.js';

const DEFAULT_KEYS = [...BLOCK_NAMES, 'blocks', 'language', 'tags', 'theme'];

export function normalizeType(input, existing) {
  const r = fieldReader('bad_event_type', input);
  const name = r.str('name', { max: 80, required: true });
  const out = {
    slug: existing ? existing.slug : r.slug('slug', name),
    name, nameHi: r.str('nameHi', { max: 80 }), color: r.hex('color') || '#7A1F2B', description: r.str('description', { max: 400 }),
  };
  const g = r.src.gradient;
  if (g !== undefined && g !== null && g !== '') {
    if (!Array.isArray(g) || g.length !== 2 || g.some((x) => typeof x !== 'string' || !/^#[0-9a-f]{6}$/i.test(x))) r.add('gradient', 'Must be two colours.');
    else out.gradient = g;
  }
  const d = r.src.defaults;
  if (d !== undefined && d !== null) {
    if (!isObj(d)) r.add('defaults', 'Must be an object.');
    else out.defaults = Object.fromEntries(Object.entries(d).filter(([k]) => DEFAULT_KEYS.includes(k)));
  } else out.defaults = {};
  const order = r.src.order;
  if (order !== undefined && order !== null && order !== '') {
    if (!Number.isInteger(order) || order < 0 || order > 10000) r.add('order', 'Must be a whole number from 0.');
    else out.order = order;
  }
  const en = r.src.enabled;
  if (en !== undefined) { if (typeof en !== 'boolean') r.add('enabled', 'Must be true or false.'); else out.enabled = en; }
  r.finish();
  return out;
}

export const typeRoutes = () => {
  const router = asyncRouter();
  router.get('/', async (_req, res) => res.json((await EventType.find().sort({ order: 1, createdAt: 1 }).lean()).map(withId)));

  router.post('/', async (req, res) => {
    const doc = normalizeType(req.body);
    try {
      res.status(201).json(withId(await EventType.create(doc)));
    } catch (e) { duplicateAsConflict(e); }
  });

  router.put('/:id', async (req, res) => {
    const existing = await EventType.findById(objectId(req.params.id)).lean();
    if (!existing) throw new HttpError(404, 'not_found', 'Event type not found.');
    const body = isObj(req.body) ? req.body : {};
    // A changed slug is allowed only while no event uses the type.
    const wantsSlug = typeof body.slug === 'string' && body.slug.trim() && body.slug.trim() !== existing.slug;
    if (wantsSlug && (await Event.exists({ typeSlug: existing.slug }))) throw new HttpError(409, 'in_use', 'Events use this type, so its slug cannot change.');
    const merged = { ...existing, ...body };
    const doc = normalizeType(merged, wantsSlug ? null : existing);
    try {
      const out = await EventType.findByIdAndUpdate(existing._id, { $set: doc, ...(doc.gradient ? {} : { $unset: { gradient: '' } }) }, { new: true, runValidators: true });
      res.json(withId(out));
    } catch (e) { duplicateAsConflict(e); }
  });

  router.delete('/:id', async (req, res) => {
    const existing = await EventType.findById(objectId(req.params.id)).lean();
    if (!existing) throw new HttpError(404, 'not_found', 'Event type not found.');
    if (await Event.exists({ typeSlug: existing.slug })) throw new HttpError(409, 'in_use', 'Events use this type. Disable it instead of deleting it.');
    await EventType.deleteOne({ _id: existing._id });
    res.json({ ok: true });
  });
  return router;
};
