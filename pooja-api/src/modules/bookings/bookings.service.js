import crypto from 'node:crypto';
import mongoose from 'mongoose';

import { HttpError } from '../../lib/http-error.js';
import { dayStart, validDate } from '../../lib/ist.js';
import { notifyDevotee } from '../../lib/push.js';
import { Booking, Pooja, PoojaReview, Temple, User } from '../../models.js';
import { enabledPackages, isBookable } from '../poojas/pooja.service.js';
import * as wallet from '../wallet/wallet.service.js';

export { validDate };

const HOUR = 3_600_000;
const FLOW = ['booked', 'sankalp', 'performed'];
const oid = (id) => mongoose.isValidObjectId(id);

/**
 * Last moment a cancellation is refunded: `cancelHours` before the pooja day
 * begins (IST). An every-day pooja has no day, so it counts back from the
 * booking window's close; with neither there is no cut-off. Fixed at booking
 * time, like the price.
 */
export function cancelDeadline(pooja) {
  const hours = (pooja.cancelHours ?? 24) * HOUR;
  if (pooja.poojaDate) return new Date(dayStart(pooja.poojaDate).getTime() - hours);
  if (pooja.bookingClosesAt) return new Date(new Date(pooja.bookingClosesAt).getTime() - hours);
  return null;
}

const iso = (d) => (d ? new Date(d).toISOString() : null);
const canCancel = (b, now) => b.status === 'booked' && (!b.cancelBy || now < new Date(b.cancelBy));

export function bookingView(b, now = new Date()) {
  const review = b.review?.rating ? { rating: b.review.rating, text: b.review.text || '', createdAt: iso(b.review.createdAt) } : null;
  return {
    id: String(b._id),
    bookingRef: b.bookingRef,
    kind: 'pooja',
    poojaSlug: b.poojaSlug || '',
    poojaTitle: b.poojaTitle || '',
    poojaTitleHi: b.poojaTitleHi || '',
    templeName: b.templeName || '',
    place: b.place || '',
    poojaDate: b.poojaDate ?? null,
    packageKey: b.packageKey || '',
    packageName: b.packageName || '',
    persons: b.persons ?? (b.names?.length || 0),
    names: (b.names ?? []).map((n) => ({ name: n.name || '', gotra: n.gotra || '' })),
    prasad: !!b.prasad,
    totalCoins: b.totalCoins ?? 0,
    packageCoins: b.packageCoins ?? 0,
    prasadCoins: b.prasadCoins ?? 0,
    status: b.status || 'booked',
    statusHistory: (b.statusHistory ?? []).map((h) => ({ status: h.status, at: iso(h.at) })),
    refunded: !!b.refunded,
    canCancel: canCancel(b, now),
    cancelBy: iso(b.cancelBy),
    review,
    canReview: b.status === 'performed' && !review,
    createdAt: iso(b.createdAt),
  };
}

// Unambiguous characters only (no 0/O, 1/I): a reference gets read out over the phone.
const REF_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newRef = () => `BKT-${Array.from({ length: 5 }, () => REF_CHARS[crypto.randomInt(REF_CHARS.length)]).join('')}`;

export async function listForDevotee(uid) {
  const rows = await Booking.find({ uid }).sort({ createdAt: -1 }).lean();
  return rows.map((b) => bookingView(b));
}

export async function getForDevotee(uid, id) {
  const b = oid(id) ? await Booking.findOne({ _id: id, uid }).lean() : null;
  if (!b) throw new HttpError(404, 'not_found', 'Booking not found.');
  return bookingView(b);
}

const invalidNames = (m) => new HttpError(400, 'invalid_names', m);

