import { ctx } from '../../lib/context.js';
import { CallIntent, TERMINAL } from './intent.model.js';

/**
 * The refund saga for a call (docs/MICROSERVICES.md section 4). It is the orders service's saga (itself the monolith's lib/wallet-saga.js) with the
 * debit half removed: a call's per-minute DEBITS need no intent, because `nextBillAt` on the call row only advances after the wallet answered and the
 * key `call:<id>:min:<n>` makes every retry a no-op (so a lost answer is simply asked again). A REFUND is different: the call is already over when
 * it is paid (a connect failure, an operator's goodwill), so nothing would ask again - hence a durable note first:
 *
 *   1. open an intent  { key, kind: 'refund', uid, amount, ofKey, ... }   (a write to this service's own database)
 *   2. call the wallet with the SAME key and the SAME `ofKey` on every retry
 *      - answered: close the intent `done` (a refusal closes it `failed`, loudly)
 *      - AMBIGUOUS (timeout / refused / 5xx): the intent stays `pending`
 *   3. the SWEEPER re-sends every old pending refund with its same key until the wallet answers; the key makes a repeat a no-op.
 *
 * Every refund this service writes carries `ofKey` (the minute's debit it reverses), which the wallet verifies. The only intents that do not are
 * goodwill refunds the MONOLITH queued before the calls service existed and the DB split copied here: their key is `call:<id>:goodwill:<rid>` and they
 * carry the operator's `reason`; the wallet accepts that shape, from `calls`, without an `ofKey` (see `refundProofOf`).
 */

/** A young intent may still be in flight in a live request. */
export const MIN_AGE_MS = 10_000;
export const GRACE_MS = 120_000;
export const RETENTION_DAYS = 30;

/** Create (or re-open, on a retry of the same request) the intent for this key. */
export async function openIntent(spec) {
  const { key, ...rest } = spec;
  return CallIntent.findOneAndUpdate(
    { key },
    { $set: { ...rest, status: 'pending', openedAt: new Date(), lastError: undefined } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

export const closeIntent = (key, status) => CallIntent.updateOne({ key }, { $set: { status } });

const noteFailure = (intent, e) =>
  CallIntent.updateOne({ _id: intent._id }, { $inc: { attempts: 1 }, $set: { lastError: String(e?.message || e).slice(0, 200) } });

/**
 * What a refund intent sends the wallet to prove what it reverses. New intents carry `ofKey`. One queued by the monolith (copied here by the DB
 * split) may not; its key says which debit it is for:
 *   call:<id>:refund:<n>        -> { ofKey: call:<id>:min:<n> }
 *   call:<id>:goodwill:<rid>    -> no single debit (it spans minutes): { reason: <the operator's reason> } - the wallet's one remaining exemption
 * Returns {} when nothing can be derived: the refund is then closed `failed`, loudly, rather than paid on a guess.
 */
export function refundProofOf(intent) {
  if (intent.ofKey) return { ofKey: intent.ofKey };
  let m;
  if ((m = /^call:([^:]+):refund:(\d+)$/.exec(intent.key))) return { ofKey: `call:${m[1]}:min:${m[2]}` };
  const reason = intent.reason || intent.note;
  if (/^call:[^:]+:goodwill:/.test(intent.key) && reason) return { reason };
  return {};
}

async function sweepRefund(intent) {
  try {
    const proof = refundProofOf(intent);
    if (!proof.ofKey && !proof.reason) throw Object.assign(new Error('this refund names no debit and none can be derived from its key'), { status: 400, code: 'ofkey_required' });
    await ctx.wallet.refund({
      uid: intent.uid, amount: intent.amount, refType: intent.refType, refId: intent.refId, idempotencyKey: intent.key, note: intent.note, createdBy: intent.createdBy,
      ...proof,
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

/** Delete terminal intents older than `retentionDays` (by last update). Pending intents are NEVER deleted, however old. Returns how many. */
export async function pruneIntents({ retentionDays = ctx.config?.intentRetentionDays ?? RETENTION_DAYS, now = Date.now() } = {}) {
  const r = await CallIntent.deleteMany({ status: { $in: TERMINAL }, updatedAt: { $lt: new Date(now - retentionDays * 86_400_000) } });
  return r.deletedCount ?? 0;
}

let sweeping = false;

/** One pass over the old pending refund intents. Returns counts so tests and logs can see what it did. */
export async function sweep({ minAgeMs = ctx.config?.intentMinAgeMs ?? MIN_AGE_MS, limit = 50 } = {}) {
  const out = { checked: 0, done: 0, failed: 0, expired: 0, waiting: 0 };
  if (sweeping) return out;
  sweeping = true;
  try {
    const rows = await CallIntent.find({ status: 'pending', openedAt: { $lt: new Date(Date.now() - minAgeMs) } }).sort({ openedAt: 1 }).limit(limit);
    for (const intent of rows) {
      out.checked++;
      out[await sweepRefund(intent)]++;
    }
  } finally {
    sweeping = false;
  }
  return out;
}
