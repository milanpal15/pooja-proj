import { HttpError } from '../lib/http-error.js';
import { Badge, Event, UserBadge } from '../models/index.js';
import { asyncRouter, duplicateAsConflict, fieldReader, isObj, objectId, withId } from './simple-crud.js';

export function normalizeBadge(input, existing) {
  const r = fieldReader('bad_badge', input);
  const name = r.str('name', { max: 80, required: true });
  const out = {
    slug: existing ? existing.slug : r.slug('slug', name),
    name, nameHi: r.str('nameHi', { max: 80 }), art: r.media('art'), description: r.str('description', { max: 400 }),
  };
  r.finish();
  return out;
}

const inUse = async (slug) => !!((await Event.exists({ 'rewards.badgeSlug': slug })) || (await UserBadge.exists({ badgeSlug: slug })));

export const badgeRoutes = () => {
  const router = asyncRouter();
  router.get('/', async (_req, res) => res.json((await Badge.find().sort({ name: 1 }).lean()).map(withId)));

  router.post('/', async (req, res) => {
    const doc = normalizeBadge(req.body);
    try {
      res.status(201).json(withId(await Badge.create(doc)));
    } catch (e) { duplicateAsConflict(e); }
  });

  router.put('/:id', async (req, res) => {
    const existing = await Badge.findById(objectId(req.params.id)).lean();
    if (!existing) throw new HttpError(404, 'not_found', 'Badge not found.');
    const body = isObj(req.body) ? req.body : {};
    const wantsSlug = typeof body.slug === 'string' && body.slug.trim() && body.slug.trim() !== existing.slug;
    if (wantsSlug && (await inUse(existing.slug))) throw new HttpError(409, 'in_use', 'Events use this badge, so its slug cannot change.');
    const doc = normalizeBadge({ ...existing, ...body }, wantsSlug ? null : existing);
    try {
      res.json(withId(await Badge.findByIdAndUpdate(existing._id, { $set: doc }, { new: true })));
    } catch (e) { duplicateAsConflict(e); }
  });

  router.delete('/:id', async (req, res) => {
    const existing = await Badge.findById(objectId(req.params.id)).lean();
    if (!existing) throw new HttpError(404, 'not_found', 'Badge not found.');
    if (await inUse(existing.slug)) throw new HttpError(409, 'in_use', 'A reward or a devotee uses this badge.');
    await Badge.deleteOne({ _id: existing._id });
    res.json({ ok: true });
  });
  return router;
};
