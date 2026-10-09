import mongoose from 'mongoose';

import { HttpError } from '../../lib/http-error.js';
import { Astrologer } from '../astrologers/astrologer.model.js';
import { AstrologerEarning, Payout } from './payout.model.js';

/**
 * Earnings and manual payouts. Money here is paise, integers. Voided earning
 * rows (a call that never connected was refunded) never count.
 */

const IST_MS = 5.5 * 3600_000;

/** Start of today / this month in India time (the astrologers' day), as a UTC Date. */
export function istBoundaries(now = new Date()) {
  const ist = new Date(now.getTime() + IST_MS);
  const day = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_MS;
  const month = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - IST_MS;
  return { today: new Date(day), month: new Date(month) };
}

const live = { voidedAt: { $exists: false } };

async function window(astrologerId, since) {
  const [r] = await AstrologerEarning.aggregate([
    { $match: { astrologerId, ...live, ...(since ? { at: { $gte: since } } : {}) } },
    { $group: { _id: null, earnedPaise: { $sum: '$paise' }, minutes: { $sum: 1 }, calls: { $addToSet: '$callId' } } },
  ]);
  return { earnedPaise: r?.earnedPaise ?? 0, calls: r?.calls.length ?? 0, minutes: r?.minutes ?? 0 };
}

async function totals(astrologerId) {
  const [e, p] = await Promise.all([
    AstrologerEarning.aggregate([{ $match: { astrologerId, ...live } }, { $group: { _id: null, paise: { $sum: '$paise' } } }]),
    Payout.aggregate([{ $match: { astrologerId } }, { $group: { _id: null, paise: { $sum: '$amountPaise' } } }]),
  ]);
  const earnedPaise = e[0]?.paise ?? 0;
  const paidPaise = p[0]?.paise ?? 0;
  return { earnedPaise, paidPaise, duePaise: earnedPaise - paidPaise };
}

export async function earningsFor(astrologerId, now = new Date()) {
  const { today, month } = istBoundaries(now);
  const [m, t, tot, payouts] = await Promise.all([
    window(astrologerId, month),
    window(astrologerId, today),
    totals(astrologerId),
    Payout.find({ astrologerId }).sort({ paidAt: -1 }).limit(50).lean(),
  ]);
  return {
    month: m,
    today: t,
    paidPaise: tot.paidPaise,
    duePaise: tot.duePaise,
    payouts: payouts.map((p) => ({ amountPaise: p.amountPaise, paidAt: p.paidAt, reference: p.reference })),
  };
}

export async function summary() {
  const rows = await Astrologer.find().sort({ name: 1 }).select('name').lean();
  const out = [];
  for (const a of rows) out.push({ id: String(a._id), name: a.name, ...(await totals(a._id)) });
  return out;
}

/** Two operators paying at once must not both fit under one "due" figure. Single process, so a chain is enough. */
const chains = new Map();
function serialized(key, fn) {
  const prev = chains.get(key) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  chains.set(key, next);
  next.finally(() => chains.get(key) === next && chains.delete(key)).catch(() => {});
  return next;
}

export function recordPayout({ astrologerId, amountPaise, reference, recordedBy }) {
  return serialized(String(astrologerId), async () => {
    const amount = Number(amountPaise);
    if (!Number.isInteger(amount) || amount <= 0) throw new HttpError(400, 'bad_amount', 'Enter the amount in paise as a whole number.');
    const a = mongoose.isValidObjectId(astrologerId) ? await Astrologer.findById(astrologerId).select('_id').lean() : null;
    if (!a) throw new HttpError(404, 'astrologer_not_found', 'Astrologer not found.');
    const { duePaise } = await totals(a._id);
    if (amount > duePaise) throw new HttpError(409, 'exceeds_due', 'That is more than is due.', { duePaise });
    return Payout.create({ astrologerId: a._id, amountPaise: amount, reference: String(reference ?? '').trim(), recordedBy });
  });
}
