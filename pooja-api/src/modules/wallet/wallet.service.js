import { HttpError } from '../../lib/http-error.js';
import { Wallet, WalletTxn } from './wallet.model.js';

/**
 * The ONLY code that changes a coin balance.
 *
 * Calls, bookings, chadhava, recharges and operator adjustments all go through
 * `credit()` / `debit()` / `refund()`. Nothing else may touch `Wallet` or
 * `WalletTxn` — that is what keeps "balance == sum of the ledger" true.
 *
 * ── How a debit is made safe without database transactions ──────────────
 *
 *  1. Insert the ledger row as `pending`. Its `idempotencyKey` is unique, so a
 *     retry of the same request finds the original row instead of charging again.
 *  2. Apply it with ONE conditional update on the wallet:
 *        balance >= amount  AND  txn id not yet in `applied`
 *     `$inc` the balance and `$push` the txn id in the same atomic write. The
 *     balance can never go negative, and a second attempt cannot double-apply.
 *  3. Mark the ledger row `posted` with the resulting balance.
 *
 * A crash between 2 and 3 leaves a `pending` row whose id is already in
 * `applied`; `settle()` (also run by `reconcilePending`) finishes it.
 */

const APPLIED_WINDOW = 200;

const asInt = (n) => {
  const v = Number(n);
  if (!Number.isInteger(v) || v <= 0) throw new HttpError(400, 'bad_amount', 'Amount must be a positive whole number of coins.');
  return v;
};

async function ensureWallet(uid) {
  try {
    await Wallet.updateOne({ uid }, { $setOnInsert: { uid, balance: 0, applied: [] } }, { upsert: true });
  } catch (e) {
    if (e?.code !== 11000) throw e; // two first-time requests racing: the other one created it
  }
}

export async function getBalance(uid) {
  const w = await Wallet.findOne({ uid }).lean();
  return w?.balance ?? 0;
}

/** Create the pending ledger row, or return the existing one for this key. */
async function openTxn(fields) {
  try {
    const txn = await WalletTxn.create({ ...fields, status: 'pending' });
    return { txn, existing: false };
  } catch (e) {
    if (e?.code !== 11000) throw e;
    const txn = await WalletTxn.findOne({ idempotencyKey: fields.idempotencyKey });
    if (!txn) throw e;
    if (txn.uid !== fields.uid) throw new HttpError(409, 'key_reused', 'That request id belongs to another account.');
    return { txn, existing: true };
  }
}

/** Fold one pending txn into the balance exactly once. Returns the new balance or null if refused. */
async function apply(txn) {
  const id = String(txn._id);
  const delta = txn.amount;
  const filter = { uid: txn.uid, applied: { $ne: id } };
  if (delta < 0) filter.balance = { $gte: -delta };

  const updated = await Wallet.findOneAndUpdate(
    filter,
    { $inc: { balance: delta }, $push: { applied: { $each: [id], $slice: -APPLIED_WINDOW } } },
    { new: true },
  );
  if (updated) return updated.balance;

  // Not updated: either already applied (a retry) or genuinely short of coins.
  const w = await Wallet.findOne({ uid: txn.uid }).lean();
  if (w?.applied?.includes(id)) return w.balance;
  return null;
}

async function settle(txn, { type }) {
  const balance = await apply(txn);
  if (balance === null) {
    const w = await Wallet.findOne({ uid: txn.uid }).lean();
    const have = w?.balance ?? 0;
    await WalletTxn.updateOne({ _id: txn._id, status: 'pending' }, { $set: { status: 'failed', failReason: 'insufficient_coins' } });
    const needed = -txn.amount;
    throw new HttpError(402, 'insufficient_coins', 'Not enough coins.', {
      needed,
      balance: have,
      shortfall: Math.max(needed - have, 0),
      type,
    });
  }
  const posted = await WalletTxn.findOneAndUpdate(
    { _id: txn._id, status: 'pending' },
    { $set: { status: 'posted', balanceAfter: balance } },
    { new: true },
  );
  return { txn: posted ?? (await WalletTxn.findById(txn._id)), balance };
}

