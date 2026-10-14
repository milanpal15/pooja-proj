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

/**
 * Two operators paying at once must not both fit under one "due" figure - in this process OR in another instance of the service. The monolith
 * serialised in memory (single process); here the serialisation is a short lease on the astrologer's row (`payoutLock`), taken with one
 * conditional update, so it holds across instances. A holder that dies leaves a lease that simply expires (`LOCK_MS`).
 */
export const LOCK_MS = 10_000;
const LOCK_WAIT_MS = 6_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withPayoutLock(astrologerId, fn) {
  const lockId = new mongoose.Types.ObjectId().toString();
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    const now = new Date();
    const got = await Astrologer.findOneAndUpdate(
      { _id: astrologerId, $or: [{ 'payoutLock.until': { $exists: false } }, { 'payoutLock.until': { $lt: now } }] },
      { $set: { payoutLock: { id: lockId, until: new Date(now.getTime() + LOCK_MS) } } },
      { new: true, timestamps: false },
    ).select('_id');
    if (got) break;
    if (Date.now() > deadline) throw new HttpError(409, 'payout_busy', 'Another payout is being recorded for this astrologer. Try again in a moment.');
    await sleep(20);
  }
  try {
    return await fn();
  } finally {
    await Astrologer.updateOne({ _id: astrologerId, 'payoutLock.id': lockId }, { $unset: { payoutLock: 1 } }, { timestamps: false }).catch(() => {});
  }
}

export async function recordPayout({ astrologerId, amountPaise, reference, recordedBy }) {
  const amount = Number(amountPaise);
  if (!Number.isInteger(amount) || amount <= 0) throw new HttpError(400, 'bad_amount', 'Enter the amount in paise as a whole number.');
  const a = mongoose.isValidObjectId(astrologerId) ? await Astrologer.findById(astrologerId).select('_id').lean() : null;
  if (!a) throw new HttpError(404, 'astrologer_not_found', 'Astrologer not found.');
  return withPayoutLock(a._id, async () => {
    const { duePaise } = await totals(a._id);
    if (amount > duePaise) throw new HttpError(409, 'exceeds_due', 'That is more than is due.', { duePaise });
    return Payout.create({ astrologerId: a._id, amountPaise: amount, reference: String(reference ?? '').trim(), recordedBy });
  });
}
