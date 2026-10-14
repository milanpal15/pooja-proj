import mongoose from 'mongoose';

import { ctx } from '../../lib/context.js';
import { HttpError } from '../../lib/http-error.js';
import { Booking } from '../bookings/booking.model.js';
import { PoojaReview } from './review.model.js';

const iso = (d) => (d ? new Date(d).toISOString() : null);
const oid = (id) => mongoose.isValidObjectId(id);

/**
 * `GET /api/poojas/:slug/reviews?limit&before` - the visible reviews of a pooja (public, no session). Whether the pooja exists is asked of
 * the catalog (cached 15 s; catalog unreachable = assume it does, so an unknown slug yields an empty list instead of a 404).
 */
export async function reviewsPublic(slug, { limit, before } = {}) {
  const exists = typeof slug === 'string' && (await ctx.catalog.poojaExists(slug));
  if (!exists) throw new HttpError(404, 'not_found', 'Pooja not found.');
  const q = { poojaSlug: slug, hidden: false };
  if (before) {
    const d = new Date(before);
    if (Number.isNaN(d.getTime())) throw new HttpError(400, 'bad_before', 'before must be an ISO date.');
    q.createdAt = { $lt: d };
  }
  const rows = await PoojaReview.find(q).sort({ createdAt: -1, _id: -1 }).limit(Math.min(Math.max(Number(limit) || 20, 1), 50)).lean();
  return rows.map((r) => ({ id: String(r._id), name: r.name || 'Devotee', rating: r.rating, text: r.text || '', createdAt: r.createdAt, packageName: r.packageName || '' }));
}

/**
 * The two booking-derived numbers the catalog shows but does not own (docs/MICROSERVICES.md section 2, `catalog -> orders`):
 *   bookingCount  bookings whose status is not `cancelled`
 *   rating        mean of the VISIBLE (not hidden) reviews, one decimal place, and their count; null when there are none
 * `{ "<poojaSlug>": { bookingCount, rating: { avg, count } | null } }` - the shape the monolith's `GET /internal/orders/pooja-stats` always had.
 */
export async function poojaStats() {
  const [counts, ratings] = await Promise.all([
    Booking.aggregate([
      { $match: { status: { $ne: 'cancelled' }, poojaSlug: { $exists: true } } },
      { $group: { _id: '$poojaSlug', n: { $sum: 1 } } },
    ]),
    PoojaReview.aggregate([
      { $match: { hidden: false } },
      { $group: { _id: '$poojaSlug', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]),
  ]);
  const stats = {};
  for (const c of counts) if (c._id) stats[c._id] = { bookingCount: c.n, rating: null };
  for (const r of ratings) {
    if (!r._id) continue;
    stats[r._id] ??= { bookingCount: 0, rating: null };
    stats[r._id].rating = { avg: Math.round(r.avg * 10) / 10, count: r.count };
  }
  return stats;
}

/* ───────────────────────────────────────────────────────────────── admin ── */

const reviewRow = (r) => ({
  id: String(r._id), bookingRef: r.bookingRef, poojaTitle: r.poojaTitle, rating: r.rating, text: r.text || '', hidden: !!r.hidden,
  edited: !!r.edited, editedAt: r.editedAt ? iso(r.editedAt) : null, createdAt: iso(r.createdAt), uid: r.uid,
});

export async function listReviews({ hidden } = {}) {
  const filter = {};
  if (hidden === 'true' || hidden === true) filter.hidden = true;
  if (hidden === 'false' || hidden === false) filter.hidden = false;
  const rows = await PoojaReview.find(filter).sort({ createdAt: -1, _id: -1 }).limit(300).lean();
  const who = await ctx.identity.whoByUid(rows.map((r) => r.uid));
  return rows.map((r) => ({ ...reviewRow(r), who: who.get(r.uid) || r.uid }));
}

/**
 * Moderate a review: hide/unhide and/or correct its text. Rating, first name, booking link and uid are never touched, whatever else is in the
 * body. The devotee's own words are kept the first time an operator edits (`originalText`, admin-only).
 */
export async function moderateReview(id, body) {
  const hasHidden = body?.hidden !== undefined;
  const hasText = body?.text !== undefined;
  if (!hasHidden && !hasText) throw new HttpError(400, 'invalid_review', 'Send hidden and/or text.');
  if (hasHidden && typeof body.hidden !== 'boolean') throw new HttpError(400, 'invalid_review', 'hidden must be true or false.');
  if (hasText && (typeof body.text !== 'string' || body.text.trim().length > 500)) {
    throw new HttpError(400, 'invalid_review', 'Review text must be a string of at most 500 characters.');
  }
  const cur = oid(id) ? await PoojaReview.findById(id).lean() : null;
  if (!cur) throw new HttpError(404, 'not_found', 'Review not found.');
  const $set = {};
  if (hasHidden) $set.hidden = body.hidden;
  if (hasText) {
    const text = body.text.trim();
    if (text !== (cur.text || '')) {
      $set.text = text;
      $set.edited = true;
      $set.editedAt = new Date();
      if (cur.originalText === undefined || cur.originalText === null) $set.originalText = cur.text || '';
    }
  }
  const r = Object.keys($set).length ? await PoojaReview.findByIdAndUpdate(id, { $set }, { new: true }).lean() : cur;
  return reviewRow(r);
}
