import { ctx } from '../../lib/context.js';
import { sweep } from '../saga/saga.js';
import { CallSession } from './call.model.js';
import { billNextMinute, finishCall, isDeferrable, refundConnectFailure } from './call.service.js';

/**
 * The billing clock. Nothing here is held in memory between runs: every
 * connected call stores `nextBillAt`, so a restart (Render redeploys restart
 * the container) loses nothing — the boot pass simply finds whatever fell due.
 *
 * `tick(now)` takes the clock as an argument so tests can drive time directly.
 *
 * Several instances of this service may run against one database (a rolling deploy, a second replica): every step is an atomic conditional
 * update (`finishCall`, the `minutesBilled` bump, the unique earning row) and every debit carries `call:<id>:min:<n>`, so two instances that
 * both find the same minute due charge it ONCE and earn it once. Within one instance `startTicker` is single-flight (a pass never overlaps
 * the previous one).
 *
 * Silence: each party's app polls the call; a party unheard of for
 * `silenceMs` has gone. If the very first minute was charged and that party
 * never once pinged after the answer, the call never really connected — it
 * ends `failed` and the charge is refunded. Otherwise it ends `completed`.
 * Silence is measured from the later of "last ping" and "this process
 * started", so a deploy gap cannot make every live call look abandoned.
 */

export const SILENCE_MS = 90_000;
const MAX_CATCHUP_MINUTES = 240; // a bound, not a policy: 4 hours of missed minutes in one pass
let startedAt = 0;
let timer = null;
let running = false;

/**
 * Heal: a call that ended `failed` but whose refund intents were never written (the process died between "ended" and "refunded"). Only the
 * MISSING intents are written, so a refund the wallet refused (its intent is closed `failed`) is not opened again every pass. Idempotent.
 */
const HEAL_WINDOW_MS = 2 * 86_400_000;
async function healConnectFailures(now) {
  const rows = await CallSession.find({
    status: 'ended', endReason: 'failed', minutesBilled: { $gt: 0 }, endedAt: { $gte: new Date(now.getTime() - HEAL_WINDOW_MS) },
    $expr: { $lt: ['$coinsRefunded', { $multiply: ['$minutesBilled', '$ratePerMinSnapshot'] }] },
  }).limit(20);
  for (const c of rows) {
    try {
      await refundConnectFailure(c, { onlyMissing: true });
    } catch (e) {
      ctx.log.error(`could not heal the connect-failure refund of call ${c._id}: ${e.message}`);
    }
  }
}

function silentParty(call, now, { silenceMs, since }) {
  const parties = [
    ['devotee', call.devoteeSeenAt],
    ['astrologer', call.astrologerSeenAt],
  ];
  for (const [who, seen] of parties) {
    const last = Math.max(seen ? new Date(seen).getTime() : 0, call.answeredAt.getTime(), since);
    if (now.getTime() - last > silenceMs) {
      const neverPinged = !seen || new Date(seen) <= call.answeredAt;
      return { who, neverPinged };
    }
  }
  return null;
}

async function processConnected(id, now, opts) {
  for (let i = 0; i < MAX_CATCHUP_MINUTES; i++) {
    const call = await CallSession.findOne({ _id: id, status: 'connected' });
    if (!call || !call.nextBillAt || call.nextBillAt > now) return;

    const silent = silentParty(call, now, opts);
    if (silent) {
      const failed = silent.neverPinged && call.minutesBilled <= 1;
      await finishCall(call._id, ['connected'], failed ? 'failed' : 'completed', now);
      return;
    }
    const r = await billNextMinute(call, now);
    if (r.outOfCoins) {
      // The call really ended the moment the unaffordable minute began.
      await finishCall(call._id, ['connected'], 'out_of_coins', call.nextBillAt);
      return;
    }
  }
}

/** One pass. Returns counts so tests and logs can see what it did. */
export async function tick(now = new Date(), { silenceMs = ctx.config?.silenceMs ?? SILENCE_MS, since = startedAt, reconcile = true } = {}) {
  const out = { missed: 0, billedCalls: 0 };

  const ringMs = (await ctx.settings.getNumber('ringTimeoutSec', 25, { lenient: true })) * 1000;
  const stale = await CallSession.find({ status: 'requested', requestedAt: { $lt: new Date(now.getTime() - ringMs) } }).select('_id').lean();
  for (const c of stale) if (await finishCall(c._id, ['requested'], 'missed', now)) out.missed++;

  const due = await CallSession.find({ status: 'connected', nextBillAt: { $lte: now } }).select('_id').lean();
  for (const c of due) {
    try {
      await processConnected(c._id, now, { silenceMs, since });
      out.billedCalls++;
    } catch (e) {
      // The wallet cannot answer (or the payout rate cannot be read): this minute stays due (nextBillAt unchanged) and is retried with the SAME
      // debit key on the next tick - idempotent, so charged once when the wallet is back. The other calls and the silence checks carry on.
      if (!isDeferrable(e)) throw e;
      out.walletUnavailable = (out.walletUnavailable ?? 0) + 1;
    }
  }

  // Silence also matters between billing instants, so look at every connected call.
  const rest = await CallSession.find({ status: 'connected', nextBillAt: { $gt: now } });
  for (const call of rest) {
    const silent = silentParty(call, now, { silenceMs, since });
    if (silent) await finishCall(call._id, ['connected'], silent.neverPinged && call.minutesBilled <= 1 ? 'failed' : 'completed', now);
  }

  if (reconcile) {
    await sweep().catch((e) => ctx.log.error(`refund sweep failed: ${e.message}`));
    await healConnectFailures(now).catch((e) => ctx.log.error(`could not heal a connect-failure refund: ${e.message}`));
  }
  return out;
}

/** Start the interval (and a catch-up pass right now). Idempotent. Single-flight: a pass never overlaps the previous one. */
export function startTicker({ everyMs = ctx.config?.tickEveryMs ?? 5000 } = {}) {
  if (timer) return;
  startedAt = Date.now();
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await tick(new Date());
    } catch (e) {
      ctx.log.error(`billing tick failed: ${e.message}`);
    } finally {
      running = false;
    }
  };
  run(); // boot catch-up
  timer = setInterval(run, everyMs);
  timer.unref?.();
}

export function stopTicker() {
  clearInterval(timer);
  timer = null;
  running = false;
}
