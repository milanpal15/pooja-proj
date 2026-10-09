import mongoose from 'mongoose';

import { HttpError } from '../../lib/http-error.js';
import { getBoolSetting, getNumberSetting } from '../../lib/settings.js';
import { User } from '../../models.js';
import { Astrologer, effectivePresence } from '../astrologers/astrologer.model.js';
import { AstrologerEarning } from '../payouts/payout.model.js';
import * as wallet from '../wallet/wallet.service.js';
import { CallSession } from './call.model.js';
import { notifyIncomingCall } from './call.push.js';
import { getRtcProvider, RTC_UID } from './rtc.provider.js';

/**
 * The call state machine (DESIGN.md §19.4) and the money rules (§19.2).
 *
 *   requested ──accept──▶ connected ──end / out of coins / silence──▶ ended
 *       └─ decline | missed | cancelled ─────────────────────────────▶ ended
 *
 * Every transition is ONE conditional update (`findOneAndUpdate` filtered on the
 * state it expects), so two requests racing — accept/accept, end/end, cancel vs
 * accept — have exactly one winner and the loser sees the settled state.
 *
 * Minute k starts at `answeredAt + (k-1)·60s` and is charged at that moment,
 * debit key `call:<id>:min:<k>`. Because the key is derived from the call and
 * the minute, a double tick, a retry or a crash mid-tick can never double-charge.
 */

const MIN_MS = 60_000;
const oid = (id) => (mongoose.isValidObjectId(id) ? id : null);
const notFound = () => new HttpError(404, 'call_not_found', 'Call not found.');
const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';

/** Load a call the caller takes part in; anything else is a 404, not a 403 (no probing). */
export async function loadForParticipant(id, uid) {
  if (!oid(id)) throw notFound();
  const call = await CallSession.findById(id);
  if (!call || (call.devoteeUid !== uid && call.astrologerUid !== uid)) throw notFound();
  return call;
}

/* ----------------------------------------------------------- request -- */

export async function requestCall({ devoteeUid, astrologerId, requestId, now = new Date() }) {
  if (!requestId || typeof requestId !== 'string') throw new HttpError(400, 'no_request_id', 'A requestId is required.');
  if (!(await getBoolSetting('callsEnabled', true))) throw new HttpError(503, 'calls_disabled', 'Astrologer calls are switched off for now.');
  getRtcProvider(); // 503 calls_unavailable before anything is promised to the devotee

  // A retry of the same request returns the same call.
  const prior = await CallSession.findOne({ devoteeUid, requestId });
  if (prior) return prior;

  const a = oid(astrologerId) ? await Astrologer.findById(astrologerId) : null;
  if (!a || a.status !== 'active' || !a.listed) throw new HttpError(409, 'astrologer_unavailable', 'This astrologer is not available.');
  if (a.uid === devoteeUid) throw new HttpError(400, 'self_call', 'You cannot call yourself.');
  if (effectivePresence(a, now.getTime()) !== 'online') {
    throw new HttpError(409, 'astrologer_unavailable', 'This astrologer is not available right now.', { presence: effectivePresence(a, now.getTime()) });
  }

  const minMinutes = await getNumberSetting('minMinutes', 3);
  const needed = minMinutes * a.ratePerMin;
  const balance = await wallet.getBalance(devoteeUid);
  if (balance < needed) {
    throw new HttpError(402, 'insufficient_coins', 'Not enough coins to start this call.', { needed, balance, shortfall: needed - balance });
  }

  const devotee = await User.findOne({ uid: devoteeUid }).select('name').lean();
  const _id = new mongoose.Types.ObjectId();
  try {
    const call = await CallSession.create({
      _id,
      devoteeUid,
      devoteeName: devotee?.name || '',
      astrologerId: a._id,
      astrologerUid: a.uid,
      astrologerName: a.name,
      astrologerPhotoUrl: a.photoUrl || '',
      requestId,
      status: 'requested',
      ratePerMinSnapshot: a.ratePerMin,
      shareSnapshot: a.platformSharePct,
      requestedAt: now,
      rtcChannel: `call-${_id}`,
      devoteeLive: true,
    });
    notifyIncomingCall(a.uid, firstName(devotee?.name)); // best effort, never awaited
    return call;
  } catch (e) {
    if (e?.code !== 11000) throw e;
    const again = await CallSession.findOne({ devoteeUid, requestId });
    if (again) return again; // same request raced itself
    throw new HttpError(409, 'already_in_call', 'You already have a call in progress.');
  }
}

