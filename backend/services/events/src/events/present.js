/** Turns stored events into the shapes of docs/EVENTS.md (cards, details, admin rows). Pure: no database, no clock of its own. */
import { currentMilestoneKey, doneKeysOf, milestoneOpenState } from '../engine/rules.js';
import { getKind } from '../tasks/index.js';
import { deriveStatus, effectiveEnd, isFull } from './status.js';

const iso = (d) => (d ? new Date(d).toISOString() : null);
const WEEK_MS = 7 * 24 * 3600_000;

export const isoDeep = (v) => {
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(isoDeep);
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, isoDeep(x)]));
  return v;
};

const pickBlocks = (e) => Object.fromEntries((e.blocks ?? []).filter((b) => e[b] !== undefined && e[b] !== null).map((b) => [b, isoDeep(e[b])]));

/** Coins a devotee can earn in total (milestone coins + coin rewards): the card's reward label. Null when nothing is promised. */
export function rewardCoins(e) {
  const fromMilestones = (e.milestones?.items ?? []).reduce((n, m) => n + (m.coins || 0), 0);
  const fromRewards = (e.rewards ?? []).filter((r) => r.kind === 'coins').reduce((n, r) => n + (r.coins || 0), 0);
  return fromMilestones + fromRewards;
}

/** `registered` is null in phase 1 (registrations do not exist yet): never a made-up number. */
export const venueLabel = (v) => {
  const label = [v?.name, v?.city].filter(Boolean).join(', ');
  return label || null;
};

export function toCard(e, type, now, { registered = null, progress = null } = {}) {
  const cap = e.registration?.capacity;
  const coins = rewardCoins(e);
  return {
    slug: e.slug,
    title: e.title,
    titleHi: e.titleHi || '',
    summary: e.summary || '',
    summaryHi: e.summaryHi || '',
    typeSlug: e.typeSlug,
    typeName: type?.name ?? '',
    typeNameHi: type?.nameHi ?? '',
    theme: { color: e.theme?.color || type?.color || '', gradient: e.theme?.gradient || type?.gradient || null },
    cover: e.cover || '',
    venueLabel: venueLabel(e.venue),
    language: e.language || 'all',
    tags: e.tags ?? [],
    status: deriveStatus(e, now, { registered }),
    full: isFull(e.registration, registered),
    startsAt: iso(e.schedule?.startsAt),
    endsAt: iso(e.schedule?.endsAt),
    registered: Number.isInteger(registered) ? registered : null,
    spotsLeft: Number.isInteger(cap) && Number.isInteger(registered) ? Math.max(0, cap - registered) : null,
    milestoneCount: e.milestones?.items?.length ?? 0,
    ...(coins > 0 ? { rewardLabel: `${coins} coins`, rewardCoins: coins } : {}),
    ...(progress ? { progress } : {}),
  };
}

/** What a devotee has of one task: the stored row (or none) through the kind's `publicState`. */
const taskView = (t, kindInfo, row) => ({
  key: t.key, kind: t.kind, title: t.title, titleHi: t.titleHi || '', config: t.config ?? {},
  summary: kindInfo?.summary(t.config ?? {}, 'en') ?? '', summaryHi: kindInfo?.summary(t.config ?? {}, 'hi') ?? '',
  interactive: !!kindInfo?.interactive, minAppVersion: kindInfo?.minAppVersion ?? null,
  state: kindInfo?.publicState ? kindInfo.publicState(row?.state) : {}, done: !!row?.completedAt, completedAt: iso(row?.completedAt),
});

/**
 * The milestones as a caller sees them. `st` is that caller's state for THIS event (see engine/user-state.js; null for a guest, who has
 * completed nothing). A milestone that is not open (opens later, waits for the one before it, or its catch-up window closed) is
 * summarised without tasks (`locked: true`, plus `missed: true` when the window closed); a completed one is always shown in full.
 */
export function milestoneViews(ms, now, schedule, st = null) {
  const items = ms?.items ?? [];
  const t = new Date(now).getTime();
  const done = doneKeysOf(ms, st?.results?.keys() ?? []);
  return items.map((m, i) => {
    const completedAt = iso(st?.results?.get(m.key));
    const isDone = done.has(m.key);
    const open = milestoneOpenState(ms, i, done, t, schedule);
    if (!open.open) {
      return { key: m.key, title: m.title, titleHi: m.titleHi || '', opensAt: iso(m.opensAt), coins: m.coins || 0, locked: true, ...(open.reason === 'missed' ? { missed: true } : {}), done: false, completedAt: null };
    }
    return {
      key: m.key, title: m.title, titleHi: m.titleHi || '', summary: m.summary || '', summaryHi: m.summaryHi || '', opensAt: iso(m.opensAt),
      coins: m.coins || 0, link: m.link ?? null, completion: m.completion, locked: false, done: isDone, completedAt: isDone ? completedAt : null,
      tasks: m.tasks.map((task) => taskView(task, getKind(task.kind), st?.tasks?.get(`${m.key}/${task.key}`))),
    };
  });
}

