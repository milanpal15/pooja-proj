import mongoose from 'mongoose';

import { HttpError } from '../../../lib/http-error.js';
import { MAX_HTML_BYTES, sanitizeHtmlFragment, withinHtmlLimit } from '../../home/html-sanitizer.js';
import { heroHref, TARGET_TYPES } from './hero-target.js';
import { HeroSlide } from '../models/hero-slide.model.js';

const date = (v, field) => {
  if (v === null || v === '' || v === undefined) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, 'bad_date', `${field} is not a valid date.`);
  return d;
};

function cleanTarget(t) {
  if (t === null || t === '') return { type: 'none', ref: '' };
  if (typeof t !== 'object' || Array.isArray(t)) throw new HttpError(400, 'bad_target', 'target must be {type, ref}.');
  const type = t.type;
  if (!TARGET_TYPES.includes(type)) throw new HttpError(400, 'bad_target', `target.type must be one of ${TARGET_TYPES.join(', ')}.`);
  const ref = typeof t.ref === 'string' ? t.ref.trim() : '';
  if (['pooja', 'chadhava', 'temple', 'link'].includes(type) && !ref) {
    throw new HttpError(400, 'bad_target', `A ${type} target needs a ref.`);
  }
  if (type === 'link' && !heroHref({ type, ref })) throw new HttpError(400, 'bad_target', 'A link target must be an https URL.');
  if (['pooja', 'chadhava', 'temple'].includes(type) && !/^[a-z0-9][a-z0-9_-]*$/i.test(ref)) {
    throw new HttpError(400, 'bad_target', `A ${type} ref must be a slug.`);
  }
  return { type, ref: ['pooja', 'chadhava', 'temple', 'link'].includes(type) ? ref : '' };
}

/**
 * Hero slides keep the generic CRUD, but every write passes through here:
 * the HTML is sanitised before it is stored and the `kind` rules are enforced
 * on the merged document (docs/POOJA_AND_HOME.md §1.2).
 */
export function prepareHero(body = {}, existing = null) {
  const out = { ...body };
  delete out._id;
  for (const k of ['html', 'htmlHi']) {
    if (out[k] === undefined) continue;
    if (!withinHtmlLimit(out[k])) throw new HttpError(400, 'html_too_large', `${k} is over ${MAX_HTML_BYTES / 1024} KB.`);
    out[k] = sanitizeHtmlFragment(out[k]);
  }
  if (out.startsAt !== undefined) out.startsAt = date(out.startsAt, 'startsAt');
  if (out.endsAt !== undefined) out.endsAt = date(out.endsAt, 'endsAt');
  if (out.kind !== undefined && !['banner', 'html'].includes(out.kind)) {
    throw new HttpError(400, 'bad_kind', 'kind must be "banner" or "html".');
  }
  for (const [k, max] of [['title', 80], ['titleHi', 80], ['tag', 24], ['tagHi', 24], ['subtitle', 120], ['subtitleHi', 120], ['ctaLabel', 24], ['ctaLabelHi', 24]]) {
    if (out[k] === undefined || out[k] === null) continue;
    if (typeof out[k] !== 'string') throw new HttpError(400, 'bad_slide', `${k} must be text.`);
    out[k] = out[k].trim();
    if ([...out[k]].length > max) throw new HttpError(400, 'bad_slide', `${k} is over ${max} characters.`);
  }
  if (out.language !== undefined && !['all', 'hi', 'en'].includes(out.language)) {
    throw new HttpError(400, 'bad_language', 'language must be "all", "hi" or "en".');
  }
  if (out.target !== undefined) out.target = cleanTarget(out.target);
  const merged = { ...(existing ?? {}), ...out };
  const kind = merged.kind || 'banner';

  if (kind === 'html' && !String(merged.html ?? '').trim()) {
    throw new HttpError(400, 'html_required', 'An HTML slide needs html.');
  }
  // No picture is fine: the app draws a toned gradient behind the text, as the dashboard preview does.
  if (kind === 'banner' && !String(merged.title ?? '').trim()) {
    throw new HttpError(400, 'title_required', 'A slide needs a title.');
  }
  return out;
}

/** `PUT /hero/order` { ids } -> order 10, 20, ... in that sequence (ids not listed keep their place after). */
function heroRoutes(r) {
  r.put('/order', async (req, res) => {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || ids.length > 500 || new Set(ids.map(String)).size !== ids.length || !ids.every((i) => mongoose.isValidObjectId(i))) {
      return res.status(400).json({ error: 'ids must be a list of distinct slide ids.', code: 'bad_ids' });
    }
    await HeroSlide.bulkWrite(ids.map((id, i) => ({ updateOne: { filter: { _id: id }, update: { $set: { order: (i + 1) * 10 } } } })));
    const rows = await HeroSlide.find().sort({ order: 1, createdAt: 1 }).lean();
    res.json(rows.map(heroAdminView));
  });
}

/** Admin read shape: stored row plus the `href` its target resolves to. */
export function heroAdminView(row) {
  const href = row.target ? heroHref(row.target) : row.href;
  return { ...row, href: href ?? '' };
}

export default { path: '/hero', name: 'HeroSlide', Model: HeroSlide, prepare: prepareHero, view: heroAdminView, routes: heroRoutes };