/* ------------------------------------------------------------ billing -- */

async function earnMinute(call, n, now) {
  const paisePerCoin = await getNumberSetting('payoutPaisePerCoin', 100);
  const coins = Math.floor((call.ratePerMinSnapshot * (100 - call.shareSnapshot)) / 100);
  await AstrologerEarning.updateOne(
    { callId: call._id, minute: n },
    { $setOnInsert: { astrologerId: call.astrologerId, callId: call._id, minute: n, coins, paise: coins * paisePerCoin, at: now } },
    { upsert: true },
  );
}

/**
 * Charge the next started minute. Returns `{ call }` or `{ outOfCoins: true }`.
 * Safe to run twice for the same minute: the wallet dedupes on the key, the
 * counter bump is conditional on `minutesBilled` still being n-1, and the
 * earning row is an upsert on (callId, minute).
 */
export async function billNextMinute(call, now = new Date()) {
  const n = call.minutesBilled + 1;
  try {
    await wallet.debit({
      uid: call.devoteeUid,
      amount: call.ratePerMinSnapshot,
      type: 'call_debit',
      refType: 'call',
      refId: call._id,
      idempotencyKey: `call:${call._id}:min:${n}`,
      note: `Astrologer call, minute ${n}`,
    });
  } catch (e) {
    if (e instanceof HttpError && e.code === 'insufficient_coins') return { outOfCoins: true };
    throw e;
  }
  const updated = await CallSession.findOneAndUpdate(
    { _id: call._id, minutesBilled: n - 1 },
    {
      $inc: { minutesBilled: 1, coinsCharged: call.ratePerMinSnapshot },
      $set: { nextBillAt: new Date(call.answeredAt.getTime() + n * MIN_MS) },
    },
    { new: true },
  );
  await earnMinute(call, n, now);
  return { call: updated ?? (await CallSession.findById(call._id)) };
}

/** Give back what a call that never really connected had charged, and void its earnings. */
async function refundConnectFailure(call) {
  for (let n = 1; n <= call.minutesBilled; n++) {
    await wallet.refund({
      uid: call.devoteeUid,
      amount: call.ratePerMinSnapshot,
      refType: 'call',
      refId: call._id,
      idempotencyKey: `call:${call._id}:refund:${n}`,
      note: 'Call did not connect',
    });
  }
  await AstrologerEarning.updateMany({ callId: call._id, voidedAt: { $exists: false } }, { $set: { voidedAt: new Date() } });
  await CallSession.updateOne({ _id: call._id }, { $set: { coinsRefunded: call.minutesBilled * call.ratePerMinSnapshot } });
}

/* ------------------------------------------------------------- finish -- */

/** The single way a call ends. Returns the ended call, or null if another request got there first. */
export async function finishCall(id, fromStatuses, reason, endedAt = new Date()) {
  const call = await CallSession.findOneAndUpdate(
    { _id: id, status: { $in: fromStatuses } },
    { $set: { status: 'ended', endReason: reason, endedAt }, $unset: { nextBillAt: 1, devoteeLive: 1, astrologerLive: 1 } },
    { new: true },
  );
  if (!call) return null;
  if (call.answeredAt) await Astrologer.updateOne({ _id: call.astrologerId, presence: 'busy' }, { $set: { presence: 'online' } });
  if (reason === 'failed' && call.minutesBilled > 0) await refundConnectFailure(call);
  return (await CallSession.findById(id)) ?? call;
}

/* ---------------------------------------------------------- transitions -- */

export async function cancelCall(call) {
  if (call.status === 'ended') return call;
  const done = await finishCall(call._id, ['requested'], 'cancelled');
  if (done) return done;
  const fresh = await CallSession.findById(call._id);
  if (fresh.status === 'connected') throw new HttpError(409, 'already_connected', 'The astrologer already answered — end the call instead.');
  return fresh;
}

export async function declineCall(call) {
  if (call.status === 'ended') return call;
  const done = await finishCall(call._id, ['requested'], 'declined');
  return done ?? (await CallSession.findById(call._id));
}

