/**
 * The completion engine (docs/EVENTS.md sections 3 and 10). The server decides completion: the app reports a fact (`{}`, `{add}`,
 * `{set}`) and gets back what that did.
 *
 *   1. checks   published, not ended, started, registered (when the event asks), milestone and task exist, milestone OPEN for this
 *               devotee (rules.js), the task kind implements `evaluate` (else 422 task_not_supported)
 *   2. evaluate the kind's `evaluate(state, report, ctx)`; the TaskProgress row is written with an optimistic-concurrency guard
 *               (`rev`), so parallel reports of one task apply one at a time and a replay changes nothing
 *   3. milestone the milestone's `completion` rule over its tasks; first completion inserts the MilestoneResult (unique index: exactly
 *               one request wins, however many run in parallel) together with the coins/badges it owes
 *   4. event    the event's `completion` rule over the milestones; first completion inserts the EventResult the same way
 *   5. rewards  the winner pays the credits (wallet, idempotent key) and grants the badges. A wallet failure leaves the credit pending
 *               on the result row for the sweeper; the completion is never lost or undone.
 * Steps 3-4 also run when the task was ALREADY complete, so a crash between the task write and the result write is healed by the
 * devotee's next call (and the rewards by the sweeper).
 */
import { HttpError } from '../lib/http-error.js';
import { EventResult, MilestoneResult, Registration, TaskProgress } from '../models/index.js';
import { NotImplementedError, getKind } from '../tasks/index.js';
import { deriveStatus } from '../events/status.js';
import { hasRegistration, hasStarted, progressOf, toMe } from '../events/present.js';
import { claimSlot, savePoint } from './location-store.js';
import { loadUserState } from './user-state.js';
import { eventComplete, doneKeysOf, milestoneOpenState, ruleMet } from './rules.js';
import { grantBadges, pendingOf, planEvent, planMilestone, settleCredits } from './rewards.js';

const isDup = (e) => e?.code === 11000;
const iso = (d) => (d ? new Date(d).toISOString() : null);

