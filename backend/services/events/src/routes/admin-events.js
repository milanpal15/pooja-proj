import crypto from 'node:crypto';

import { BLOCK_NAMES, RESERVED_SLUGS, normalizeEvent, slugify } from '../events/validate.js';
import { createLookups } from '../events/lookups.js';
import { isoDeep, toAdmin } from '../events/present.js';
import { HttpError } from '../lib/http-error.js';
import { EventResult, Event, EventType, MilestoneResult, Registration, TaskProgress } from '../models/index.js';
import { listKinds } from '../tasks/index.js';
import { asyncRouter, duplicateAsConflict, isObj, objectId, SLUG } from './simple-crud.js';

async function uniqueSlug(base) {
  const root = base || 'event';
  for (let n = 1; n < 500; n += 1) {
    const slug = n === 1 ? root : `${root}-${n}`;
    if (!RESERVED_SLUGS.includes(slug) && !(await Event.exists({ slug }))) return slug;
  }
  throw new HttpError(409, 'slug_taken', 'Could not find a free slug.');
}

const typesByslug = async () => new Map((await EventType.find().lean()).map((t) => [t.slug, t]));

/** The operator's JSON merged over the stored event: a PUT may send the whole document or just the fields that changed. */
function mergeOver(existing, body) {
  const base = isoDeep({ ...existing });
  const merged = { ...base, ...body };
  if (body.blocks === undefined) {
    merged.blocks = [...(existing.blocks ?? []), ...BLOCK_NAMES.filter((b) => body[b] != null && !(existing.blocks ?? []).includes(b))];
  }
  return merged;
}

