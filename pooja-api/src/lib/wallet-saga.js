import mongoose from 'mongoose';

import { Booking } from '../models.js';
import { ChadhavaOrder } from '../modules/chadhava/chadhava.model.js';
import { callsEnabled } from './calls-guard.js';
import { ordersEnabled } from './orders-guard.js';
import * as client from './wallet-client.js';

/**
 * The money saga for the monolith's orders (docs/MICROSERVICES.md section 4), used ONLY when WALLET_URL is set.
 *
 * Without a wallet service a booking is "debit (one local atomic step), then write the booking". With one, the debit is a network call
 * whose answer can be LOST (a timeout after the request left): the wallet may have charged and the monolith never learns it. A charge
 * with no order behind it is money lost, so every purchase leaves a durable note BEFORE the money moves:
 *
 *   1. open an intent  { key, kind, uid, amount, payload: everything the order is made from }   (a write to the monolith's own database)
 *   2. call the wallet with the SAME idempotency key as ever
 *      - answered: write the order, close the intent `done` (402 and friends close it `failed`)
 *      - AMBIGUOUS (timeout / refused / 5xx): the intent stays `pending`, the caller gets 503 `wallet_unavailable`
 *   3. the SWEEPER (run by the billing ticker every few seconds) asks the wallet `GET /txn?key=` about every old pending intent:
 *        posted  -> the debit happened: write the order (idempotent on requestId), close `done`
 *        failed  -> nothing was charged: close `failed`
 *        pending -> the wallet is still settling it: look again next time
 *        unknown -> the request never arrived: after GRACE close `expired` (the user's own retry, with the same requestId, simply charges then)
 *
 * A REFUND is the mirror: the intent is written first and the sweeper re-sends it with the same key until the wallet answers; a refund
 * can be re-sent any number of times because the key makes it a no-op after the first.
 *
 * Retrying a request with the same requestId is always safe: same key, so one charge, and the order is unique on (uid, requestId).
 */

const intentSchema = new mongoose.Schema(
  {
    /** The wallet idempotency key: one intent per money movement. */
    key: { type: String, required: true, unique: true },
    kind: { type: String, enum: ['booking', 'chadhava', 'refund'], required: true },
    uid: { type: String, required: true },
    amount: { type: Number, required: true },
    /** debit: the ledger type; refund: unused. */
    type: String,
    refType: String,
    refId: String,
    note: String,
    createdBy: String,
    /** refund: the idempotency key of the debit it reverses (sent to the wallet, which verifies it) ... */
    ofKey: String,
    /** ... or, for an operator's goodwill refund on a call, the explicit reason that is the one exemption from `ofKey`. */
    reason: String,
    requestId: String,
    /** What the order is made from (booking / chadhava order fields), so the sweeper can write it without the original request. */
    payload: mongoose.Schema.Types.Mixed,
    status: { type: String, enum: ['pending', 'done', 'failed', 'expired', 'refunded'], default: 'pending', index: true },
    openedAt: { type: Date, default: Date.now },
    attempts: { type: Number, default: 0 },
    lastError: String,
  },
  { timestamps: true, minimize: false },
);
intentSchema.index({ status: 1, openedAt: 1 });

export const WalletIntent = mongoose.models.WalletIntent || mongoose.model('WalletIntent', intentSchema);

export const GRACE_MS = 120_000; // an unknown key is "never arrived" only after this long
export const MIN_AGE_MS = 10_000; // do not sweep what a live request may still be finishing