export function createEngine({ wallet, now = () => new Date(), logger }) {
  const ctxOpts = { wallet, now, logger };

  /** Insert-once. Returns `{ row, created }`; `created` is true for exactly one of any number of parallel callers. */
  async function insertOnce(Model, doc) {
    try {
      return { row: (await Model.create(doc)).toObject(), created: true };
    } catch (e) {
      if (!isDup(e)) throw e;
      return { row: await Model.findOne({ uid: doc.uid, eventSlug: doc.eventSlug, ...(doc.milestoneKey ? { milestoneKey: doc.milestoneKey } : {}) }).lean(), created: false };
    }
  }

  async function completeMilestone({ event, uid, m, t }) {
    const plan = planMilestone(event, m, uid);
    const { row, created } = await insertOnce(MilestoneResult, {
      uid, eventSlug: event.slug, milestoneKey: m.key, completedAt: t, coinsKey: plan.coinsKey,
      pendingCredits: pendingOf(plan.credits), badgeSlugs: plan.badgeSlugs, badgesDone: plan.badgeSlugs.length === 0,
    });
    if (!created) return { row, created, coins: 0, badges: [] };
    await settleCredits(MilestoneResult, row, ctxOpts);
    const badges = await grantBadges(MilestoneResult, row, ctxOpts);
    return { row, created, coins: plan.credits.reduce((n, c) => n + c.amount, 0), badges };
  }

  async function completeEvent({ event, uid, t }) {
    const plan = planEvent(event, uid);
    const { row, created } = await insertOnce(EventResult, {
      uid, eventSlug: event.slug, completedAt: t, pendingCredits: pendingOf(plan.credits), badgeSlugs: plan.badgeSlugs, badgesDone: plan.badgeSlugs.length === 0,
    });
    if (!created) return { row, created, coins: 0, badges: [] };
    await settleCredits(EventResult, row, ctxOpts);
    const badges = await grantBadges(EventResult, row, ctxOpts);
    return { row, created, coins: plan.credits.reduce((n, c) => n + c.amount, 0), badges };
  }

  /** Steps 3-5 for the milestone at `idx`. Idempotent; `justCompleted` is true only for the call that created the record. */
  async function settle({ event, uid, idx, t }) {
    const ms = event.milestones;
    const m = ms.items[idx];
    const out = { milestoneJust: false, eventJust: false, coins: 0, badges: [] };
    let results = await MilestoneResult.find({ uid, eventSlug: event.slug }).select('milestoneKey').lean();
    let doneKeys = doneKeysOf(ms, results.map((r) => r.milestoneKey));
    if (!doneKeys.has(m.key)) {
      const rows = await TaskProgress.find({ uid, eventSlug: event.slug, milestoneKey: m.key, completedAt: { $ne: null } }).select('taskKey').lean();
      const have = new Set(rows.map((r) => r.taskKey));
      const doneTasks = m.tasks.filter((task) => have.has(task.key)).length;
      if (ruleMet(m.completion, doneTasks, m.tasks.length)) {
        const r = await completeMilestone({ event, uid, m, t });
        out.milestoneJust = r.created;
        out.coins += r.coins;
        out.badges.push(...r.badges);
        results = [...results, { milestoneKey: m.key }];
        doneKeys = doneKeysOf(ms, results.map((x) => x.milestoneKey));
      }
    }
    if (eventComplete(ms, doneKeys) && !(await EventResult.exists({ uid, eventSlug: event.slug }))) {
      const r = await completeEvent({ event, uid, t });
      out.eventJust = r.created;
      out.coins += r.coins;
      out.badges.push(...r.badges);
    }
    return out;
  }

  const taskOut = (task, row) => {
    const kind = getKind(task.kind);
    return { key: task.key, done: !!row?.completedAt, completedAt: iso(row?.completedAt), state: kind?.publicState ? kind.publicState(row?.state) : {} };
  };

  /** The "what did that do" sheet; only for the call that completed a milestone or the event. */
  async function sheet({ event, uid, idx, st, settled }) {
    const ms = event.milestones;
    const m = ms.items[idx];
    const done = doneKeysOf(ms, st.results.keys());
    const rows = await TaskProgress.find({ uid, eventSlug: event.slug, milestoneKey: m.key, completedAt: { $ne: null } }).lean();
    const byKey = new Map(rows.map((r) => [r.taskKey, r]));
    const how = m.tasks.filter((task) => byKey.has(task.key)).map((task) => {
      const h = byKey.get(task.key).how;
      const kind = getKind(task.kind);
      return { text: h?.en || kind?.summary(task.config ?? {}, 'en') || task.title, textHi: h?.hi || kind?.summary(task.config ?? {}, 'hi') || task.titleHi || task.title };
    });
    const next = ms.items.slice(idx + 1).find((x) => !done.has(x.key)) ?? ms.items.find((x) => !done.has(x.key));
    return {
      title: settled.milestoneJust ? m.title : event.title,
      titleHi: (settled.milestoneJust ? m.titleHi : event.titleHi) || '',
      coins: settled.coins,
      progress: progressOf(event, st),
      how,
      next: next ? { title: next.title, titleHi: next.titleHi || '', opensAt: iso(next.opensAt) } : null,
      eventCompleted: settled.eventJust || !!st.eventResult,
      badges: settled.badges,
    };
  }

  /**
   * @returns {Promise<{ status: number, body: object }>} 200 with the response, or 429 `too_fast` carrying the current task state.
   * Throws HttpError for the other refusals.
   */
  async function reportProgress({ event, uid, mKey, tKey, body }) {
    const t = now();
    const nowMs = t.getTime();
    if (!event?.published) throw new HttpError(404, 'not_found', 'Event not found.');
    if (deriveStatus(event, t) === 'ended') throw new HttpError(409, 'closed', 'This event has ended.');
    const ms = event.milestones;
    const idx = ms ? ms.items.findIndex((m) => m.key === mKey) : -1;
    if (idx < 0) throw new HttpError(404, 'not_found', 'Milestone not found.');
    const m = ms.items[idx];
    const task = m.tasks.find((x) => x.key === tKey);
    if (!task) throw new HttpError(404, 'not_found', 'Task not found.');
    if (hasRegistration(event) && !(await Registration.exists({ uid, eventSlug: event.slug, status: 'joined' }))) {
      throw new HttpError(403, 'not_registered', 'Join this event first.');
    }
    const s = event.schedule;
    if (!hasStarted(s, t)) {
      throw new HttpError(409, 'locked', 'This event has not started yet.', { opensAt: iso(s.startsAt), notStarted: true });
    }
    const results = await MilestoneResult.find({ uid, eventSlug: event.slug }).select('milestoneKey').lean();
    const open = milestoneOpenState(ms, idx, doneKeysOf(ms, results.map((r) => r.milestoneKey)), nowMs, s);
    if (!open.open) throw new HttpError(409, 'locked', open.reason === 'missed' ? 'This milestone can no longer be completed.' : 'This milestone has not opened yet.', { opensAt: open.opensAt, ...(open.reason === 'missed' ? { missed: true } : {}) });
    const kind = getKind(task.kind);
    if (!kind) throw new HttpError(422, 'task_not_supported', 'This kind of task is not supported.', { kind: task.kind });

    const key = { uid, eventSlug: event.slug, milestoneKey: mKey, taskKey: tKey };
    let row = null;
    // A kind that reads the devotee's position (`needsPoint`): take the 5 s report slot (a finished task costs no slot) and load the
    // previous point; the new one is stored below whatever the verdict (docs/EVENTS.md section 11.2).
    let prev = null;
    let pointSaved = false;
    if (kind.needsPoint) {
      const cur0 = await TaskProgress.findOne(key).lean();
      if (!cur0?.completedAt) {
        const slot = await claimSlot({ uid, event, t });
        if (slot.limited) return { status: 429, body: { error: 'Too fast.', code: 'too_fast', task: taskOut(task, cur0) } };
        prev = slot.prev;
      }
    }
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const cur = await TaskProgress.findOne(key).lean();
      if (cur?.completedAt) { row = cur; break; } // already complete: current state, nothing changes
      let out;
      try {
        out = kind.evaluate(cur?.state ?? {}, body ?? {}, { config: task.config ?? {}, now: t, uid, event, prev });
      } catch (e) {
        if (e instanceof NotImplementedError) throw new HttpError(422, 'task_not_supported', 'This kind of task is not supported yet.', { kind: task.kind });
        throw e;
      }
      if (out.point && !pointSaved) { await savePoint({ uid, event, t, lat: out.point.lat, lng: out.point.lng }); pointSaved = true; }
      if (out.refuse) throw new HttpError(out.refuse.status, out.refuse.code, out.refuse.message ?? out.refuse.code, out.refuse.extra ?? {});
      if (out.invalid) throw new HttpError(400, 'bad_report', 'That report is not valid for this task.');
      if (out.tooFast) return { status: 429, body: { error: 'Too fast.', code: 'too_fast', task: taskOut(task, cur) } };
      const set = { state: out.state, source: 'app', ...(out.done ? { completedAt: t, how: out.how ?? null } : {}) };
      if (!cur) {
        try {
          row = (await TaskProgress.create({ ...key, ...set, rev: 1 })).toObject();
          break;
        } catch (e) {
          if (!isDup(e)) throw e;
          continue; // a parallel first report created it: re-read and apply on top
        }
      }
      const upd = await TaskProgress.findOneAndUpdate({ _id: cur._id, rev: cur.rev ?? 0, completedAt: null }, { $set: set, $inc: { rev: 1 } }, { new: true, lean: true });
      if (upd) { row = upd; break; }
    }
    if (!row) throw new HttpError(503, 'busy', 'Please try again.');

    let settled = { milestoneJust: false, eventJust: false, coins: 0, badges: [] };
    if (row.completedAt) settled = await settle({ event, uid, idx, t });

    const st = (await loadUserState(uid, [event.slug], { withTasks: true })).get(event.slug);
    const doneKeys = doneKeysOf(ms, st.results.keys());
    const completion = settled.milestoneJust || settled.eventJust ? await sheet({ event, uid, idx, st, settled }) : null;
    return {
      status: 200,
      body: {
        task: taskOut(task, row),
        milestone: { key: mKey, done: doneKeys.has(mKey), justCompleted: settled.milestoneJust },
        event: { done: !!st.eventResult, justCompleted: settled.eventJust },
        awarded: { coins: settled.coins, badges: settled.badges },
        completion,
        me: toMe(event, st, t),
      },
    };
  }

  return { reportProgress, settle };
}
