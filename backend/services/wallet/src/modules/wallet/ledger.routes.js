import { asyncRouter } from '../../lib/async-handler.js';
import { HttpError } from '../../lib/http-error.js';
import { WalletTxn } from './wallet.model.js';
import * as wallet from './wallet.service.js';

/**
 * The ledger API the order-side callers (the monolith now; orders and calls later) move coins through. /internal/wallet/...
 *
 *   POST /debit    { uid, amount, key, type, refType?, refId?, note? }   spend (402 insufficient_coins + shortfall when short)
 *   POST /refund   { uid, amount, key, ofKey, refType?, refId?, note?, createdBy? }       reverse ONE spend (see "Refunds" below)
 *   POST /refund   { uid, amount, key, reason, refType: 'call', ... }                   legacy goodwill path (monolith only, no ofKey)
 *   POST /credit   { uid, amount, key, type: 'bonus', ... }              goodwill credit (purchases are credited by the webhook / verify)
 *   GET  /txn?key=&uid=                                                 what happened to that key: { txn } or { txn: null }
 *   GET  /balance/:uid                                                  { balance }
 *   POST /reconcile { olderThanMs? }                                    finish rows left `pending` by a crash
 *
 * Every movement carries the caller's idempotency key, so a retry - or an ambiguous timeout followed by a retry - answers with the
 * FIRST result and never moves money twice. `wallet.service` stays the only code that touches a balance.
 */
export const DEBIT_TYPES = ['booking_debit', 'chadhava_debit', 'call_debit'];
const CREDIT_TYPES = ['bonus'];

/*
 * The events service (event rewards) is the only caller that can only ever GIVE coins, so it is boxed in: type `bonus` (above), a key
 * that starts with `event-` (a reward key can never collide with, or replay, a purchase / refund / adjustment key), and a sane amount.
 * It may look up only its own `event-` keys. perms.js already limits it to /credit and /txn.
 */
export const EVENTS_CALLER = 'events';
export const EVENTS_KEY_PREFIX = 'event-';
export const EVENTS_MAX_CREDIT = 100_000;
const eventsOnly = (req) => req.auth?.iss === EVENTS_CALLER;
const eventKey = (key) => typeof key === 'string' && key.startsWith(EVENTS_KEY_PREFIX) && key.length > EVENTS_KEY_PREFIX.length;

/*
 * Refunds (phase 5 hardening). The ledger used to trust its order-side callers: a refund was any positive number for any uid under any
 * fresh key, so a compromised caller could mint coins. Now a refund must name the spend it reverses:
 *
 *   ofKey   the idempotency key of the DEBIT being reversed. The wallet requires that debit to exist, be `posted`, be one of the three
 *           spend types, belong to the SAME uid, and be at least as large as the refund (amount <= debit); and the debit must not have
 *           been refunded already under a different key (a unique index on `ofKey` makes that race-proof). A retry with the SAME key is
 *           still the idempotent no-op it always was.
 *             409 refund_no_debit | refund_wrong_account | refund_debit_not_posted | refund_not_a_debit | already_refunded
 *             400 refund_exceeds_debit | ofkey_required
 *
 *   reason  the ONE exemption, for a refund that has no single debit behind it: an operator's goodwill refund on a call (many per-minute
 *           debits), as the MONOLITH records it. Accepted only with a non-empty `reason` and only for refType `call`, from:
 *             - the monolith (`LEGACY_REFUND_ISSUERS`), which bounds it itself (coinsRefunded <= coinsCharged on the call) - the phase 4/5 path, still
 *               live while CALLS_URL is unset on the monolith;
 *             - the calls service (phase 6), ONLY for a key shaped `call:<id>:goodwill:<requestId>` - the monolith's own key - i.e. to finish a refund
 *               the monolith queued before the calls service existed and the DB split copied across. The calls service's OWN goodwill refunds are
 *               `call:<id>:gw:<requestId>:<minute>` and always carry `ofKey` (one per minute's debit), so they never use this path. A call with no
 *               debit has nothing to refund (the call row bounds a goodwill refund by what it charged), so no new refund needs the exemption.
 *           Everyone else - orders, calls with any other key, a missing issuer - must send `ofKey`.
 */
const LEGACY_REFUND_ISSUERS = ['monolith', 'pooja-api'];
const LEGACY_GOODWILL_KEY = /^call:[^:]+:goodwill:/;
const goodwillExemption = (b, iss) =>
  typeof b.reason === 'string' && b.reason.trim() && b.refType === 'call'
  && (LEGACY_REFUND_ISSUERS.includes(iss) || (iss === 'calls' && typeof b.key === 'string' && LEGACY_GOODWILL_KEY.test(b.key)));

const txnView = (t) =>
  t && {
    id: String(t._id),
    uid: t.uid,
    type: t.type,
    amount: t.amount,
    status: t.status,
    balanceAfter: t.balanceAfter ?? null,
    refType: t.refType ?? null,
    refId: t.refId ?? null,
    idempotencyKey: t.idempotencyKey,
    failReason: t.failReason ?? null,
    createdAt: t.createdAt,
  };

