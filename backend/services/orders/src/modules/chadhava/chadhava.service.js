import crypto from 'node:crypto';
import mongoose from 'mongoose';

import { ctx } from '../../lib/context.js';
import { HttpError } from '../../lib/http-error.js';
import { notify } from '../../lib/notify.js';
import { inWindow } from '../../lib/window.js';
import { debitForOrder, displayBalance, refundDurably, registerCompleter, settled } from '../saga/index.js';
import { ChadhavaOrder } from './chadhava-order.model.js';

const iso = (d) => (d ? new Date(d).toISOString() : null);
const oid = (id) => mongoose.isValidObjectId(id);
const liveOfferings = (l) => (l.offerings ?? []).filter((o) => o.enabled !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

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
 * Pay for a chadhava. The body names offerings and quantities and nothing else: every price is read from the catalog's snapshot of the
 * listing, fresh for THIS purchase (never cached; catalog unavailable = 503 BEFORE any coin moves), so the total cannot be talked down.
 * The order copies the listing title, item titles and prices it was made from, so a later catalog edit never rewrites a receipt.
 */
export async function placeOrder(uid, body) {
  const { listingSlug, requestId } = body ?? {};
  if (typeof requestId !== 'string' || requestId.length < 8 || requestId.length > 100) {
    throw new HttpError(400, 'bad_request_id', 'A request id is required.');
  }
  const prior = await ChadhavaOrder.findOne({ uid, requestId });
  if (prior) return { order: orderView(prior), balance: await displayBalance(uid), created: false };

  let listing = null;
  let temple = null;
  if (typeof listingSlug === 'string') ({ listing = null, temple = null } = (await ctx.catalog.chadhavaForOrder(listingSlug)) ?? {});
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

  // Everything the order is made from except the ledger row it is paid by: kept in a durable intent BEFORE the money moves, so an answer
  // lost in transit can still be turned into this order (modules/saga/saga.js).
  const base = {
    uid, requestId, listingSlug: listing.slug, listingTitle: listing.title, listingTitleHi: listing.titleHi,
    templeSlug: listing.templeSlug, templeName: temple?.name || '', items, totalCoins: total,
    cancelBy: listing.endsAt ?? null,
  };
  const key = `chadhava:${uid}:${requestId}`;
  const d = await debitForOrder({ kind: 'chadhava', requestId, payload: base }, {
    uid, amount: total, type: 'chadhava_debit', refType: 'chadhava', idempotencyKey: key, note: `Chadhava - ${listing.title}`,
  });
  const out = await saveOrder(base, d);
  await settled(key);
  return out;
}

/**
 * Write the order a posted debit paid for. Used by the request itself AND by the sweeper (which only has the intent), so it must be safe to
 * run twice: the order is unique on (uid, requestId). Any other failure gives the coins back (durably, quietly).
 */
async function saveOrder(base, d) {
  const { uid, requestId, totalCoins: total } = base;
  const fields = { ...base, status: 'booked', walletTxnId: String(d.txn._id) };
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
      await refundDurably(
        { uid, amount: total, refType: 'chadhava', refId: requestId, idempotencyKey: `chadhava:${uid}:${requestId}:failed`, ofKey: `chadhava:${uid}:${requestId}`, note: 'Chadhava could not be saved' },
        { closes: `chadhava:${uid}:${requestId}`, quiet: true },
      ).catch((re) => ctx.log.error(`REFUND FAILED after chadhava write failure ${requestId}: ${re.message}`));
      throw e;
    }
  }
}

registerCompleter('chadhava', async (intent, txn) => {
  await saveOrder(intent.payload, { txn: { _id: txn._id }, balance: txn.balanceAfter });
});

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
  const r = await refundDurably({
    uid, amount: o.totalCoins, refType: 'chadhava', refId: String(o._id), idempotencyKey: `chadhava:${o._id}:refund`,
    ofKey: o.requestId ? `chadhava:${uid}:${o.requestId}` : undefined, note: `Cancelled ${o.listingTitle}`,
  });
  return { order: orderView(o, now), balance: r.balance };
}

/* ───────────────────────────────────────────────────────────────── admin ── */

export async function listOrdersForAdmin(limit = 100) {
  const rows = await ChadhavaOrder.find().sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 100, 500)).lean();
  const who = await ctx.identity.whoByUid(rows.map((r) => r.uid));
  return rows.map((o) => ({ ...orderView(o), uid: o.uid, who: who.get(o.uid) || o.uid, templeName: o.templeName || '', at: o.createdAt }));
}

/** booked -> offered, once. The devotee is told, best effort. */
export async function markOffered(id, status) {
  if (status !== 'offered') throw new HttpError(400, 'invalid_status', 'Status must be "offered".');
  const o = oid(id) ? await ChadhavaOrder.findOneAndUpdate({ _id: id, status: 'booked' }, { $set: { status: 'offered' } }, { new: true }).lean() : null;
  if (!o) {
    const exists = oid(id) && (await ChadhavaOrder.exists({ _id: id }));
    throw exists ? new HttpError(409, 'invalid_transition', 'Only a booked order can be marked offered.') : new HttpError(404, 'not_found', 'Order not found.');
  }
  notify(o.uid, { title: 'Chadhava offered', body: `Your chadhava for ${o.listingTitle} has been offered.`, data: { type: 'chadhava_status', orderId: String(o._id), status: 'offered' } });
  return orderView(o);
}
