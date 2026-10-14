import * as local from '../modules/wallet/wallet.service.js';
import * as client from './wallet-client.js';
import * as saga from './wallet-saga.js';

/**
 * The ONE place the rest of the monolith moves coins (bookings, chadhava, calls). It has the shape of `modules/wallet/wallet.service.js`
 * and chooses where the money actually lives:
 *
 *   WALLET_URL unset  ->  the local `wallet.service` (the same functions, called directly - behaviour exactly as before)
 *   WALLET_URL set    ->  the wallet service through `lib/wallet-client.js` (fail closed, same idempotency keys), with the durable
 *                         intents of `lib/wallet-saga.js` for the purchases whose answer must not be lost.
 *
 * Nothing outside this file and the wallet module imports `wallet.service` any more, so "wallet.service is the only code that changes a
 * balance" holds in both modes (in the second it is the wallet SERVICE's copy).
 */
export const walletEnabled = client.walletEnabled;
export const isUnavailable = client.isUnavailable;

/** The balance as a GATE needs it (is there enough to start a call?): exact, or `wallet_unavailable`. */
export const getBalance = (uid) => (walletEnabled() ? client.getBalance(uid) : local.getBalance(uid));

/** The balance as a DISPLAY needs it: the number, or undefined when the wallet cannot say. */
export const displayBalance = (uid) => (walletEnabled() ? client.balanceOrUndefined(uid) : local.getBalance(uid));

/** Spend coins, idempotent on `idempotencyKey`. Throws 402 `insufficient_coins`, or (wallet mode) 503 `wallet_unavailable`. */
export const debit = (args) => (walletEnabled() ? client.debit(args) : local.debit(args));

/**
 * Return coins for a charge, idempotent on `idempotencyKey`. `ofKey` = the idempotency key of the debit being reversed (the wallet service
 * verifies it exists, is the same account's and is at least this large); `reason` = the explicit-reason exemption for an operator's goodwill
 * refund on a call. Ignored by the local ledger. (goodwill refunds that roll back on a definite refusal use this directly.)
 */
export const refund = (args) => (walletEnabled() ? client.refund(args) : local.refund(args));

export const credit = (args) => (walletEnabled() ? client.credit(args) : local.credit(args));

/**
 * A spend that creates an ORDER (booking / chadhava): in wallet mode the intent is written first, so an answer lost in transit is
 * recovered by the sweeper instead of becoming a charge with nothing behind it. `intent` = { kind, requestId, payload }.
 * Call `settled(key)` once the order is written.
 */
export async function debitForOrder(intent, args) {
  if (!walletEnabled()) return local.debit(args);
  await saga.openIntent({
    key: args.idempotencyKey, kind: intent.kind, uid: args.uid, amount: args.amount, type: args.type, refType: args.refType, note: args.note,
    requestId: intent.requestId, payload: intent.payload,
  });
  try {
    return await client.debit(args);
  } catch (e) {
    // Only a DEFINITE answer closes the intent. An ambiguous one leaves it pending for the sweeper.
    if (!client.isUnavailable(e)) await saga.closeIntent(args.idempotencyKey, 'failed').catch(() => {});
    throw e;
  }
}

/** The order behind a debit was written: its intent is finished. */
export const settled = (key) => (walletEnabled() ? saga.closeIntent(key, 'done').catch((e) => console.error(`! could not close intent ${key}: ${e.message}`)) : undefined);

/**
 * A refund that must not be lost. In wallet mode the intent is written FIRST (and `closes` - the debit intent this refund cancels - is
 * closed so the sweeper cannot also write the order), then the wallet is asked; if it cannot answer, the sweeper keeps asking with the same
 * key. `quiet` returns `{ queued: true }` instead of throwing 503 for callers that must carry on (a failed save, a call that never connected).
 */
export async function refundDurably(args, { closes, quiet = false } = {}) {
  if (!walletEnabled()) return local.refund(args);
  await saga.openIntent({ key: args.idempotencyKey, kind: 'refund', uid: args.uid, amount: args.amount, refType: args.refType, refId: args.refId === undefined ? undefined : String(args.refId), note: args.note, createdBy: args.createdBy, ofKey: args.ofKey, reason: args.reason });
  if (closes) await saga.closeIntent(closes, 'refunded');
  try {
    const out = await client.refund(args);
    await saga.closeIntent(args.idempotencyKey, 'done');
    return out;
  } catch (e) {
    if (client.isUnavailable(e)) {
      if (quiet) return { queued: true, balance: undefined, txn: null };
      throw e; // the refund is queued; the caller says "try again", and the retry is the same key
    }
    await saga.closeIntent(args.idempotencyKey, 'failed').catch(() => {});
    throw e;
  }
}

/**
 * The periodic reconcile (the billing ticker calls it every few seconds). Local mode: finish ledger rows stranded `pending` by a crash.
 * Wallet mode: sweep the intents; the wallet service reconciles its own ledger rows.
 */
export async function reconcilePending(opts) {
  if (!walletEnabled()) return local.reconcilePending(opts);
  return saga.sweep(opts);
}

