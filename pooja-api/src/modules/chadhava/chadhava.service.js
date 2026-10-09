import crypto from 'node:crypto';
import mongoose from 'mongoose';

import { HttpError } from '../../lib/http-error.js';
import { notifyDevotee } from '../../lib/push.js';
import { getNumberSetting } from '../../lib/settings.js';
import { inWindow } from '../../lib/window.js';
import { Temple, User } from '../../models.js';
import * as wallet from '../wallet/wallet.service.js';
import { ChadhavaCategory, ChadhavaListing, ChadhavaOrder, Offering } from './chadhava.model.js';

const iso = (d) => (d ? new Date(d).toISOString() : null);
const oid = (id) => mongoose.isValidObjectId(id);
const liveOfferings = (l) => (l.offerings ?? []).filter((o) => o.enabled !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

/** The old flat catalogue, still served until the dashboard drops its page. */
export async function catalogue() {
  const [rows, serviceFee, minAmount] = await Promise.all([
    Offering.find({ enabled: true }).sort({ order: 1, createdAt: 1 }).lean(),
    getNumberSetting('chadhavaServiceFee', 5),
    getNumberSetting('chadhavaMinAmount', 1),
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

/* ───────────────────────────────────────────────────────────────── orders ── */

const REF_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newRef = () => `CHD-${Array.from({ length: 5 }, () => REF_CHARS[crypto.randomInt(REF_CHARS.length)]).join('')}`;

export function orderView(o, now = new Date()) {
  return {
    id: String(o._id),
    ref: o.ref,
    listingSlug: o.listingSlug || '',
    listingTitle: o.listingTitle || '',
    listingTitleHi: o.listingTitleHi || '',
    items: (o.items ?? []).map((i) => ({ key: i.key, title: i.title || i.name || i.key, qty: i.qty, coins: i.coins })),
    totalCoins: o.totalCoins ?? o.total ?? 0,
    status: o.status || 'booked',
    refunded: !!o.refunded,
    canCancel: (o.status || 'booked') === 'booked' && (!o.cancelBy || now < new Date(o.cancelBy)),
    createdAt: iso(o.createdAt),
  };
}

const invalidItems = (m) => new HttpError(400, 'invalid_items', m);

function askedItems(raw) {
  if (!Array.isArray(raw) || raw.length === 0) throw invalidItems('Choose at least one offering.');
  const asked = new Map();
  for (const it of raw) {
    if (!it || typeof it.key !== 'string' || !Number.isInteger(it.qty) || it.qty < 1 || it.qty > 20) {
      throw invalidItems('Each offering needs a key and a quantity from 1 to 20.');
    }
    asked.set(it.key, (asked.get(it.key) ?? 0) + it.qty);
  }
  if (asked.size > 10 || [...asked.values()].some((q) => q > 20)) throw invalidItems('At most 10 different offerings, 20 of each.');
  return asked;
}

/**
 * Pay for a chadhava. The body names offerings and quantities and nothing
 * else: every price is read from the listing, so the total cannot be talked down.
 */
export async function placeOrder(uid, body) {
  const { listingSlug, requestId } = body ?? {};
  if (typeof requestId !== 'string' || requestId.length < 8 || requestId.length > 100) {
    throw new HttpError(400, 'bad_request_id', 'A request id is required.');
  }
  const prior = await ChadhavaOrder.findOne({ uid, requestId });
  if (prior) return { order: orderView(prior), balance: await wallet.getBalance(uid), created: false };

  const listing = typeof listingSlug === 'string' ? await ChadhavaListing.findOne({ slug: listingSlug, enabled: true }).lean() : null;
  if (!listing) throw new HttpError(404, 'not_found', 'That chadhava is not available.');
  if (!inWindow(listing)) throw new HttpError(409, 'listing_closed', 'This chadhava is not open right now.');

  const asked = askedItems(body.items);
  const byKey = new Map(liveOfferings(listing).map((o) => [o.key, o]));
  const items = [];
  for (const [key, qty] of asked) {
    const o = byKey.get(key);
    if (!o) throw invalidItems(`"${key}" is not on offer.`);
    items.push({ key, title: o.title, qty, coins: o.coins });
  }
  const total = items.reduce((s, i) => s + i.coins * i.qty, 0);
  const temple = listing.templeSlug ? await Temple.findOne({ slug: listing.templeSlug }).select('name').lean() : null;

  const d = await wallet.debit({
    uid, amount: total, type: 'chadhava_debit', refType: 'chadhava', idempotencyKey: `chadhava:${uid}:${requestId}`, note: `Chadhava - ${listing.title}`,
  });

  const fields = {
    uid, requestId, listingSlug: listing.slug, listingTitle: listing.title, listingTitleHi: listing.titleHi,
    templeSlug: listing.templeSlug, templeName: temple?.name || '', items, totalCoins: total, status: 'booked',
    cancelBy: listing.endsAt ?? null, walletTxnId: String(d.txn._id),
  };
  for (let attempt = 0; ; attempt++) {
    try {
      const doc = await ChadhavaOrder.create({ ...fields, ref: newRef() });
      return { order: orderView(doc), balance: d.balance, created: true };
    } catch (e) {
      if (e?.code === 11000 && e.keyPattern?.requestId) {
        const won = await ChadhavaOrder.findOne({ uid, requestId });
        if (won) return { order: orderView(won), balance: d.balance, created: false };
      }
      if (e?.code === 11000 && e.keyPattern?.ref && attempt < 5) continue;
      await wallet
        .refund({ uid, amount: total, refType: 'chadhava', refId: requestId, idempotencyKey: `chadhava:${uid}:${requestId}:failed`, note: 'Chadhava could not be saved' })
        .catch((re) => console.error('✗ REFUND FAILED after chadhava write failure', requestId, re.message));
      throw e;
    }
  }
}

export async function listForDevotee(uid) {
  const rows = await ChadhavaOrder.find({ uid }).sort({ createdAt: -1 }).lean();
  return rows.map((o) => orderView(o));
}

/** Cancel while `booked` and before the listing closes, refunding the coins. Safe to repeat. */
export async function cancelOrder(uid, id, now = new Date()) {
  let o = oid(id) ? await ChadhavaOrder.findOne({ _id: id, uid }) : null;
  if (!o) throw new HttpError(404, 'not_found', 'Order not found.');
  if (o.status !== 'cancelled') {
    if (o.status !== 'booked' || (o.cancelBy && now >= new Date(o.cancelBy))) throw new HttpError(409, 'cannot_cancel', 'This order can no longer be cancelled.');
    const flagged = await ChadhavaOrder.findOneAndUpdate({ _id: o._id, status: 'booked' }, { $set: { status: 'cancelled', refunded: true } }, { new: true });
    o = flagged ?? (await ChadhavaOrder.findById(o._id));
    if (o.status !== 'cancelled') throw new HttpError(409, 'cannot_cancel', 'This order can no longer be cancelled.');
  }
  const r = await wallet.refund({
    uid, amount: o.totalCoins, refType: 'chadhava', refId: String(o._id), idempotencyKey: `chadhava:${o._id}:refund`, note: `Cancelled ${o.listingTitle}`,
  });
  return { order: orderView(o, now), balance: r.balance };
}

/* ───────────────────────────────────────────────────────────────── admin ── */

export async function listOrdersForAdmin(limit = 100) {
  const rows = await ChadhavaOrder.find().sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 100, 500)).lean();
  const users = await User.find({ uid: { $in: [...new Set(rows.map((r) => r.uid))] } }).select('uid name contact').lean();
  const who = new Map(users.map((u) => [u.uid, u.name || u.contact]));
  return rows.map((o) => ({ ...orderView(o), uid: o.uid, who: who.get(o.uid) || o.uid, templeName: o.templeName || '', at: o.createdAt }));
}

/** booked -> offered, once. */
export async function markOffered(id, status) {
  if (status !== 'offered') throw new HttpError(400, 'invalid_status', 'Status must be "offered".');
  const o = oid(id) ? await ChadhavaOrder.findOneAndUpdate({ _id: id, status: 'booked' }, { $set: { status: 'offered' } }, { new: true }).lean() : null;
  if (!o) {
    const exists = oid(id) && (await ChadhavaOrder.exists({ _id: id }));
    throw exists ? new HttpError(409, 'invalid_transition', 'Only a booked order can be marked offered.') : new HttpError(404, 'not_found', 'Order not found.');
  }
  notifyDevotee(o.uid, { title: 'Chadhava offered', body: `Your chadhava for ${o.listingTitle} has been offered.`, data: { type: 'chadhava_status', orderId: String(o._id), status: 'offered' } });
  return orderView(o);
}