const text = (v, max = 200) => (v === undefined || v === null ? undefined : String(v).slice(0, max));
const result = (out) => ({ ok: true, txn: txnView(out.txn), balance: out.balance, duplicate: !!out.duplicate });

/** The checks above, in the order a caller can act on them. Throws; returns nothing. */
async function checkRefundOf({ ofKey, uid, amount, key }) {
  const debit = await WalletTxn.findOne({ idempotencyKey: ofKey }).lean();
  if (!debit) throw new HttpError(409, 'refund_no_debit', 'There is no such charge to refund.');
  if (!uid || debit.uid !== uid) throw new HttpError(409, 'refund_wrong_account', 'That charge belongs to another account.');
  if (debit.status !== 'posted') throw new HttpError(409, 'refund_debit_not_posted', 'That charge was never completed, so there is nothing to refund.');
  if (!DEBIT_TYPES.includes(debit.type) || !(debit.amount < 0)) throw new HttpError(409, 'refund_not_a_debit', 'Only a spend can be refunded.');
  const n = Number(amount);
  if (Number.isInteger(n) && n > -debit.amount) {
    throw new HttpError(400, 'refund_exceeds_debit', 'A refund cannot be more than the charge.', { charged: -debit.amount, requested: n });
  }
  // The same key again is a retry (answered with the first result); a different key for an already-refunded charge is a second refund.
  const prior = await WalletTxn.findOne({ ofKey, type: 'refund' }).select('idempotencyKey').lean();
  if (prior && prior.idempotencyKey !== key) throw new HttpError(409, 'already_refunded', 'That charge has already been refunded.');
}

export function ledgerRoutes() {
  const r = asyncRouter();

  r.post('/debit', async (req, res) => {
    const b = req.body ?? {};
    if (!DEBIT_TYPES.includes(b.type)) throw new HttpError(400, 'bad_type', `type must be one of ${DEBIT_TYPES.join(', ')}.`);
    const out = await wallet.debit({
      uid: b.uid, amount: b.amount, type: b.type, refType: text(b.refType, 40), refId: text(b.refId, 100), idempotencyKey: b.key, note: text(b.note),
    });
    res.json(result(out));
  });

  r.post('/refund', async (req, res) => {
    const b = req.body ?? {};
    const ofKey = typeof b.ofKey === 'string' && b.ofKey ? b.ofKey : undefined;
    if (b.ofKey !== undefined && b.ofKey !== null && !ofKey) throw new HttpError(400, 'ofkey_required', 'ofKey must be the idempotency key of the spend being refunded.');
    if (ofKey) await checkRefundOf({ ofKey, uid: b.uid, amount: b.amount, key: b.key });
    else if (!goodwillExemption(b, req.auth?.iss)) {
      throw new HttpError(400, 'ofkey_required', 'A refund must name the spend it reverses (ofKey).');
    }
    const out = await wallet.refund({
      uid: b.uid, amount: b.amount, refType: text(b.refType, 40), refId: text(b.refId, 100), idempotencyKey: b.key, note: text(b.note), createdBy: text(b.createdBy, 80), ofKey,
    });
    res.json(result(out));
  });

  r.post('/credit', async (req, res) => {
    const b = req.body ?? {};
    if (!CREDIT_TYPES.includes(b.type)) throw new HttpError(400, 'bad_type', `type must be one of ${CREDIT_TYPES.join(', ')}.`);
    if (eventsOnly(req)) {
      if (!eventKey(b.key)) throw new HttpError(403, 'key_not_allowed', `This caller may only credit with a key starting "${EVENTS_KEY_PREFIX}".`);
      if (!Number.isInteger(b.amount) || b.amount < 1 || b.amount > EVENTS_MAX_CREDIT) throw new HttpError(400, 'bad_amount', `amount must be a whole number from 1 to ${EVENTS_MAX_CREDIT}.`);
    }
    const out = await wallet.credit({
      uid: b.uid, amount: b.amount, type: b.type, refType: text(b.refType, 40), refId: text(b.refId, 100), idempotencyKey: b.key, note: text(b.note), createdBy: text(b.createdBy, 80),
    });
    res.json(result(out));
  });

  r.get('/txn', async (req, res) => {
    if (eventsOnly(req) && !eventKey(req.query.key)) throw new HttpError(403, 'key_not_allowed', `This caller may only look up keys starting "${EVENTS_KEY_PREFIX}".`);
    const txn = await wallet.findByKey(String(req.query.key ?? ''), { uid: req.query.uid ? String(req.query.uid) : undefined });
    res.json({ txn: txnView(txn) });
  });

  r.get('/balance/:uid', async (req, res) => res.json({ balance: await wallet.getBalance(req.params.uid) }));

  r.post('/reconcile', async (req, res) => {
    const olderThanMs = Number(req.body?.olderThanMs);
    res.json(await wallet.reconcilePending(Number.isFinite(olderThanMs) && olderThanMs >= 0 ? { olderThanMs } : undefined));
  });

  return r;
}
