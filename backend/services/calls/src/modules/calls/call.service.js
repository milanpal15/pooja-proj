import mongoose from 'mongoose';

import { ctx } from '../../lib/context.js';
import { HttpError } from '../../lib/http-error.js';
import { getRtcProvider, RTC_UID } from '../../lib/rtc.js';
import { Astrologer, effectivePresence } from '../astrologers/astrologer.model.js';
import { AstrologerEarning } from '../payouts/payout.model.js';
import * as wallet from '../saga/ledger.js';
import { CallIntent } from '../saga/intent.model.js';
import { closeIntent } from '../saga/saga.js';
import { CallSession } from './call.model.js';

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
 *
 * Moved from the monolith's modules/calls/call.service.js. What changed: coins and settings come from services (wallet, engagement) and FAIL
 * CLOSED; a minute's earning is priced BEFORE its coins move; goodwill refunds carry `ofKey` (see goodwillRefund).
 */

const MIN_MS = 60_000;
const oid = (id) => (mongoose.isValidObjectId(id) ? id : null);
const notFound = () => new HttpError(404, 'call_not_found', 'Call not found.');

/**
 * An error that means "not now", not "no": the wallet could not answer (the debit may or may not have landed) or a money rule could not be read.
 * A minute that hits one is NOT billed, NOT ended on a guess, and is simply asked again with the SAME key on the next tick.
 */
export const isDeferrable = (e) => wallet.isUnavailable(e) || (e instanceof HttpError && e.code === 'settings_unavailable');
const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';

/** Load a call the caller takes part in; anything else is a 404, not a 403 (no probing). */
export async function loadForParticipant(id, uid) {
  if (!oid(id)) throw notFound();
  const call = await CallSession.findById(id);
  if (!call || (call.devoteeUid !== uid && call.astrologerUid !== uid)) throw notFound();
  return call;
}

/* ----------------------------------------------------------- request -- */