/** Create (or re-open, on a retry of the same request) the intent for this key. */
export async function openIntent(spec) {
  const { key, ...rest } = spec;
  return WalletIntent.findOneAndUpdate(
    { key },
    { $set: { ...rest, status: 'pending', openedAt: new Date(), lastError: undefined } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

export const closeIntent = (key, status) => WalletIntent.updateOne({ key }, { $set: { status } });

const completers = new Map();
/** A module that turns a posted debit into its order registers how, once. `fn(intent, txn)` must be idempotent. */
export const registerCompleter = (kind, fn) => completers.set(kind, fn);

async function noteFailure(intent, e) {
  await WalletIntent.updateOne({ _id: intent._id }, { $inc: { attempts: 1 }, $set: { lastError: String(e?.message || e).slice(0, 200) } });
}

/**
 * A refund queued BEFORE phase 5 carries neither `ofKey` nor `reason`, and the wallet service now refuses such a refund (it must name the spend it
 * reverses). The key of a refund says which debit it reverses, so a queued one is upgraded here rather than left to be refused:
 *   booking:<uid>:<requestId>:failed        -> booking:<uid>:<requestId>
 *   chadhava:<uid>:<requestId>:failed       -> chadhava:<uid>:<requestId>
 *   booking:<id>:refund                     -> the debit key of that booking (uid + requestId)      (same for chadhava)
 *   call:<id>:refund:<n>                    -> call:<id>:min:<n>
 *   call:<id>:goodwill:<rid>                -> no single debit: the operator's reason (the note) is the exemption
 * Returns { ofKey } or { reason }, or {} when nothing can be derived (the wallet then refuses it, loudly).
 */
export async function legacyRefundProof(intent) {
  if (intent.ofKey || intent.reason) return { ofKey: intent.ofKey, reason: intent.reason };
  let m;
  if ((m = /^((?:booking|chadhava):.+):failed$/.exec(intent.key))) return { ofKey: m[1] };
  if ((m = /^(booking|chadhava):([0-9a-f]{24}):refund$/.exec(intent.key))) {
    const row = await (m[1] === 'booking' ? Booking : ChadhavaOrder).findById(m[2]).select('uid requestId').lean();
    return row?.requestId ? { ofKey: `${m[1]}:${row.uid}:${row.requestId}` } : {};
  }
  if ((m = /^call:([^:]+):refund:(\d+)$/.exec(intent.key))) return { ofKey: `call:${m[1]}:min:${m[2]}` };
  if (/^call:[^:]+:goodwill:/.test(intent.key) && intent.note) return { reason: intent.note };
  return {};
}

async function sweepRefund(intent) {
  try {
    const proof = await legacyRefundProof(intent);
    await client.refund({
      uid: intent.uid, amount: intent.amount, refType: intent.refType, refId: intent.refId, idempotencyKey: intent.key, note: intent.note, createdBy: intent.createdBy,
      ...proof,
    });
    await closeIntent(intent.key, 'done');
    return 'done';
  } catch (e) {
    if (client.isUnavailable(e)) { await noteFailure(intent, e); return 'waiting'; }
    // A business refusal of a refund (bad amount, key belonging to another account) cannot be fixed by waiting: stop, loudly.
    console.error(`✗ REFUND INTENT REFUSED by the wallet (${e.status} ${e.code}) key=${intent.key} uid=${intent.uid} amount=${intent.amount}`);
    await closeIntent(intent.key, 'failed');
    return 'failed';
  }
}

async function sweepDebit(intent, { graceMs }) {
  let txn;
  try {
    txn = await client.txnByKey(intent.key, intent.uid);
  } catch (e) {
    await noteFailure(intent, e);
    return 'waiting';
  }
  if (!txn) {
    if (Date.now() - new Date(intent.openedAt).getTime() < graceMs) return 'waiting';
    await closeIntent(intent.key, 'expired');
    return 'expired';
  }
  if (txn.status === 'failed') { await closeIntent(intent.key, 'failed'); return 'failed'; }
  if (txn.status !== 'posted') return 'waiting'; // still pending at the wallet: its own reconciler settles it
  const complete = completers.get(intent.kind);
  if (!complete) { await noteFailure(intent, new Error(`no completer for ${intent.kind}`)); return 'waiting'; }
  try {
    await complete(intent, txn);
    await closeIntent(intent.key, 'done');
    return 'done';
  } catch (e) {
    console.error(`✗ could not complete the ${intent.kind} behind a posted debit (will retry) key=${intent.key}: ${e.message}`);
    await noteFailure(intent, e);
    return 'waiting';
  }
}

/** Terminal intents are history, not state: they are deleted once they are this old. Pending ones are never touched. */
export const RETENTION_MS = 30 * 24 * 3_600_000;
const PRUNE_EVERY_MS = 3_600_000;
let prunedAt = 0;

/** Delete terminal (`done|failed|expired|refunded`) intents older than `retentionMs`. Returns how many. Called by `sweep`, at most hourly. */
export async function pruneIntents({ retentionMs = RETENTION_MS } = {}) {
  const r = await WalletIntent.deleteMany({ status: { $in: ['done', 'failed', 'expired', 'refunded'] }, updatedAt: { $lt: new Date(Date.now() - retentionMs) } });
  return r.deletedCount ?? 0;
}

let sweeping = false;

/** One pass over the old pending intents. Returns counts so tests and logs can see what it did. */
export async function sweep({ minAgeMs = MIN_AGE_MS, graceMs = GRACE_MS, limit = 50 } = {}) {
  const out = { checked: 0, done: 0, failed: 0, expired: 0, waiting: 0 };
  if (sweeping) return out;
  sweeping = true;
  try {
    if (Date.now() - prunedAt > PRUNE_EVERY_MS) {
      prunedAt = Date.now();
      await pruneIntents().catch((e) => console.error(`! could not prune old intents: ${e.message}`));
    }
    const filter = { status: 'pending', openedAt: { $lt: new Date(Date.now() - minAgeMs) } };
    // Whatever has moved out is not ours to resolve (it would otherwise be resolved twice: once into the new service's database, once here):
    //   ORDERS_URL set (phase 5): every booking / chadhava intent - the debits and the refunds of those orders; what stays here: call refunds.
    //   CALLS_URL set  (phase 6): the call refunds (`callintents` in the calls service; the DB split copies the unfinished ones).
    const moved = [];
    if (ordersEnabled()) moved.push({ kind: { $in: ['booking', 'chadhava'] } }, { kind: 'refund', refType: { $in: ['booking', 'chadhava'] } });
    if (callsEnabled()) moved.push({ kind: 'refund', refType: 'call' });
    if (moved.length) filter.$nor = moved;
    const rows = await WalletIntent.find(filter).sort({ openedAt: 1 }).limit(limit);
    for (const intent of rows) {
      out.checked++;
      const r = intent.kind === 'refund' ? await sweepRefund(intent) : await sweepDebit(intent, { graceMs });
      out[r === 'refunded' ? 'done' : r]++;
    }
  } finally {
    sweeping = false;
  }
  return out;
}
