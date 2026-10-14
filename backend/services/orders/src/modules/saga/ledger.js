import { ctx } from '../../lib/context.js';
import * as saga from './saga.js';

/**
 * The ONE place the orders code moves coins: the shape of the monolith's lib/wallet-ledger.js in wallet mode (there is no local ledger here).
 * Fail closed, the same idempotency keys as ever, and the durable intents of saga.js for the movements whose answer must not be lost.
 */

/** The balance as a DISPLAY needs it: the number, or undefined when the wallet cannot say. */
export const displayBalance = (uid) => ctx.wallet.balanceOrUndefined(uid);

/**
 * A spend that creates an ORDER (booking / chadhava): the intent is written first, so an answer lost in transit is recovered by the sweeper
 * instead of becoming a charge with nothing behind it. `intent` = { kind, requestId, payload }. Call `settled(key)` once the order is written.
 */
export async function debitForOrder(intent, args) {
  await saga.openIntent({
    key: args.idempotencyKey, kind: intent.kind, uid: args.uid, amount: args.amount, type: args.type, refType: args.refType, note: args.note,
    requestId: intent.requestId, payload: intent.payload,
  });
  try {
    return await ctx.wallet.debit(args);
  } catch (e) {
    // Only a DEFINITE answer closes the intent. An ambiguous one leaves it pending for the sweeper.
    if (!ctx.wallet.isUnavailable(e)) await saga.closeIntent(args.idempotencyKey, 'failed').catch(() => {});
    throw e;
  }
}

/** The order behind a debit was written: its intent is finished. */
export const settled = (key) => saga.closeIntent(key, 'done').catch((e) => ctx.log.error(`could not close intent ${key}: ${e.message}`));

/**
 * A refund that must not be lost. The intent is written FIRST (and `closes` - the debit intent this refund cancels - is closed so the sweeper
 * cannot also write the order), then the wallet is asked; if it cannot answer, the sweeper keeps asking with the same key. `args.ofKey` is the
 * debit being reversed (required: the wallet checks it). `quiet` returns `{ queued: true }` instead of throwing 503 for callers that must carry
 * on (a failed save).
 */
export async function refundDurably(args, { closes, quiet = false } = {}) {
  await saga.openIntent({
    key: args.idempotencyKey, kind: 'refund', uid: args.uid, amount: args.amount, refType: args.refType,
    refId: args.refId === undefined ? undefined : String(args.refId), note: args.note, createdBy: args.createdBy, ofKey: args.ofKey,
  });
  if (closes) await saga.closeIntent(closes, 'refunded');
  try {
    const out = await ctx.wallet.refund(args);
    await saga.closeIntent(args.idempotencyKey, 'done');
    return out;
  } catch (e) {
    if (ctx.wallet.isUnavailable(e)) {
      if (quiet) return { queued: true, balance: undefined, txn: null };
      throw e; // the refund is queued; the caller says "try again", and the retry is the same key
    }
    await saga.closeIntent(args.idempotencyKey, 'failed').catch(() => {});
    throw e;
  }
}
