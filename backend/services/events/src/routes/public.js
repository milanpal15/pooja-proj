import { joinedCounts, loadUserState } from '../engine/user-state.js';
import { join, leave } from '../engine/registration.js';
import { currentMilestoneKey, doneKeysOf } from '../engine/rules.js';
import { hasRegistration, participates, progressOf, sectionOf, sortByStart, toCard, toDetail, toMe } from '../events/present.js';
import { HttpError } from '../lib/http-error.js';
import { Badge, Event, EventType, UserBadge } from '../models/index.js';
import { asyncRouter } from './simple-crud.js';

/** The devotee behind a request: only the MOBILE BFF vouches for one (its verified Firebase uid rides as `sub`). */
const devoteeOf = (req) => (req.auth?.iss === 'mobile-bff' && typeof req.auth.sub === 'string' && req.auth.sub ? req.auth.sub : null);
const needDevotee = (req) => {
  const uid = devoteeOf(req);
  if (!uid) throw new HttpError(401, 'unauthorized', 'Sign in required.');
  return uid;
};

/**
 * The devotee surface (via mobile-bff), published events only. Reads are auth-optional (a guest sees the public list; a signed-in
 * devotee also gets their sections); join / leave / progress / me need the verified uid.
 *
 * @param {{ now?: () => Date, engine: { reportProgress: Function } }} deps
 */