/** Shared entry for credit & debit. */
async function move({ uid, amount, type, refType, refId, idempotencyKey, note, createdBy, sign }) {
  if (!uid) throw new HttpError(400, 'no_user', 'A wallet needs an account.');
  if (!idempotencyKey) throw new HttpError(400, 'no_key', 'Every coin movement needs an idempotency key.');
  const n = asInt(amount);

  await ensureWallet(uid);
  const { txn, existing } = await openTxn({
    uid, type, amount: sign * n, refType, refId: refId ? String(refId) : undefined, idempotencyKey, note, createdBy,
  });

  if (existing) {
    if (txn.status === 'posted') return { txn, balance: txn.balanceAfter ?? (await getBalance(uid)), duplicate: true };
    if (txn.status === 'failed') {
      // A charge refused for lack of coins moved nothing, so the same key may try again once the
      // devotee has topped up. Reopening is one atomic flip; `apply` still folds a txn in only once,
      // so a double submit can never charge twice. Losing the flip means another request is already
      // retrying it: re-read and answer from whatever state it reached.
      const reopened = await WalletTxn.findOneAndUpdate(
        { _id: txn._id, status: 'failed' },
        { $set: { status: 'pending' }, $unset: { failReason: 1 } },
        { new: true },
      );
      if (reopened) return { ...(await settle(reopened, { type })), duplicate: false };
      const cur = await WalletTxn.findById(txn._id);
      if (cur?.status === 'posted') return { txn: cur, balance: cur.balanceAfter ?? (await getBalance(uid)), duplicate: true };
      if (cur?.status === 'failed') {
        const have = await getBalance(uid);
        throw new HttpError(402, 'insufficient_coins', 'Not enough coins.', { needed: n, balance: have, shortfall: Math.max(n - have, 0), type });
      }
      return { ...(await settle(cur, { type })), duplicate: true };
    }
    // pending: a crashed earlier attempt — finish it.
    const out = await settle(txn, { type });
    return { ...out, duplicate: true };
  }
  const out = await settle(txn, { type });
  return { ...out, duplicate: false };
}

export const credit = (args) => move({ ...args, sign: +1 });

/** Spend coins. Throws `HttpError(402, 'insufficient_coins', …)` when short. */
export const debit = (args) => move({ ...args, sign: -1 });

/** Return coins for a charge. Same as a credit, typed `refund` so reports can tell it apart. */
export const refund = (args) => move({ ...args, type: 'refund', sign: +1 });

/** Operator correction: positive credits, negative debits. A reason is mandatory. */
export async function adjust({ uid, amount, reason, requestId, operator }) {
  const n = Number(amount);
  if (!Number.isInteger(n) || n === 0) throw new HttpError(400, 'bad_amount', 'Enter a whole number of coins, positive or negative.');
  if (!String(reason ?? '').trim()) throw new HttpError(400, 'reason_required', 'A reason is required for every adjustment.');
  const base = {
    uid,
    amount: Math.abs(n),
    type: 'adjustment',
    refType: 'admin',
    idempotencyKey: `adjust:${requestId || `${uid}:${Date.now()}:${Math.random().toString(36).slice(2)}`}`,
    note: String(reason).trim(),
    createdBy: operator,
  };
  return n > 0 ? credit(base) : debit(base);
}

/** Finish ledger rows left `pending` by a crash. Safe to run repeatedly. */
export async function reconcilePending({ olderThanMs = 60_000 } = {}) {
  const cutoff = new Date(Date.now() - olderThanMs);
  const stray = await WalletTxn.find({ status: 'pending', createdAt: { $lt: cutoff } }).limit(200);
  let finished = 0;
  for (const t of stray) {
    try {
      await settle(t, { type: t.type });
      finished++;
    } catch {
      /* a debit that cannot be afforded is marked failed by settle() */
    }
  }
  return { checked: stray.length, finished };
}

/** Invariant check: does the cached balance equal the sum of posted ledger rows? */
export async function verifyWallet(uid) {
  const [w, sum] = await Promise.all([
    Wallet.findOne({ uid }).lean(),
    WalletTxn.aggregate([{ $match: { uid, status: 'posted' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
  ]);
  const ledger = sum[0]?.total ?? 0;
  const balance = w?.balance ?? 0;
  return { uid, balance, ledger, ok: balance === ledger };
}

export async function listTransactions(uid, { limit = 30, before } = {}) {
  const q = { uid, status: 'posted' };
  if (before) q.createdAt = { $lt: new Date(before) };
  return WalletTxn.find(q).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 30, 100)).lean();
}