export function adminEventRoutes({ catalog, now = () => new Date(), redact, directory }) {
  const lookups = createLookups(catalog);
  const router = asyncRouter();

  router.get('/task-kinds', (_req, res) => res.json(listKinds()));

  router.get('/', async (_req, res) => {
    const [rows, types] = await Promise.all([Event.find().sort({ createdAt: -1 }).lean(), typesByslug()]);
    res.json(rows.map((e) => toAdmin(e, types.get(e.typeSlug), now())));
  });

  router.post('/', async (req, res) => {
    const body = isObj(req.body) ? req.body : {};
    const fields = await normalizeEvent(body, { lookups });
    let slug;
    if (typeof body.slug === 'string' && body.slug.trim()) {
      slug = body.slug.trim();
      if (RESERVED_SLUGS.includes(slug)) throw new HttpError(400, 'bad_event', 'This event has problems that need fixing.', { fields: { slug: `"${slug}" is reserved.` } });
      if (!SLUG.test(slug) || slug.length > 60) throw new HttpError(400, 'bad_event', 'This event has problems that need fixing.', { fields: { slug: 'Use lowercase letters, digits and - (up to 60).' } });
      if (await Event.exists({ slug })) throw new HttpError(409, 'slug_taken', 'Another event already uses that slug.', { fields: { slug: 'Already used.' } });
    } else slug = await uniqueSlug(slugify(fields.title));
    try {
      const doc = await Event.create({ ...stripUndefined(fields), slug });
      res.status(201).json(toAdmin(doc.toObject(), (await typesByslug()).get(doc.typeSlug), now()));
    } catch (e) { duplicateAsConflict(e); }
  });

  // `/task-kinds` is above: `:id` below would otherwise swallow it.
  router.get('/:id', async (req, res) => {
    const e = await Event.findById(objectId(req.params.id)).lean();
    if (!e) throw new HttpError(404, 'not_found', 'Event not found.');
    res.json(toAdmin(e, (await typesByslug()).get(e.typeSlug), now()));
  });

  router.put('/:id', async (req, res) => {
    const existing = await Event.findById(objectId(req.params.id)).lean();
    if (!existing) throw new HttpError(404, 'not_found', 'Event not found.');
    const body = isObj(req.body) ? req.body : {};
    const merged = mergeOver(existing, body);
    const fields = await normalizeEvent(merged, { lookups, retiredKeys: existing.retiredKeys });
    // Keys of milestones that were removed are retired for good (a stable key is never reused for something else).
    const before = (existing.milestones?.items ?? []).map((m) => m.key);
    const after = new Set((fields.milestones?.items ?? []).map((m) => m.key));
    const retiredKeys = [...new Set([...(existing.retiredKeys ?? []), ...before.filter((k) => !after.has(k))])];
    const unset = Object.fromEntries(Object.entries(fields).filter(([, v]) => v === undefined).map(([k]) => [k, '']));
    const out = await Event.findByIdAndUpdate(existing._id, { $set: { ...stripUndefined(fields), retiredKeys }, ...(Object.keys(unset).length ? { $unset: unset } : {}) }, { new: true, lean: true });
    res.json(toAdmin(out, (await typesByslug()).get(out.typeSlug), now()));
  });

  router.delete('/:id', async (req, res) => {
    const existing = await Event.findById(objectId(req.params.id)).lean();
    if (!existing) throw new HttpError(404, 'not_found', 'Event not found.');
    if (await Registration.exists({ eventSlug: existing.slug })) throw new HttpError(409, 'in_use', 'Devotees have joined this event. Unpublish it instead of deleting it.');
    await Event.deleteOne({ _id: existing._id });
    res.json({ ok: true });
  });

  /*
   * Real counts only (docs/EVENTS.md section 10). `joined` is the number of joined registrations, or - for an event with nothing to
   * join - the number of devotees with any progress; `null` (not 0) when there is no registration block AND no progress rows, because
   * then nothing was measured. `completedPct` is completedCount / joined (0-100, one decimal), null while nobody has joined.
   * `checkedIn` stays null until the in-person phase.
   */
  router.get('/:id/stats', async (req, res) => {
    const e = await Event.findById(objectId(req.params.id)).lean();
    if (!e) throw new HttpError(404, 'not_found', 'Event not found.');
    const [progressUids, perMs, finished] = await Promise.all([
      TaskProgress.distinct('uid', { eventSlug: e.slug }),
      MilestoneResult.aggregate([{ $match: { eventSlug: e.slug } }, { $group: { _id: '$milestoneKey', n: { $sum: 1 } } }]),
      EventResult.countDocuments({ eventSlug: e.slug }),
    ]);
    const hasReg = !!e.registration && e.registration.mode !== 'none';
    const measured = hasReg || progressUids.length > 0;
    const joined = !measured ? null : hasReg ? await Registration.countDocuments({ eventSlug: e.slug, status: 'joined' }) : progressUids.length;
    const counts = new Map(perMs.map((r) => [r._id, r.n]));
    res.json({
      joined,
      finished: measured ? finished : null,
      perMilestone: (e.milestones?.items ?? []).map((m) => {
        const completedCount = counts.get(m.key) ?? 0;
        return { key: m.key, completedCount, completedPct: joined > 0 ? Math.round((completedCount / joined) * 1000) / 10 : null };
      }),
      checkedIn: null,
    });
  });

  /*
   * Participants, cursor-paged by registration id (oldest first). Names and phones are PSEUDONYMS (`Devotee ••4821`) unless the
   * operator holds `devotees:view` - then identity is asked for the real ones (and the answers they gave at joining are included).
   */
  router.get('/:id/participants', async (req, res) => {
    const e = await Event.findById(objectId(req.params.id)).lean();
    if (!e) throw new HttpError(404, 'not_found', 'Event not found.');
    const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit ?? ''), 10) || 50, 1), 200);
    const cursor = typeof req.query.cursor === 'string' && req.query.cursor ? req.query.cursor : null;
    if (cursor && !/^[a-f0-9]{24}$/i.test(cursor)) throw new HttpError(400, 'bad_cursor', 'Invalid cursor.');
    const hasReg = !!e.registration && e.registration.mode !== 'none';
    let rows;
    if (hasReg) {
      const found = await Registration.find({ eventSlug: e.slug, status: 'joined', ...(cursor ? { _id: { $gt: cursor } } : {}) }).sort({ _id: 1 }).limit(limit + 1).lean();
      rows = found.map((r) => ({ id: String(r._id), uid: r.uid, joinedAt: r.joinedAt, passCode: r.passCode || null, answers: r.answers ?? {} }));
    } else {
      // Nothing to join: the participants are whoever reported progress (paged by uid).
      const found = await TaskProgress.aggregate([
        { $match: { eventSlug: e.slug } },
        { $group: { _id: '$uid', first: { $min: '$createdAt' } } },
        { $sort: { _id: 1 } },
      ]);
      const after = cursor ? found.findIndex((r) => rowId(r._id) === cursor) + 1 : 0;
      rows = found.slice(after, after + limit + 1).map((r) => ({ id: rowId(r._id), uid: r._id, joinedAt: null, passCode: null, answers: {} }));
    }
    const next = rows.length > limit ? rows[limit - 1].id : null;
    rows = rows.slice(0, limit);
    const uids = rows.map((r) => r.uid);
    const [done, last, finished] = uids.length
      ? await Promise.all([
        MilestoneResult.aggregate([{ $match: { eventSlug: e.slug, uid: { $in: uids } } }, { $group: { _id: '$uid', keys: { $addToSet: '$milestoneKey' } } }]),
        TaskProgress.aggregate([{ $match: { eventSlug: e.slug, uid: { $in: uids } } }, { $group: { _id: '$uid', at: { $max: '$updatedAt' } } }]),
        EventResult.find({ eventSlug: e.slug, uid: { $in: uids } }).select('uid').lean(),
      ])
      : [[], [], []];
    const live = new Set((e.milestones?.items ?? []).map((m) => m.key));
    const doneBy = new Map(done.map((r) => [r._id, r.keys.filter((k) => live.has(k)).length]));
    const lastBy = new Map(last.map((r) => [r._id, r.at]));
    const finishedSet = new Set(finished.map((r) => r.uid));
    const total = e.milestones?.items?.length ?? 0;
    const sees = !!req.can?.('devotees:view');
    const names = sees ? await directory.lookup(uids) : new Map();
    res.json({
      items: rows.map((r) => {
        const who = names.get(r.uid);
        const mask = redact.pseudonym(r.uid);
        return {
          id: r.id,
          name: sees && who?.name ? who.name : mask,
          contact: sees && who?.contact ? who.contact : mask,
          joinedAt: r.joinedAt ? new Date(r.joinedAt).toISOString() : null,
          passCode: r.passCode,
          progress: { done: doneBy.get(r.uid) ?? 0, total },
          completed: finishedSet.has(r.uid),
          lastActivityAt: lastBy.get(r.uid) ? new Date(lastBy.get(r.uid)).toISOString() : null,
          ...(sees ? { answers: r.answers } : {}),
        };
      }),
      next,
    });
  });

  return router;
}

const rowId = (uid) => crypto.createHash('sha256').update(String(uid)).digest('hex').slice(0, 24);
const stripUndefined = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