function cleanNames(raw, persons) {
  if (!Array.isArray(raw) || raw.length !== persons) throw invalidNames(`This package needs exactly ${persons} ${persons === 1 ? 'name' : 'names'}.`);
  return raw.map((n) => {
    const name = typeof n?.name === 'string' ? n.name.trim() : '';
    const gotra = n?.gotra === undefined || n?.gotra === null ? '' : typeof n.gotra === 'string' ? n.gotra.trim() : null;
    if (name.length < 2 || name.length > 60) throw invalidNames('Each name must be 2 to 60 characters.');
    if (gotra === null || gotra.length > 40) throw invalidNames('A gotra can be at most 40 characters.');
    return { name, gotra };
  });
}

function cleanAddress(a) {
  const f = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const out = { line1: f(a?.line1, 200), city: f(a?.city, 80), pincode: f(a?.pincode, 10) };
  if (!out.line1 || !out.city || !/^\d{6}$/.test(out.pincode)) {
    throw new HttpError(400, 'invalid_address', 'Prasad delivery needs an address line, a city and a 6-digit pincode.');
  }
  return out;
}

/**
 * Book and pay in one step.
 *
 * Everything priced comes from the database; the body supplies only WHAT, WHO
 * and the delivery address. Order matters: debit first (the money is the part
 * that can be refused), then write the booking, and if THAT fails return the
 * coins — the reverse order could leave a booking nobody paid for.
 */
export async function createBooking(uid, body) {
  const { poojaSlug, packageKey, requestId } = body ?? {};
  if (typeof requestId !== 'string' || requestId.length < 8 || requestId.length > 100) {
    throw new HttpError(400, 'bad_request_id', 'A request id is required.');
  }
  // A retry of a request that already succeeded returns that booking, untouched.
  const prior = await Booking.findOne({ uid, requestId });
  if (prior) return { booking: bookingView(prior), balance: await wallet.getBalance(uid), created: false };

  const pooja = typeof poojaSlug === 'string' ? await Pooja.findOne({ slug: poojaSlug, enabled: true }).lean() : null;
  if (!pooja || (pooja.publishAt && new Date(pooja.publishAt) > new Date())) throw new HttpError(404, 'not_found', 'That pooja is not available.');
  const pkg = enabledPackages(pooja).find((k) => k.key === packageKey);
  if (!pkg) throw new HttpError(404, 'not_found', 'That package is not available.');
  if (!isBookable(pooja)) throw new HttpError(409, 'booking_closed', 'Booking for this pooja has closed.');

  const names = cleanNames(body.names, pkg.persons);
  const prasad = body.prasad === true;
  if (prasad && !pooja.prasadAvailable) throw new HttpError(400, 'prasad_unavailable', 'Prasad delivery is not offered for this pooja.');
  const address = prasad ? cleanAddress(body.address) : undefined;

  const packageCoins = pkg.coins;
  const prasadCoins = prasad ? pooja.prasadFeeCoins ?? 0 : 0;
  const total = packageCoins + prasadCoins;

  const temple = pooja.templeSlug ? await Temple.findOne({ slug: pooja.templeSlug }).lean() : null;
  const d = await wallet.debit({
    uid, amount: total, type: 'booking_debit', refType: 'booking', idempotencyKey: `booking:${uid}:${requestId}`,
    note: `${pooja.title} - ${pkg.name || pkg.key}`,
  });

  const now = new Date();
  const fields = {
    uid, requestId, kind: 'pooja', poojaSlug: pooja.slug, poojaTitle: pooja.title, poojaTitleHi: pooja.titleHi,
    templeSlug: pooja.templeSlug, templeName: temple?.name || '', place: pooja.place || temple?.location || '',
    poojaDate: pooja.poojaDate ?? null, packageKey: pkg.key, packageName: pkg.name, packageNameHi: pkg.nameHi, persons: pkg.persons,
    names, prasad, address, packageCoins, prasadCoins, totalCoins: total, walletTxnId: String(d.txn._id),
    status: 'booked', statusHistory: [{ status: 'booked', at: now }], cancelBy: cancelDeadline(pooja),
    devoteeName: names[0].name, gotra: names[0].gotra,
  };

  for (let attempt = 0; ; attempt++) {
    try {
      const doc = await Booking.create({ ...fields, bookingRef: newRef() });
      return { booking: bookingView(doc), balance: d.balance, created: true };
    } catch (e) {
      if (e?.code === 11000 && e.keyPattern?.requestId) {
        // Two identical requests raced; the other one won. One charge (same key), one booking.
        const won = await Booking.findOne({ uid, requestId });
        if (won) return { booking: bookingView(won), balance: d.balance, created: false };
      }
      if (e?.code === 11000 && e.keyPattern?.bookingRef && attempt < 5) continue;
      await wallet
        .refund({ uid, amount: total, refType: 'booking', refId: requestId, idempotencyKey: `booking:${uid}:${requestId}:failed`, note: 'Booking could not be saved' })
        .catch((re) => console.error('✗ REFUND FAILED after booking write failure', requestId, re.message));
      throw e;
    }
  }
}

