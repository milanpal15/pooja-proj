import mongoose from 'mongoose';

import { asyncRouter } from '../../lib/async-handler.js';
import { HttpError, httpErrorHandler } from '../../lib/http-error.js';
import { BADGES, HomeSection, LAYOUTS, SOURCES, TONES } from './home.model.js';

const FIELDS = ['key', 'source', 'title', 'titleHi', 'tone', 'layout', 'items', 'footerLabel', 'footerLabelHi', 'footerHref', 'startsAt', 'endsAt', 'order', 'enabled'];
const ITEM_FIELDS = ['title', 'titleHi', 'subtitle', 'subtitleHi', 'icon', 'image', 'href', 'badge', 'flag', 'deitySlug'];
const bad = (message) => new HttpError(400, 'bad_section', message);

const when = (v, field) => {
  if (v === null || v === undefined || v === '') return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw bad(`${field} is not a valid date.`);
  return d;
};

function cleanItem(raw) {
  if (!raw || typeof raw !== 'object') throw bad('Each item must be an object.');
  const it = {};
  for (const k of ITEM_FIELDS) {
    if (raw[k] === undefined || raw[k] === null) continue;
    if (typeof raw[k] !== 'string') throw bad(`Item ${k} must be text.`);
    it[k] = raw[k].trim().slice(0, 300);
  }
  if (it.badge !== undefined && !BADGES.includes(it.badge)) throw bad('Item badge must be new, soon, special or empty.');
  return it;
}

/** Whitelist + validate a section body; `base` is the stored row on update. */
export function cleanSection(body, base = {}) {
  const o = { ...base };
  for (const k of FIELDS) if (body?.[k] !== undefined) o[k] = body[k];
  if (typeof o.key !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,59}$/.test(o.key)) throw bad('Key must be lowercase letters, digits, - or _.');
  if (o.source !== undefined && !SOURCES.includes(o.source)) throw bad(`source must be one of: ${SOURCES.join(', ')}.`);
  if (o.tone !== undefined && !TONES.includes(o.tone)) throw bad(`tone must be one of: ${TONES.join(', ')}.`);
  if (o.layout !== undefined && !LAYOUTS.includes(o.layout)) throw bad(`layout must be one of: ${LAYOUTS.join(', ')}.`);
  if (o.items !== undefined) {
    if (!Array.isArray(o.items) || o.items.length > 60) throw bad('items must be a list of at most 60.');
    o.items = o.items.map(cleanItem);
  }
  o.startsAt = when(o.startsAt, 'startsAt');
  o.endsAt = when(o.endsAt, 'endsAt');
  if (o.startsAt && o.endsAt && o.endsAt <= o.startsAt) throw bad('endsAt must be after startsAt.');
  if (o.order !== undefined && !Number.isFinite(Number(o.order))) throw bad('order must be a number.');
  if (o.order !== undefined) o.order = Number(o.order);
  delete o._id; delete o.createdAt; delete o.updatedAt; delete o.__v;
  return o;
}

const oid = (id) => mongoose.isValidObjectId(id);
const dup = (e) => {
  if (e?.code === 11000) throw new HttpError(409, 'duplicate_key', 'A section with that key already exists.');
  throw e;
};

/** Dashboard side of the Home layout. See docs/POOJA_AND_HOME.md §1.2. */
export function homeRouters() {
  const admin = asyncRouter();

  admin.get('/admin/home-sections', async (_req, res) => res.json(await HomeSection.find().sort({ order: 1, createdAt: 1 }).lean()));

  admin.post('/admin/home-sections', async (req, res) => {
    const data = cleanSection(req.body);
    res.status(201).json(await HomeSection.create(data).catch(dup));
  });

  // Before `/:id`, or "order" would be read as an id.
  admin.put('/admin/home-sections/order', async (req, res) => {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || ids.length > 200 || !ids.every((i) => typeof i === 'string' && oid(i)) || new Set(ids).size !== ids.length) {
      throw new HttpError(400, 'bad_order', 'ids must be a list of distinct section ids.');
    }
    const known = await HomeSection.countDocuments({ _id: { $in: ids } });
    if (known !== ids.length) throw new HttpError(404, 'not_found', 'One of those sections does not exist.');
    await HomeSection.bulkWrite(ids.map((id, i) => ({ updateOne: { filter: { _id: id }, update: { $set: { order: (i + 1) * 10 } } } })));
    res.json(await HomeSection.find().sort({ order: 1, createdAt: 1 }).lean());
  });

  admin.put('/admin/home-sections/:id', async (req, res) => {
    const existing = oid(req.params.id) ? await HomeSection.findById(req.params.id).lean() : null;
    if (!existing) throw new HttpError(404, 'not_found', 'Section not found.');
    const data = cleanSection(req.body, existing);
    res.json(await HomeSection.findByIdAndUpdate(existing._id, { $set: data }, { new: true }).lean().catch(dup));
  });

  admin.delete('/admin/home-sections/:id', async (req, res) => {
    if (oid(req.params.id)) await HomeSection.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  });

  admin.use(httpErrorHandler);
  return { admin };
}
