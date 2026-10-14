import { ctx } from '../../lib/context.js';
import * as saga from './saga.js';

/**
 * The ONE place the calls code moves coins: the shape of the monolith's lib/wallet-ledger.js in wallet mode (there is no local ledger here).
 * Fail closed, the same idempotency keys as ever, and the durable refund intents of saga.js for the movements whose answer must not be lost.
 */

/** The balance as a GATE needs it (is there enough to start a call?): exact, or `wallet_unavailable`. */
export const getBalance = (uid) => ctx.wallet.getBalance(uid);

/** The balance as a DISPLAY needs it: the number, or undefined when the wallet cannot say. */
export const displayBalance = (uid) => ctx.wallet.balanceOrUndefined(uid);

export const isUnavailable = (e) => ctx.wallet.isUnavailable(e);

/** Spend coins, idempotent on `idempotencyKey`. Throws 402 `insufficient_coins`, or 503 `wallet_unavailable` (ambiguous). */
export const debit = (args) => ctx.wallet.debit(args);

const intentOf = (args) => ({
  key: args.idempotencyKey, kind: 'refund', uid: args.uid, amount: args.amount, refType: args.refType,
  refId: args.refId === undefined ? undefined : String(args.refId), note: args.note, createdBy: args.createdBy, ofKey: args.ofKey,
});

/** Open the intents of several refunds BEFORE any is sent, so a failure part-way leaves every one of them for the sweeper. */
export async function queueRefunds(list) {
  for (const args of list) await saga.openIntent(intentOf(args));
}

/**
 * A refund that must not be lost. The intent is written FIRST, then the wallet is asked; if it cannot answer, the sweeper keeps asking with the same
 * key. `args.ofKey` is the debit being reversed (required: the wallet checks it). `quiet` returns `{ queued: true }` instead of throwing 503 for callers
 * that must carry on (a call that never connected). `queued: true` in `opts` means the intent is already open (see `queueRefunds`).
 */
export async function refundDurably(args, { quiet = false, queued = false } = {}) {
  if (!queued) await saga.openIntent(intentOf(args));
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