export async function acceptCall(call, now = new Date()) {
  if (call.status === 'ended') throw new HttpError(409, 'call_ended', 'This call has already ended.', { endReason: call.endReason });
  const provider = getRtcProvider();
  const ringMs = (await getNumberSetting('ringTimeoutSec', 25)) * 1000;

  let won;
  try {
    won = await CallSession.findOneAndUpdate(
      { _id: call._id, status: 'requested', requestedAt: { $gte: new Date(now.getTime() - ringMs) } },
      { $set: { status: 'connected', answeredAt: now, nextBillAt: now, astrologerLive: true, astrologerSeenAt: now } },
      { new: true },
    );
  } catch (e) {
    if (e?.code === 11000) throw new HttpError(409, 'astrologer_busy', 'You are already on a call.');
    throw e;
  }
  if (!won) {
    const fresh = await CallSession.findById(call._id);
    if (fresh.status === 'connected') return fresh; // a concurrent/duplicate accept: idempotent
    throw new HttpError(409, 'call_ended', 'This call is no longer waiting for an answer.', { endReason: fresh.endReason });
  }

  const billed = await billNextMinute(won, now);
  if (billed.outOfCoins) {
    // Balance fell below one minute between request and answer. Nothing was charged.
    return (await finishCall(won._id, ['connected'], 'out_of_coins', now)) ?? (await CallSession.findById(won._id));
  }
  await Astrologer.updateOne({ _id: won.astrologerId }, { $set: { presence: 'busy' } });

  try {
    await provider.issue({ channel: won.rtcChannel, uid: RTC_UID.astrologer });
  } catch (e) {
    // Charged, but we cannot hand out audio credentials: give it back.
    await finishCall(won._id, ['connected'], 'failed', now);
    throw e instanceof HttpError ? e : new HttpError(503, 'calls_unavailable', 'Could not set up the audio channel.');
  }
  return billed.call;
}

/** Either party ends a connected call; idempotent. A still-ringing call maps to cancel/decline. */
export async function endCall(call, viewerUid) {
  if (call.status === 'ended') return call;
  if (call.status === 'requested') return viewerUid === call.devoteeUid ? cancelCall(call) : declineCall(call);
  const done = await finishCall(call._id, ['connected'], 'completed');
  return done ?? (await CallSession.findById(call._id));
}

/** Operator force-end (also what suspend/delete use). Works on a ringing call too. */
export async function adminEnd(id) {
  const done = await finishCall(id, ['requested', 'connected'], 'admin');
  return done ?? (await CallSession.findById(id));
}

/** End every live call of an astrologer — suspend / delete / identifier change. */
export async function endLiveCallsOf(astrologerId) {
  const live = await CallSession.find({ astrologerId, status: { $in: ['requested', 'connected'] } }).select('_id').lean();
  for (const c of live) await adminEnd(c._id);
}

export async function rateCall(call, rating) {
  const r = Number(rating);
  if (!Number.isInteger(r) || r < 1 || r > 5) throw new HttpError(400, 'bad_rating', 'Rating must be a whole number from 1 to 5.');
  if (call.status !== 'ended' || !call.answeredAt) throw new HttpError(409, 'not_rateable', 'Only a call that connected and ended can be rated.');
  const done = await CallSession.findOneAndUpdate(
    { _id: call._id, rating: { $exists: false } },
    { $set: { rating: r } },
    { new: true },
  );
  if (!done) throw new HttpError(409, 'already_rated', 'You have already rated this call.');
  return done;
}

/**
 * Goodwill refund by an operator. Reserve the coins on the call first (so the
 * total can never exceed what was charged, even with two operators at once),
 * then pay; if paying fails, release the reservation.
 */