/**
 * Cancel while still `booked` and before `cancelBy`, refunding the coins. Safe to repeat.
 *
 * The booking is flagged cancelled in one conditional write, so two taps
 * cannot both decide to refund. The refund itself is keyed `booking:<id>:refund`,
 * so a crash between the flag and the refund is finished by the next call.
 */
export async function cancelBooking(uid, id, now = new Date()) {
  let b = oid(id) ? await Booking.findOne({ _id: id, uid }) : null;
  if (!b) throw new HttpError(404, 'not_found', 'Booking not found.');

  if (b.status !== 'cancelled') {
    if (!canCancel(b, now)) throw new HttpError(409, 'cannot_cancel', 'This booking can no longer be cancelled.');
    const flagged = await Booking.findOneAndUpdate(
      { _id: b._id, status: 'booked' },
      { $set: { status: 'cancelled', refunded: true }, $push: { statusHistory: { status: 'cancelled', at: now } } },
      { new: true },
    );
    b = flagged ?? (await Booking.findById(b._id));
    if (b.status !== 'cancelled') throw new HttpError(409, 'cannot_cancel', 'This booking can no longer be cancelled.');
  }

  const r = await wallet.refund({
    uid, amount: b.totalCoins, refType: 'booking', refId: String(b._id), idempotencyKey: `booking:${b._id}:refund`,
    note: `Cancelled ${b.poojaTitle}`,
  });
  return { booking: bookingView(b, now), balance: r.balance };
}

/** Review a performed booking, once. The moderated copy goes to PoojaReview. */
export async function reviewBooking(uid, id, body) {
  const rating = body?.rating;
  const text = body?.text === undefined || body?.text === null ? '' : body.text;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, 'invalid_review', 'Rating must be a whole number from 1 to 5.');
  if (typeof text !== 'string' || text.trim().length > 500) throw new HttpError(400, 'invalid_review', 'A review can be at most 500 characters.');

  const b = oid(id) ? await Booking.findOne({ _id: id, uid }) : null;
  if (!b) throw new HttpError(404, 'not_found', 'Booking not found.');
  if (b.status !== 'performed' || b.review?.rating) throw new HttpError(409, 'not_reviewable', 'This booking cannot be reviewed.');

  const user = await User.findOne({ uid }).select('name').lean();
  const first = String(user?.name || b.names?.[0]?.name || '').trim().split(/\s+/)[0] || 'Devotee';
  try {
    await PoojaReview.create({
      bookingId: String(b._id), bookingRef: b.bookingRef, uid, poojaSlug: b.poojaSlug, poojaTitle: b.poojaTitle,
      packageName: b.packageName, name: first.slice(0, 40), rating, text: text.trim(),
    });
  } catch (e) {
    if (e?.code === 11000) throw new HttpError(409, 'not_reviewable', 'This booking has already been reviewed.');
    throw e;
  }
  const saved = await Booking.findOneAndUpdate({ _id: b._id }, { $set: { review: { rating, text: text.trim(), createdAt: new Date() } } }, { new: true });
  return bookingView(saved);
}