/** `{done,total}`: completed milestones (that still exist) of all milestones. */
export const progressOf = (e, st) => ({ done: doneKeysOf(e.milestones, st?.results?.keys() ?? []).size, total: e.milestones?.items?.length ?? 0 });

/** Is this devotee taking part? Joined, or (an event with nothing to join) has reported any progress. */
export const participates = (e, st) => !!st && (st.reg?.status === 'joined' || (!hasRegistration(e) && st.hasProgress));
export const hasRegistration = (e) => !!e.registration && e.registration.mode !== 'none';

/** Has the event begun? An `always` event, or one with no start, has. */
export const hasStarted = (schedule, now) => !schedule || schedule.mode === 'always' || !schedule.startsAt || new Date(schedule.startsAt).getTime() <= new Date(now).getTime();

/** The detail's `me` (null for a guest). */
export function toMe(e, st, now) {
  const done = doneKeysOf(e.milestones, st?.results?.keys() ?? []);
  const reg = st?.reg?.status === 'joined' ? st.reg : null;
  return {
    registered: !!reg,
    passCode: reg && e.registration?.pass && reg.passCode ? reg.passCode : null,
    answers: reg?.answers ?? {},
    progress: progressOf(e, st),
    currentMilestoneKey: e.milestones && hasStarted(e.schedule, now) ? currentMilestoneKey(e.milestones, done, new Date(now).getTime(), e.schedule) : null,
    completed: !!st?.eventResult,
  };
}

/**
 * The public detail: the card, then ONLY the blocks the event has, in `blocks` order, then `me`. `opts.registered` is the real joined
 * count (null when the event has no registration block), `opts.st` the caller's state (omit for a guest: `me` is null).
 */
export function toDetail(e, type, now, { registered = null, st = null, signedIn = false, badges = null } = {}) {
  const blocks = pickBlocks(e);
  // A badge reward carries the badge's display name, so the app never has to show a slug.
  if (Array.isArray(blocks.rewards) && badges) {
    blocks.rewards = blocks.rewards.map((r) => (r.kind === 'badge' && badges.has(r.badgeSlug) ? { ...r, badgeName: badges.get(r.badgeSlug).name, badgeNameHi: badges.get(r.badgeSlug).nameHi || '' } : r));
  }
  if (blocks.milestones) {
    blocks.milestones = {
      order: e.milestones.order, missed: e.milestones.missed, completion: e.milestones.completion,
      items: milestoneViews(e.milestones, now, e.schedule, st),
    };
  }
  const card = toCard(e, type, now, { registered, progress: signedIn && participates(e, st) ? progressOf(e, st) : null });
  if (blocks.registration) {
    const r = e.registration;
    blocks.registration = {
      mode: r.mode, coins: r.coins, capacity: r.capacity ?? null, opensAt: iso(r.opensAt), closesAt: iso(r.closesAt), pass: !!r.pass,
      fields: r.fields ?? [], registered: card.registered, spotsLeft: card.spotsLeft,
    };
  }
  return { ...card, schemaVersion: e.schemaVersion ?? 1, blocks: e.blocks ?? [], ...blocks, me: signedIn ? toMe(e, st, now) : null };
}

/** Dashboard row / editor document: the stored event (ids as strings, dates as ISO) plus the derived status. */
export function toAdmin(e, type, now) {
  const { _id, __v, ...rest } = e;
  return { id: String(_id), ...isoDeep(rest), status: deriveStatus(e, now), typeName: type?.name ?? '', milestoneCount: e.milestones?.items?.length ?? 0 };
}

/** Sections of the list (docs/EVENTS.md 5.1). An ended event appears nowhere; a live one is "this week". */
export function sectionOf(card, e, now) {
  if (card.status === 'ended' || card.status === 'draft') return null;
  const t = new Date(now).getTime();
  const start = e.schedule?.startsAt ? new Date(e.schedule.startsAt).getTime() : null;
  return card.status === 'live' || (start !== null && start - t < WEEK_MS) ? 'thisWeek' : 'upcoming';
}

export const sortByStart = (a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? '') || a.title.localeCompare(b.title);
export { effectiveEnd };
