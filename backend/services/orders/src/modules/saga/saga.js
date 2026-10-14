import { ctx } from '../../lib/context.js';
import { Booking } from '../bookings/booking.model.js';
import { ChadhavaOrder } from '../chadhava/chadhava-order.model.js';
import { OrderIntent, TERMINAL } from './intent.model.js';

/**
 * The money saga for an order (docs/MICROSERVICES.md section 4). It moved here from the monolith's lib/wallet-saga.js with its semantics intact.
 *
 * A booking is "debit (a network call to the wallet), then write the booking". The answer to that call can be LOST (a timeout after the
 * request left): the wallet may have charged and this service never learns it. A charge with no order behind it is money lost, so every
 * purchase leaves a durable note BEFORE the money moves:
 *
 *   1. open an intent  { key, kind, uid, amount, payload: everything the order is made from }   (a write to this service's own database)
 *   2. call the wallet with the SAME idempotency key on every retry
 *      - answered: write the order, close the intent `done` (402 and friends close it `failed`)
 *      - AMBIGUOUS (timeout / refused / 5xx): the intent stays `pending`, the caller gets 503 `wallet_unavailable`
 *   3. the SWEEPER asks the wallet `GET /txn?key=` about every old pending intent:
 *        posted  -> the debit happened: write the order (idempotent on (uid, requestId)), close `done`
 *        failed  -> nothing was charged: close `failed`
 *        pending -> the wallet is still settling it: look again next time
 *        unknown -> the request never arrived: after the grace period close `expired` (the user's own retry, with the same requestId, charges then)
 *
 * A REFUND is the mirror: the intent is written first and the sweeper re-sends it with the same key (and the same `ofKey`) until the wallet
 * answers; it can be re-sent any number of times because the key makes it a no-op after the first.
 *
 * Retrying a request with the same requestId is always safe: same key, so one charge, and the order is unique on (uid, requestId).
 */

/** An unknown key is "never arrived" only after this long, and a young intent may still be in flight in a live request. */
export const GRACE_MS = 120_000;
export const MIN_AGE_MS = 10_000;
export const RETENTION_DAYS = 30;

/** Create (or re-open, on a retry of the same request) the intent for this key. */
export async function openIntent(spec) {
  const { key, ...rest } = spec;
  return OrderIntent.findOneAndUpdate(
    { key },
    { $set: { ...rest, status: 'pending', openedAt: new Date(), lastError: undefined } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

export const closeIntent = (key, status) => OrderIntent.updateOne({ key }, { $set: { status } });

const completers = new Map();
/** A module that turns a posted debit into its order registers how, once. `fn(intent, txn)` must be idempotent. */
export const registerCompleter = (kind, fn) => completers.set(kind, fn);

const noteFailure = (intent, e) =>
  OrderIntent.updateOne({ _id: intent._id }, { $inc: { attempts: 1 }, $set: { lastError: String(e?.message || e).slice(0, 200) } });

/**
 * The debit a refund intent reverses. New intents carry it (`ofKey`); a refund queued by the MONOLITH before the wallet started checking (and copied
 * here by the DB split) does not, but its key says which debit it is for:
 *   booking:<uid>:<requestId>:failed   -> booking:<uid>:<requestId>        (same for chadhava)
 *   booking:<id>:refund                -> the debit key of that booking (uid + requestId)   (same for chadhava)
 * Returns undefined when nothing can be derived: the wallet then refuses the refund, loudly, rather than this service guessing.
 */
export async function refundOfKey(intent) {
  if (intent.ofKey) return intent.ofKey;
  let m;
  if ((m = /^((?:booking|chadhava):.+):failed$/.exec(intent.key))) return m[1];
  if ((m = /^(booking|chadhava):([0-9a-f]{24}):refund$/.exec(intent.key))) {
    const row = await (m[1] === 'booking' ? Booking : ChadhavaOrder).findById(m[2]).select('uid requestId').lean();
    return row?.requestId ? `${m[1]}:${row.uid}:${row.requestId}` : undefined;
  }
  return undefined;
}

async function sweepRefund(intent) {
  try {
    const ofKey = await refundOfKey(intent);
    if (!ofKey) throw Object.assign(new Error('this refund names no debit and none can be derived from its key'), { status: 400, code: 'ofkey_required' });
    await ctx.wallet.refund({
      uid: intent.uid, amount: intent.amount, refType: intent.refType, refId: intent.refId, idempotencyKey: intent.key, ofKey,
      note: intent.note, createdBy: intent.createdBy,
    });
    await closeIntent(intent.key, 'done');
    return 'done';
  } catch (e) {
    if (ctx.wallet.isUnavailable(e)) { await noteFailure(intent, e); return 'waiting'; }
    // A business refusal of a refund (no such debit, already refunded, over the charge, another account's) cannot be fixed by waiting: stop, loudly.
    ctx.log.error(`REFUND INTENT REFUSED by the wallet (${e.status} ${e.code}) key=${intent.key} ofKey=${intent.ofKey} uid=${intent.uid} amount=${intent.amount}`);
    await noteFailure(intent, e);
    await closeIntent(intent.key, 'failed');
    return 'failed';
  }
}

async function sweepDebit(intent, { graceMs }) {
  let txn;
  try {
    txn = await ctx.wallet.txnByKey(intent.key, intent.uid);
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
    ctx.log.error(`could not complete the ${intent.kind} behind a posted debit (will retry) key=${intent.key}: ${e.message}`);
    await noteFailure(intent, e);
    return 'waiting';
  }
}

/** Delete terminal intents older than `retentionDays` (by last update). Pending intents are NEVER deleted, however old. Returns how many. */
export async function pruneIntents({ retentionDays = ctx.config?.intentRetentionDays ?? RETENTION_DAYS, now = Date.now() } = {}) {
  const r = await OrderIntent.deleteMany({ status: { $in: TERMINAL }, updatedAt: { $lt: new Date(now - retentionDays * 86_400_000) } });
  return r.deletedCount ?? 0;
}

let sweeping = false;

/** One pass over the old pending intents. Returns counts so tests and logs can see what it did. */
export async function sweep({ minAgeMs = ctx.config?.intentMinAgeMs ?? MIN_AGE_MS, graceMs = ctx.config?.intentGraceMs ?? GRACE_MS, limit = 50 } = {}) {
  const out = { checked: 0, done: 0, failed: 0, expired: 0, waiting: 0 };
  if (sweeping) return out;
  sweeping = true;
  try {
    const rows = await OrderIntent.find({ status: 'pending', openedAt: { $lt: new Date(Date.now() - minAgeMs) } }).sort({ openedAt: 1 }).limit(limit);
    for (const intent of rows) {
      out.checked++;
      const r = intent.kind === 'refund' ? await sweepRefund(intent) : await sweepDebit(intent, { graceMs });
      out[r]++;
    }
  } finally {
    sweeping = false;
  }
  return out;
}
