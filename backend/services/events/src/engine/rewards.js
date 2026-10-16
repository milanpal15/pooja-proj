/**
 * Rewards (docs/EVENTS.md section 10). A completion record is written WITH the coins it owes (`pendingCredits`) and the badges it
 * earns, in one insert; paying them is a separate, retryable step:
 *
 *   coins   the wallet's internal credit (type bonus), key `event-ms:<slug>:<mKey>:<uid>` for the milestone's own `coins`, `...:<i>` for
 *           the i-th entry of `rewards[]` that fires on that milestone; `event-done:<slug>:<uid>` for an event reward (`...:<i>` when
 *           the event has several coin rewards). Same key on every retry, so the wallet pays once. A failure leaves the credit pending;
 *           `sweep()` (the interval job) retries it until the wallet confirms.
 *   badges  UserBadge, unique (uid, badgeSlug, eventSlug); `badgesDone` stays false until every one is in, so a crash between the
 *           completion and the grant is finished by the sweeper.
 *   certificate  ignored until phase 6.
 */
import { Badge, EventResult, MilestoneResult, UserBadge } from '../models/index.js';

const isDup = (e) => e?.code === 11000;

export function planMilestone(event, m, uid) {
  const base = `event-ms:${event.slug}:${m.key}:${uid}`;
  const credits = [];
  const badgeSlugs = [];
  if (m.coins > 0) credits.push({ key: base, amount: m.coins });
  (event.rewards ?? []).forEach((r, i) => {
    if (r.trigger?.on !== 'milestone' || r.trigger.milestoneKey !== m.key) return;
    if (r.kind === 'coins' && r.coins > 0) credits.push({ key: `${base}:${i}`, amount: r.coins });
    else if (r.kind === 'badge' && r.badgeSlug) badgeSlugs.push(r.badgeSlug);
  });
  return { credits, badgeSlugs: [...new Set(badgeSlugs)], coinsKey: m.coins > 0 ? base : '' };
}

export function planEvent(event, uid) {
  const base = `event-done:${event.slug}:${uid}`;
  const rewards = (event.rewards ?? []).map((r, i) => ({ r, i })).filter(({ r }) => r.trigger?.on === 'event');
  const coin = rewards.filter(({ r }) => r.kind === 'coins' && r.coins > 0);
  const credits = coin.map(({ r, i }) => ({ key: coin.length === 1 ? base : `${base}:${i}`, amount: r.coins }));
  const badgeSlugs = [...new Set(rewards.filter(({ r }) => r.kind === 'badge' && r.badgeSlug).map(({ r }) => r.badgeSlug))];
  return { credits, badgeSlugs };
}

export const pendingOf = (credits) => credits.map((c) => ({ key: c.key, amount: c.amount, status: 'pending', attempts: 0, lastError: '', lastAttemptAt: null, creditedAt: null }));

/**
 * Try every still-pending credit of one result row once. Never throws: a wallet failure is recorded on the credit and left for the
 * sweeper. Returns how many were confirmed.
 */
export async function settleCredits(Model, row, { wallet, now = () => new Date(), logger }) {
  let credited = 0;
  for (const c of row.pendingCredits ?? []) {
    if (c.status !== 'pending') continue;
    const at = now();
    try {
      await wallet.credit({ uid: row.uid, amount: c.amount, key: c.key, refId: row.eventSlug, note: `Event reward: ${row.eventSlug}` });
      await Model.updateOne({ _id: row._id, 'pendingCredits.key': c.key }, { $set: { 'pendingCredits.$.status': 'credited', 'pendingCredits.$.creditedAt': at, 'pendingCredits.$.lastError': '' }, $inc: { 'pendingCredits.$.attempts': 1 } });
      credited += 1;
    } catch (e) {
      logger?.warn(`event reward ${c.key} not credited yet: ${e?.message}`);
      await Model.updateOne({ _id: row._id, 'pendingCredits.key': c.key }, { $set: { 'pendingCredits.$.lastError': String(e?.message ?? e).slice(0, 200), 'pendingCredits.$.lastAttemptAt': at }, $inc: { 'pendingCredits.$.attempts': 1 } });
    }
  }
  return credited;
}

/**
 * Put the badges in UserBadge (idempotent). Returns the ones granted by THIS call as `[{slug,name,nameHi}]` (a replay or a parallel
 * request that lost the race grants nothing new), and flips `badgesDone` on the row.
 */
export async function grantBadges(Model, row, { now = () => new Date() }) {
  const granted = [];
  for (const slug of row.badgeSlugs ?? []) {
    const badge = await Badge.findOne({ slug }).lean();
    if (!badge) continue; // deleted since the event was published: nothing to grant
    try {
      const r = await UserBadge.updateOne({ uid: row.uid, badgeSlug: slug, eventSlug: row.eventSlug }, { $setOnInsert: { earnedAt: now() } }, { upsert: true });
      if (r.upsertedCount === 1) granted.push({ slug, name: badge.name, nameHi: badge.nameHi || '' });
    } catch (e) {
      if (!isDup(e)) throw e; // a parallel grant won the race: it is there
    }
  }
  if (!row.badgesDone) await Model.updateOne({ _id: row._id }, { $set: { badgesDone: true } });
  return granted;
}

const gapMs = (attempts) => Math.min(Math.max(attempts, 1), 8) * 10_000; // 10 s, 20 s ... 80 s between tries of one credit

/**
 * The retry sweeper: finishes credits the wallet did not confirm and badge grants a crash cut short. Safe to run any time, on any
 * number of instances: every step is idempotent (same wallet key, unique UserBadge).
 */
export async function sweep({ wallet, now = () => new Date(), logger, limit = 200 }) {
  const t = now().getTime();
  const out = { checked: 0, credited: 0, stillPending: 0, badges: 0 };
  for (const Model of [MilestoneResult, EventResult]) {
    const rows = await Model.find({ pendingCredits: { $elemMatch: { status: 'pending' } } }).sort({ _id: 1 }).limit(limit);
    for (const doc of rows) {
      const row = doc.toObject();
      // Back off per credit: not every sweep hammers a wallet that is down.
      const due = row.pendingCredits.some((c) => c.status === 'pending' && (!c.lastAttemptAt || t - new Date(c.lastAttemptAt).getTime() >= gapMs(c.attempts)));
      if (!due) { out.stillPending += 1; continue; }
      out.checked += 1;
      out.credited += await settleCredits(Model, row, { wallet, now, logger });
      const after = await Model.findById(row._id).lean();
      if (after?.pendingCredits.some((c) => c.status === 'pending')) out.stillPending += 1;
    }
    const unbadged = await Model.find({ badgesDone: false }).limit(limit);
    for (const doc of unbadged) {
      out.badges += (await grantBadges(Model, doc.toObject(), { now })).length;
    }
  }
  return out;
}