export async function goodwillRefund(id, { coins, reason, requestId, operator }) {
  const n = Number(coins);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'bad_amount', 'Enter a whole number of coins.');
  if (!String(reason ?? '').trim()) throw new HttpError(400, 'reason_required', 'A reason is required for every refund.');
  if (!oid(id)) throw notFound();
  const rid = String(requestId || new mongoose.Types.ObjectId());
  const entry = { requestId: rid, coins: n, reason: String(reason).trim(), by: operator, at: new Date() };

  const reserved = await CallSession.findOneAndUpdate(
    { _id: id, 'refunds.requestId': { $ne: rid }, $expr: { $lte: [{ $add: ['$coinsRefunded', n] }, '$coinsCharged'] } },
    { $inc: { coinsRefunded: n }, $push: { refunds: entry } },
    { new: true },
  );
  if (!reserved) {
    const call = await CallSession.findById(id);
    if (!call) throw notFound();
    if (call.refunds.some((r) => r.requestId === rid)) return { call, balance: await wallet.getBalance(call.devoteeUid), duplicate: true };
    throw new HttpError(400, 'refund_exceeds_charge', 'That is more than this call charged.', { charged: call.coinsCharged, refunded: call.coinsRefunded });
  }
  try {
    const out = await wallet.refund({
      uid: reserved.devoteeUid,
      amount: n,
      refType: 'call',
      refId: reserved._id,
      idempotencyKey: `call:${reserved._id}:goodwill:${rid}`,
      note: entry.reason,
      createdBy: operator,
    });
    return { call: reserved, balance: out.balance };
  } catch (e) {
    await CallSession.updateOne({ _id: id }, { $inc: { coinsRefunded: -n }, $pull: { refunds: { requestId: rid } } });
    throw e;
  }
}

/* --------------------------------------------------------------- views -- */

export async function ratingsFor(astrologerIds) {
  const rows = await CallSession.aggregate([
    { $match: { astrologerId: { $in: astrologerIds }, rating: { $exists: true } } },
    { $group: { _id: '$astrologerId', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), { ratingAvg: Math.round(r.avg * 10) / 10, ratingCount: r.count }]));
}

/**
 * What a participant (or, with `viewerUid` null, an operator) gets to see.
 * The astrologer sees only the devotee's FIRST name; the devotee never sees an
 * astrologer's sign-in identifiers (they are not on the call at all).
 */
export async function toView(call, { viewerUid, now = new Date() } = {}) {
  const isDevotee = viewerUid && viewerUid === call.devoteeUid;
  const isAstrologer = viewerUid && viewerUid === call.astrologerUid;
  const live = await Astrologer.findById(call.astrologerId).select('name photoUrl').lean();
  const rate = call.ratePerMinSnapshot;

  const view = {
    id: String(call._id),
    status: call.status,
    endReason: call.endReason ?? null,
    astrologer: { id: String(call.astrologerId), name: live?.name ?? call.astrologerName, photoUrl: live?.photoUrl ?? call.astrologerPhotoUrl },
    devotee: { name: firstName(call.devoteeName) },
    ratePerMin: rate,
    minutesBilled: call.minutesBilled,
    coinsCharged: call.coinsCharged,
    coinsRefunded: call.coinsRefunded,
    rated: call.rating != null,
    secondsToNextCharge: 0,
    lowBalance: false,
    requestedAt: call.requestedAt,
    answeredAt: call.answeredAt ?? null,
    endedAt: call.endedAt ?? null,
  };

  if (call.status === 'connected') {
    const toNext = Math.max(0, Math.ceil((new Date(call.nextBillAt).getTime() - now.getTime()) / 1000));
    view.secondsToNextCharge = toNext;
    // How long the devotee can still talk: until the first charge that cannot be paid.
    const balance = await wallet.getBalance(call.devoteeUid);
    const secondsLeft = toNext + 60 * Math.floor(balance / rate);
    view.lowBalance = secondsLeft <= 60;
    if (isDevotee) view.balance = balance;
    if (isDevotee || isAstrologer) {
      try {
        view.rtc = await getRtcProvider().issue({ channel: call.rtcChannel, uid: isDevotee ? RTC_UID.devotee : RTC_UID.astrologer });
      } catch {
        /* no credentials: the client reports it cannot connect */
      }
    }
  } else if (isDevotee) {
    view.balance = await wallet.getBalance(call.devoteeUid);
  }
  return view;
}

export function toRow(call, { forAstrologer = false } = {}) {
  const durationSec = call.answeredAt && call.endedAt ? Math.max(0, Math.round((call.endedAt - call.answeredAt) / 1000)) : 0;
  return {
    id: String(call._id),
    startedAt: call.answeredAt ?? call.requestedAt,
    devoteeName: forAstrologer ? firstName(call.devoteeName) : call.devoteeName,
    astrologerName: call.astrologerName,
    durationSec,
    coins: call.coinsCharged - call.coinsRefunded,
    minutesBilled: call.minutesBilled,
    status: call.status,
    endReason: call.endReason ?? null,
    rating: call.rating ?? null,
  };
}