export async function requestCall({ devoteeUid, astrologerId, requestId, devoteeName, now = new Date() }) {
  if (!requestId || typeof requestId !== 'string') throw new HttpError(400, 'no_request_id', 'A requestId is required.');
  if (!(await ctx.settings.getBool('callsEnabled', true))) throw new HttpError(503, 'calls_disabled', 'Astrologer calls are switched off for now.');
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

  const minMinutes = await ctx.settings.getNumber('minMinutes', 3);
  const needed = minMinutes * a.ratePerMin;
  const balance = await wallet.getBalance(devoteeUid);
  if (balance < needed) {
    throw new HttpError(402, 'insufficient_coins', 'Not enough coins to start this call.', { needed, balance, shortfall: needed - balance });
  }

  const devoteeNameNow = await ctx.identity.userName(devoteeUid, devoteeName);
  const _id = new mongoose.Types.ObjectId();
  try {
    const call = await CallSession.create({
      _id,
      devoteeUid,
      devoteeName: devoteeNameNow,
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
    try {
      ctx.push.notifyIncomingCall(a.uid, firstName(devoteeNameNow), call._id); // best effort, never awaited
    } catch (e) {
      ctx.log.warn(`incoming-call push to ${a.uid} not sent (${e?.message})`); // the call row is written: nothing a notification does may fail the request
    }
    return call;
  } catch (e) {
    if (e?.code !== 11000) throw e;
    const again = await CallSession.findOne({ devoteeUid, requestId });
    if (again) return again; // same request raced itself
    throw new HttpError(409, 'already_in_call', 'You already have a call in progress.');
  }
}

/* ------------------------------------------------------------ billing -- */

/** What a billed minute earns the astrologer: the share snapshot on the call x the payout rate IN FORCE NOW (fresh, fails closed). */
const minuteEarning = (call, paisePerCoin) => Math.floor((call.ratePerMinSnapshot * (100 - call.shareSnapshot)) / 100) * paisePerCoin;

async function earnMinute(call, n, now, paisePerCoin) {
  const coins = Math.floor((call.ratePerMinSnapshot * (100 - call.shareSnapshot)) / 100);
  try {
    await AstrologerEarning.updateOne(
      { callId: call._id, minute: n },
      { $setOnInsert: { astrologerId: call.astrologerId, callId: call._id, minute: n, coins, paise: minuteEarning(call, paisePerCoin), at: now } },
      { upsert: true },
    );
  } catch (e) {
    // Two ticker instances earning the same minute at once: both upserts target the unique (callId, minute); the loser's insert collides.
    // The row exists - exactly what the winner wrote - so there is nothing to do.
    if (e?.code !== 11000) throw e;
  }
}

/**
 * Charge the next started minute. Returns `{ call }` or `{ outOfCoins: true }`.
 * Safe to run twice for the same minute - in this process or in another instance: the wallet dedupes on the key, the counter bump is conditional
 * on `minutesBilled` still being n-1, and the earning row is an upsert on (callId, minute).
 * Throws a deferrable error (see `isDeferrable`) when the wallet or the payout rate cannot be reached; nothing is assumed in that case.
 */
export async function billNextMinute(call, now = new Date()) {
  const n = call.minutesBilled + 1;
  // Read the payout rate BEFORE any coin moves: a minute charged but not earned would never be earned (the next attempt finds it already billed).
  const paisePerCoin = await ctx.settings.getNumber('payoutPaisePerCoin', 100);
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
  await earnMinute(call, n, now, paisePerCoin);
  return { call: updated ?? (await CallSession.findById(call._id)) };
}

/**
 * Give back what a call that never really connected had charged, and void its earnings. Each minute's refund is durable (an intent first) and
 * quiet: the call is already over, so a wallet that cannot answer right now must not stop the rest of the clean-up; the refund is queued under the
 * same key and re-sent until the wallet takes it. `onlyMissing` (the ticker's heal pass) skips a minute whose intent already exists in any state,
 * so a refund the wallet REFUSED is never re-opened.
 */
export async function refundConnectFailure(call, { onlyMissing = false } = {}) {
  for (let n = 1; n <= call.minutesBilled; n++) {
    const key = `call:${call._id}:refund:${n}`;
    if (onlyMissing && (await CallIntent.exists({ key }))) continue;
    await wallet.refundDurably({
      uid: call.devoteeUid,
      amount: call.ratePerMinSnapshot,
      refType: 'call',
      refId: call._id,
      idempotencyKey: key,
      ofKey: `call:${call._id}:min:${n}`, // the minute's debit this reverses: the wallet service checks it exists and is this devotee's
      note: 'Call did not connect',
    }, { quiet: true });
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
  const ringMs = (await ctx.settings.getNumber('ringTimeoutSec', 25, { lenient: true })) * 1000;

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

  let billed;
  try {
    billed = await billNextMinute(won, now);
  } catch (e) {
    // The wallet service cannot say whether minute 1 was charged (or the payout rate cannot be read). Do NOT end the call on a guess and do NOT
    // pretend it was billed: leave it connected with `nextBillAt` = now, and the billing ticker asks again with the SAME key
    // (`call:<id>:min:1`), which is idempotent. It is charged once, as soon as the wallet answers.
    if (!isDeferrable(e)) throw e;
    billed = { call: won };
  }
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
 * What a goodwill refund of `n` coins reverses: it is taken from the minutes of the call that have not been refunded yet, lowest first, each part
 * no larger than that minute's charge (`ratePerMinSnapshot`) - because the wallet ties a refund to ONE debit (`ofKey`) and lets a debit be
 * refunded once. Returns `[{ minute, coins }]`, or null when the unrefunded minutes cannot hold `n`.
 * (The monolith sent one refund for the whole amount under the wallet's no-`ofKey` goodwill exemption; that path is retired for new refunds.)
 */
export function planGoodwill(call, n) {
  const taken = new Set((call.refunds ?? []).flatMap((r) => (r.parts ?? []).map((p) => p.minute)));
  const parts = [];
  let left = n;
  for (let minute = 1; minute <= call.minutesBilled && left > 0; minute++) {
    if (taken.has(minute)) continue;
    const coins = Math.min(call.ratePerMinSnapshot, left);
    parts.push({ minute, coins });
    left -= coins;
  }
  return left > 0 ? null : parts;
}

/**
 * Goodwill refund by an operator. Reserve the coins on the call first (so the total can never exceed what was charged, even with two operators at
 * once - and the minutes it reverses are claimed in the same write, so two refunds never reverse one minute), then pay each part under its own key
 * `call:<id>:gw:<requestId>:<minute>` with `ofKey` = that minute's debit `call:<id>:min:<minute>`; if paying fails definitively, release what was
 * not paid.
 *
 * A wallet that cannot answer is NOT a failure of the refund: every part is queued durably before the first is sent, the reservation stays, and
 * the sweeper pays what was not paid (the operator's retry with the same requestId sees it as already reserved).
 */
export async function goodwillRefund(id, { coins, reason, requestId, operator }) {
  const n = Number(coins);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'bad_amount', 'Enter a whole number of coins.');
  if (!String(reason ?? '').trim()) throw new HttpError(400, 'reason_required', 'A reason is required for every refund.');
  if (!oid(id)) throw notFound();
  const rid = String(requestId || new mongoose.Types.ObjectId());
  const why = String(reason).trim();

  let reserved = null;
  let parts = [];
  for (let attempt = 0; attempt < 5 && !reserved; attempt++) {
    const call = await CallSession.findById(id);
    if (!call) throw notFound();
    if (call.refunds.some((r) => r.requestId === rid)) return { call, balance: await wallet.displayBalance(call.devoteeUid), duplicate: true };
    if (call.coinsRefunded + n > call.coinsCharged) {
      throw new HttpError(400, 'refund_exceeds_charge', 'That is more than this call charged.', { charged: call.coinsCharged, refunded: call.coinsRefunded });
    }
    parts = planGoodwill(call, n);
    if (!parts) {
      throw new HttpError(409, 'refund_minutes_used', 'The minutes of this call are already refunded in part, so that amount can no longer be returned.', { charged: call.coinsCharged, refunded: call.coinsRefunded });
    }
    const entry = { requestId: rid, coins: n, reason: why, by: operator, at: new Date(), parts };
    reserved = await CallSession.findOneAndUpdate(
      {
        _id: id,
        'refunds.requestId': { $ne: rid },
        'refunds.parts.minute': { $nin: parts.map((p) => p.minute) },
        $expr: { $lte: [{ $add: ['$coinsRefunded', n] }, '$coinsCharged'] },
      },
      { $inc: { coinsRefunded: n }, $push: { refunds: entry } },
      { new: true },
    );
    // Lost a race (another refund took one of these minutes, or the same requestId arrived twice): look again.
  }
  if (!reserved) throw new HttpError(409, 'refund_busy', 'Another refund is being recorded for this call. Try again in a moment.');

  const args = parts.map((p) => ({
    uid: reserved.devoteeUid,
    amount: p.coins,
    refType: 'call',
    refId: reserved._id,
    idempotencyKey: `call:${reserved._id}:gw:${rid}:${p.minute}`,
    ofKey: `call:${reserved._id}:min:${p.minute}`, // the minute's debit this reverses: the wallet checks it exists, is this devotee's and is at least this large
    note: why,
    createdBy: operator,
  }));
  await wallet.queueRefunds(args);

  let balance;
  let paid = 0; // parts the wallet has taken
  try {
    for (const a of args) {
      const out = await wallet.refundDurably(a, { queued: true });
      balance = out.balance;
      paid++;
    }
    return { call: reserved, balance };
  } catch (e) {
    // The wallet could not answer: the remaining parts are queued and will be paid; keep the reservation. A DEFINITE refusal: release what was not paid.
    if (wallet.isUnavailable(e)) throw e;
    const unpaid = parts.slice(paid);
    for (const a of args.slice(paid)) await closeIntent(a.idempotencyKey, 'failed');
    const back = unpaid.reduce((sum, p) => sum + p.coins, 0);
    if (paid === 0) {
      await CallSession.updateOne({ _id: id }, { $inc: { coinsRefunded: -back }, $pull: { refunds: { requestId: rid } } });
    } else {
      await CallSession.updateOne(
        { _id: id },
        { $inc: { coinsRefunded: -back }, $set: { 'refunds.$[e].coins': n - back, 'refunds.$[e].parts': parts.slice(0, paid) } },
        { arrayFilters: [{ 'e.requestId': rid }] },
      );
    }
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
    // Display only: a wallet that cannot answer (WALLET_URL set) leaves the balance out and `lowBalance` false - never a made-up 0.
    const balance = await wallet.displayBalance(call.devoteeUid);
    if (balance !== undefined) {
      const secondsLeft = toNext + 60 * Math.floor(balance / rate);
      view.lowBalance = secondsLeft <= 60;
      if (isDevotee) view.balance = balance;
    }
    if (isDevotee || isAstrologer) {
      try {
        view.rtc = await getRtcProvider().issue({ channel: call.rtcChannel, uid: isDevotee ? RTC_UID.devotee : RTC_UID.astrologer });
      } catch {
        /* no credentials: the client reports it cannot connect */
      }
    }
  } else if (isDevotee) {
    const balance = await wallet.displayBalance(call.devoteeUid);
    if (balance !== undefined) view.balance = balance;
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