/* ───────────────────────────────────────────────────────────────── admin ── */

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const whoMap = async (rows) => {
  const users = await User.find({ uid: { $in: [...new Set(rows.map((r) => r.uid))] } }).select('uid name contact').lean();
  return new Map(users.map((u) => [u.uid, u.name || u.contact]));
};

/**
 * `canSearchPeople` is false for a role that may not see devotees: it could
 * otherwise find out WHO booked by searching a name, even though names are masked.
 */
export async function listForAdmin({ status, q, limit } = {}, { canSearchPeople = false } = {}) {
  const filter = {};
  if (FLOW.includes(status) || status === 'cancelled') filter.status = status;
  if (typeof q === 'string' && q.trim()) {
    const re = new RegExp(escapeRe(q.trim().slice(0, 60)), 'i');
    filter.$or = [{ bookingRef: re }, { poojaTitle: re }, ...(canSearchPeople ? [{ 'names.name': re }, { devoteeName: re }] : [])];
  }
  const rows = await Booking.find(filter).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 100, 500)).lean();
  const who = await whoMap(rows);
  return rows.map((b) => ({
    ...bookingView(b), uid: b.uid, who: who.get(b.uid) || b.uid, devoteeName: b.devoteeName || b.names?.[0]?.name || '',
    gotra: b.gotra || b.names?.[0]?.gotra || '', address: b.address ? { line1: b.address.line1, city: b.address.city, pincode: b.address.pincode } : null,
  }));
}

const PUSH = {
  sankalp: ['Sankalp taken', (b) => `The sankalp for your ${b.poojaTitle} booking has been taken.`],
  performed: ['Pooja performed', (b) => `Your ${b.poojaTitle} has been performed. Tap to leave a review.`],
};

/** Forward only: booked -> sankalp -> performed (a step may be skipped, never undone). */
export async function setStatus(id, status) {
  if (!['sankalp', 'performed'].includes(status)) throw new HttpError(400, 'invalid_status', 'Status must be "sankalp" or "performed".');
  const b = oid(id) ? await Booking.findById(id).lean() : null;
  if (!b) throw new HttpError(404, 'not_found', 'Booking not found.');
  if (b.status === 'cancelled' || FLOW.indexOf(status) <= FLOW.indexOf(b.status || 'booked')) {
    throw new HttpError(409, 'invalid_transition', `A ${b.status} booking cannot move to ${status}.`, { from: b.status, to: status });
  }
  const saved = await Booking.findOneAndUpdate(
    { _id: b._id, status: b.status },
    { $set: { status }, $push: { statusHistory: { status, at: new Date() } } },
    { new: true },
  ).lean();
  if (!saved) throw new HttpError(409, 'invalid_transition', 'That booking just changed; reload and try again.');
  const [title, body] = PUSH[status];
  notifyDevotee(saved.uid, { title, body: body(saved), data: { type: 'booking_status', bookingId: String(saved._id), status } });
  return bookingView(saved);
}

export async function listReviews({ hidden } = {}) {
  const filter = {};
  if (hidden === 'true' || hidden === true) filter.hidden = true;
  if (hidden === 'false' || hidden === false) filter.hidden = false;
  const rows = await PoojaReview.find(filter).sort({ createdAt: -1, _id: -1 }).limit(300).lean();
  const who = await whoMap(rows);
  return rows.map((r) => ({
    ...reviewRow(r), who: who.get(r.uid) || r.uid,
  }));
}

const reviewRow = (r) => ({
  id: String(r._id), bookingRef: r.bookingRef, poojaTitle: r.poojaTitle, rating: r.rating, text: r.text || '', hidden: !!r.hidden,
  edited: !!r.edited, editedAt: r.editedAt ? iso(r.editedAt) : null, createdAt: iso(r.createdAt), uid: r.uid,
});

/**
 * Moderate a review: hide/unhide and/or correct its text. Rating, first name,
 * booking link and uid are never touched, whatever else is in the body.
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