export function publicRoutes({ now = () => new Date(), engine }) {
  const router = asyncRouter();

  /** The next milestone's opening time, for ordering `continue`: events with something open now come first. */
  const nextOpens = (e, st, at) => {
    const ms = e.milestones;
    if (!ms) return 0;
    const done = doneKeysOf(ms, st.results.keys());
    const key = currentMilestoneKey(ms, done, at.getTime(), e.schedule);
    const m = ms.items.find((x) => x.key === key) ?? ms.items.find((x) => !done.has(x.key));
    return m?.opensAt ? new Date(m.opensAt).getTime() : 0;
  };

  router.get('/events', async (req, res) => {
    const when = now();
    const uid = devoteeOf(req);
    const [events, types] = await Promise.all([Event.find({ published: true }).lean(), EventType.find().sort({ order: 1, createdAt: 1 }).lean()]);
    const byType = new Map(types.map((t) => [t.slug, t]));
    const slugs = events.map((e) => e.slug);
    const [counts, states, badgesCount] = await Promise.all([
      joinedCounts(events.filter(hasRegistration).map((e) => e.slug)),
      loadUserState(uid, slugs),
      uid ? UserBadge.countDocuments({ uid }) : 0,
    ]);
    const sections = { thisWeek: [], upcoming: [] };
    const tags = new Set();
    const mine = [];
    const doneTitles = [];
    for (const e of events) {
      const st = states.get(e.slug);
      const card = toCard(e, byType.get(e.typeSlug), when, {
        registered: hasRegistration(e) ? counts.get(e.slug) ?? 0 : null,
        progress: uid && participates(e, st) ? progressOf(e, st) : null,
      });
      const key = sectionOf(card, e, when);
      if (key) {
        sections[key].push(card);
        for (const t of e.tags ?? []) tags.add(t);
      }
      if (uid && participates(e, st)) mine.push({ e, st, card });
      if (uid && st.eventResult) doneTitles.push({ title: e.title, at: new Date(st.eventResult.completedAt).getTime() });
    }
    sections.thisWeek.sort(sortByStart);
    sections.upcoming.sort(sortByStart);
    const personal = {};
    if (uid) {
      personal.continue = mine
        .filter(({ st, card }) => !st.eventResult && card.status === 'live')
        .sort((a, b) => nextOpens(a.e, a.st, when) - nextOpens(b.e, b.st, when) || a.card.title.localeCompare(b.card.title))
        .map(({ card }) => card);
      personal.mine = mine
        .sort((a, b) => new Date(b.st.reg?.joinedAt ?? 0).getTime() - new Date(a.st.reg?.joinedAt ?? 0).getTime() || a.card.title.localeCompare(b.card.title))
        .map(({ card }) => card);
      personal.completed = { count: doneTitles.length, titles: doneTitles.sort((a, b) => b.at - a.at).slice(0, 20).map((d) => d.title) };
    }
    res.json({
      types: types.filter((t) => t.enabled).map((t) => ({ slug: t.slug, name: t.name, nameHi: t.nameHi || '', color: t.color })),
      tags: [...tags].sort(),
      sections: { ...(uid ? { continue: personal.continue } : {}), ...sections, ...(uid ? { mine: personal.mine, completed: personal.completed } : {}) },
      badgesCount,
    });
  });

  // The caller's own events and badges. Fixed paths, so they cannot be swallowed by `/events/:slug`.
  router.get('/me/events', async (req, res) => {
    const uid = needDevotee(req);
    const when = now();
    const events = await Event.find({ published: true }).lean();
    const [types, states, counts] = await Promise.all([EventType.find().lean(), loadUserState(uid, events.map((e) => e.slug)), joinedCounts(events.filter(hasRegistration).map((e) => e.slug))]);
    const byType = new Map(types.map((t) => [t.slug, t]));
    const rows = events.filter((e) => participates(e, states.get(e.slug))).map((e) => {
      const st = states.get(e.slug);
      const card = toCard(e, byType.get(e.typeSlug), when, { registered: hasRegistration(e) ? counts.get(e.slug) ?? 0 : null, progress: progressOf(e, st) });
      const me = toMe(e, st, when);
      return { at: new Date(st.reg?.joinedAt ?? 0).getTime(), card: { ...card, me: { registered: me.registered, passCode: me.passCode, completed: me.completed, currentMilestoneKey: me.currentMilestoneKey } } };
    });
    res.json({ events: rows.sort((a, b) => b.at - a.at || a.card.title.localeCompare(b.card.title)).map((r) => r.card) });
  });

  router.get('/me/badges', async (req, res) => {
    const uid = needDevotee(req);
    const earned = await UserBadge.find({ uid }).sort({ earnedAt: -1 }).lean();
    const [badges, events] = await Promise.all([
      Badge.find({ slug: { $in: [...new Set(earned.map((b) => b.badgeSlug))] } }).lean(),
      Event.find({ slug: { $in: [...new Set(earned.map((b) => b.eventSlug))] } }).select('slug title').lean(),
    ]);
    const bySlug = new Map(badges.map((b) => [b.slug, b]));
    const titles = new Map(events.map((e) => [e.slug, e.title]));
    res.json({
      badges: earned.filter((b) => bySlug.has(b.badgeSlug)).map((b) => {
        const d = bySlug.get(b.badgeSlug);
        return { slug: d.slug, name: d.name, nameHi: d.nameHi || '', art: d.art || '', description: d.description || '', eventSlug: b.eventSlug, eventTitle: titles.get(b.eventSlug) ?? '', earnedAt: new Date(b.earnedAt).toISOString() };
      }),
    });
  });

  const findPublished = async (slug) => {
    const e = await Event.findOne({ slug: String(slug), published: true }).lean();
    if (!e) throw new HttpError(404, 'not_found', 'Event not found.');
    return e;
  };

  router.get('/events/:slug', async (req, res) => {
    const e = await findPublished(req.params.slug);
    const uid = devoteeOf(req);
    const rewardBadges = [...new Set((e.rewards ?? []).filter((r) => r.kind === 'badge' && r.badgeSlug).map((r) => r.badgeSlug))];
    const [type, counts, states, badges] = await Promise.all([
      EventType.findOne({ slug: e.typeSlug }).lean(),
      hasRegistration(e) ? joinedCounts([e.slug]) : new Map(),
      loadUserState(uid, [e.slug], { withTasks: true }),
      rewardBadges.length ? Badge.find({ slug: { $in: rewardBadges } }, { slug: 1, name: 1, nameHi: 1 }).lean() : [],
    ]);
    res.json({ event: toDetail(e, type, now(), { registered: hasRegistration(e) ? counts.get(e.slug) ?? 0 : null, st: uid ? states.get(e.slug) : null, signedIn: !!uid, badges: new Map(badges.map((b) => [b.slug, b])) }) });
  });

  /** The detail `me` after a change, for the join answer. */
  const meOf = async (e, uid) => toMe(e, (await loadUserState(uid, [e.slug]) ).get(e.slug), now());

  router.post('/events/:slug/join', async (req, res) => {
    const uid = needDevotee(req);
    const e = await findPublished(req.params.slug);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const registration = await join({ event: e, uid, answers: body.answers, now });
    res.json({ registration, me: await meOf(e, uid) });
  });

  router.post('/events/:slug/leave', async (req, res) => {
    const uid = needDevotee(req);
    const e = await findPublished(req.params.slug);
    await leave({ event: e, uid, now });
    res.status(204).end();
  });

  router.post('/events/:slug/milestones/:mKey/tasks/:tKey/progress', async (req, res) => {
    const uid = needDevotee(req);
    const e = await findPublished(req.params.slug);
    const out = await engine.reportProgress({ event: e, uid, mKey: String(req.params.mKey), tKey: String(req.params.tKey), body: req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {} });
    res.status(out.status).json(out.body);
  });

  return router;
}
