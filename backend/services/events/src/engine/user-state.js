import { EventResult, MilestoneResult, Registration, TaskProgress } from '../models/index.js';

/**
 * One devotee's standing in a set of events, loaded in four queries (not four per event), shaped for events/present.js:
 *   { reg, results: Map(milestoneKey -> completedAt), eventResult, hasProgress, tasks: Map('<mKey>/<tKey>' -> row) }
 * `tasks` is only filled with `withTasks` (the detail needs per-task state; the list does not).
 *
 * @returns {Promise<Map<string, object>>} eventSlug -> state (every requested slug has an entry)
 */
export async function loadUserState(uid, slugs, { withTasks = false } = {}) {
  const out = new Map(slugs.map((slug) => [slug, { reg: null, results: new Map(), eventResult: null, hasProgress: false, tasks: new Map() }]));
  if (!uid || !slugs.length) return out;
  const q = { uid, eventSlug: { $in: slugs } };
  const [regs, results, evResults, progress] = await Promise.all([
    Registration.find(q).lean(),
    MilestoneResult.find(q).select('eventSlug milestoneKey completedAt').lean(),
    EventResult.find(q).select('eventSlug completedAt').lean(),
    withTasks ? TaskProgress.find(q).lean() : TaskProgress.distinct('eventSlug', q),
  ]);
  for (const r of regs) out.get(r.eventSlug).reg = r;
  for (const r of results) out.get(r.eventSlug).results.set(r.milestoneKey, r.completedAt);
  for (const r of evResults) out.get(r.eventSlug).eventResult = r;
  if (withTasks) {
    for (const p of progress) {
      const st = out.get(p.eventSlug);
      st.hasProgress = true;
      st.tasks.set(`${p.milestoneKey}/${p.taskKey}`, p);
    }
  } else for (const slug of progress) out.get(slug).hasProgress = true;
  return out;
}

/** Joined counts per event: always counted from real Registration rows. */
export async function joinedCounts(slugs) {
  if (!slugs.length) return new Map();
  const rows = await Registration.aggregate([{ $match: { eventSlug: { $in: slugs }, status: 'joined' } }, { $group: { _id: '$eventSlug', n: { $sum: 1 } } }]);
  return new Map(rows.map((r) => [r._id, r.n]));
}
