/**
 * Pure helpers for the Events screens — no React, no network, so they are testable with
 * `node --test src/features/events/lib/events-logic.test.mjs`.
 *
 * Nothing in here may branch on an event TYPE (docs/EVENTS.md §0.1): presentation comes from the
 * data (`theme`, the type's colour), and what to draw comes from `blocks` / task `kind`.
 */
import type { EventCard, EventMilestone, EventReward, EventTask } from '@/lib/api';

/* ─────────────────────────────────────────────────── forward compatibility ── */

/** Block names this build can draw. An unknown block in `event.blocks` is hidden (§0.8). */
export const SUPPORTED_BLOCKS: readonly string[] = ['schedule', 'registration', 'venue', 'milestones', 'rewards', 'content'];

/** Task kinds this build can show. An unknown kind renders "Update the app to complete this". */
export const SUPPORTED_TASKS: readonly string[] = [
  'self_mark',
  'counter',
  'live_darshan',
  'bhajan_listened',
  'chadhava_offered',
  'pooja_booked',
  'location',
  'qr_checkin',
  'photo',
];

export const isSupportedTask = (kind: string) => SUPPORTED_TASKS.includes(kind);

/** The blocks to draw: the event's own order, known names only, each once. */
export function visibleBlocks(blocks: readonly string[] | undefined | null): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const b of blocks ?? []) {
    if (typeof b !== 'string' || seen.has(b) || !SUPPORTED_BLOCKS.includes(b)) continue;
    seen.add(b);
    out.push(b);
  }
  return out;
}

/* ───────────────────────────────────────────────────────────────── time ── */

const IST_MS = 330 * 60_000;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Parses an ISO instant; null for empty or unparseable. */
export function toMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const n = Date.parse(iso);
  return Number.isFinite(n) ? n : null;
}

/** Calendar parts in IST — events are IST on the server (§0.7), so the phone's zone must not shift them. */
function ist(ms: number) {
  const d = new Date(ms + IST_MS);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth(),
    day: d.getUTCDate(),
    dow: d.getUTCDay(),
    h: d.getUTCHours(),
    min: d.getUTCMinutes(),
    ymd: d.getUTCFullYear() * 10000 + d.getUTCMonth() * 100 + d.getUTCDate(),
  };
}

/** "17 Oct" */
export function shortDate(iso: string | null | undefined): string {
  const ms = toMs(iso);
  if (ms === null) return '';
  const p = ist(ms);
  return `${p.day} ${MONTHS[p.m]}`;
}

/** "Sat 17 Oct" */
export function longDate(iso: string | null | undefined): string {
  const ms = toMs(iso);
  if (ms === null) return '';
  const p = ist(ms);
  return `${DAYS[p.dow]} ${p.day} ${MONTHS[p.m]}`;
}

/** "8:00 pm" (12h, IST). */
export function clockTime(iso: string | null | undefined): string {
  const ms = toMs(iso);
  if (ms === null) return '';
  const p = ist(ms);
  const h12 = p.h % 12 === 0 ? 12 : p.h % 12;
  return `${h12}:${String(p.min).padStart(2, '0')} ${p.h >= 12 ? 'pm' : 'am'}`;
}

/**
 * The "when" line of an event, from its schedule only.
 * single (under a day): "Sat 17 Oct · 8:00 pm – 12:00 am"; multiday: "11 Oct – 19 Oct"; always / unknown: "".
 */
export function whenLine(s: { mode?: string; startsAt?: string | null; endsAt?: string | null } | undefined): string {
  if (!s || s.mode === 'always') return '';
  const a = toMs(s.startsAt);
  if (a === null) return '';
  const b = toMs(s.endsAt);
  if (s.mode === 'multiday' && b !== null && ist(a).ymd !== ist(b).ymd) return `${shortDate(s.startsAt)} – ${shortDate(s.endsAt)}`;
  if (b === null) return `${longDate(s.startsAt)} · ${clockTime(s.startsAt)}`;
  if (ist(a).ymd === ist(b).ymd || (s.mode === 'single' && b - a < 24 * 3_600_000)) return `${longDate(s.startsAt)} · ${clockTime(s.startsAt)} – ${clockTime(s.endsAt)}`;
  return `${shortDate(s.startsAt)} – ${shortDate(s.endsAt)}`;
}

export type Countdown = { days: number; hours: number; minutes: number; totalMinutes: number };

/** Time left until `iso`; null when it has no valid time or has already passed. */
export function countdown(iso: string | null | undefined, now: number): Countdown | null {
  const at = toMs(iso);
  if (at === null || at <= now) return null;
  const totalMinutes = Math.ceil((at - now) / 60_000);
  return { days: Math.floor(totalMinutes / 1440), hours: Math.floor((totalMinutes % 1440) / 60), minutes: totalMinutes % 60, totalMinutes };
}

/** "{n}" placeholder filler for i18n templates (the app's `t()` takes no arguments). */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : ''));
}

/* ─────────────────────────────────────────────────────────────── status ── */

export type StatusLabel = {
  /** An i18n key (the screen translates it). */
  key: 'ev_st_live' | 'ev_st_open' | 'ev_st_full' | 'ev_st_ended' | 'ev_st_starts_in_days' | 'ev_st_starts_in_hours' | 'ev_st_starts_soon' | 'ev_st_scheduled';
  vars: Record<string, number>;
  tone: 'live' | 'open' | 'muted' | 'info';
};

/**
 * The chip on a card. `full` beats `registration_open`; `scheduled` becomes a countdown while it is near.
 * An unknown status falls back to the neutral "scheduled" label rather than printing a raw string.
 */
export function statusLabel(card: Pick<EventCard, 'status' | 'full' | 'startsAt'>, now: number): StatusLabel {
  if (card.status === 'live') return { key: 'ev_st_live', vars: {}, tone: 'live' };
  if (card.status === 'ended') return { key: 'ev_st_ended', vars: {}, tone: 'muted' };
  if (card.full && card.status !== 'draft') return { key: 'ev_st_full', vars: {}, tone: 'muted' };
  if (card.status === 'registration_open') return { key: 'ev_st_open', vars: {}, tone: 'open' };
  const left = countdown(card.startsAt, now);
  if (left) {
    if (left.days >= 1) return { key: 'ev_st_starts_in_days', vars: { n: left.days }, tone: 'info' };
    if (left.hours >= 1) return { key: 'ev_st_starts_in_hours', vars: { n: left.hours }, tone: 'info' };
    return { key: 'ev_st_starts_soon', vars: {}, tone: 'info' };
  }
  return { key: 'ev_st_scheduled', vars: {}, tone: 'info' };
}

/* ─────────────────────────────────────────────────────── progress ring ── */

/** 0..1 for `done` of `total`; a missing or zero total is 0, never NaN. */
export function progressRatio(p: { done: number; total: number } | null | undefined): number {
  if (!p || !(p.total > 0) || !(p.done > 0)) return 0;
  return Math.min(1, p.done / p.total);
}

/** The stroke-dasharray of a ring: `[filled, rest]` for a circle of radius `r`. */
export function ringDash(radius: number, ratio: number): [number, number] {
  const c = 2 * Math.PI * radius;
  const f = Math.max(0, Math.min(1, ratio)) * c;
  return [f, Math.max(0, c - f)];
}

/** The point on a ring where the arc ends, clockwise from 12 o'clock. */
export function ringEnd(cx: number, cy: number, radius: number, ratio: number): { x: number; y: number } {
  const a = -Math.PI / 2 + Math.max(0, Math.min(1, ratio)) * 2 * Math.PI;
  return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
}

/* ───────────────────────────────────────────────────────────── theme ── */

const FALLBACK: readonly [string, string] = ['#7A1C2A', '#C9661E'];
const HEX = /^#[0-9a-f]{6}$/i;

/** The card's colours: its own theme, then the type's, then a warm default. Never keyed on a type slug. */
export function themeOf(
  card: Pick<EventCard, 'color' | 'gradient' | 'theme'>,
  typeColor?: string,
): { color: string; gradient: [string, string] } {
  const g = card.theme?.gradient ?? card.gradient;
  const color = [card.theme?.color, card.color, typeColor].find((x) => typeof x === 'string' && HEX.test(x)) ?? (g?.[0] && HEX.test(g[0]) ? g[0] : FALLBACK[0]);
  const gradient: [string, string] = g && g.length >= 2 && HEX.test(g[0]) && HEX.test(g[1]) ? [g[0], g[1]] : [color, FALLBACK[1]];
  return { color, gradient };
}

/* ───────────────────────────────────────────────────────── list sections ── */

export type ListFilter = { type: string; tag: string };
export const ALL = 'all';

/** Applies the type chip and tag chip. Tags are matched only when a card carries them. */
export function filterCards<T extends Pick<EventCard, 'typeSlug' | 'tags'>>(cards: T[], f: ListFilter): T[] {
  return cards.filter((c) => (f.type === ALL || c.typeSlug === f.type) && (f.tag === ALL || (c.tags ?? []).includes(f.tag)));
}

export type ListSections = {
  continue: EventCard[];
  thisWeek: EventCard[];
  upcoming: EventCard[];
  mine: EventCard[];
};

/**
 * The Explore view: Continue, This week, Upcoming, filtered by the chips. A card appears once — an
 * event already in Continue is not repeated under This week, and This week is not repeated under Upcoming.
 */
export function sectionList(s: ListSections, f: ListFilter): { continue: EventCard[]; thisWeek: EventCard[]; upcoming: EventCard[]; total: number } {
  const used = new Set<string>();
  const take = (cards: EventCard[]) =>
    filterCards(cards, f).filter((c) => {
      if (used.has(c.slug)) return false;
      used.add(c.slug);
      return true;
    });
  const cont = take(s.continue);
  const week = take(s.thisWeek);
  const up = take(s.upcoming);
  return { continue: cont, thisWeek: week, upcoming: up, total: cont.length + week.length + up.length };
}

/* ─────────────────────────────────────────────────────────── milestones ── */

export type MilestoneState = 'locked' | 'open' | 'done';

/** From server data only: `locked` flag, else `done`/`completedAt`, else open. The client never decides. */
export function milestoneState(m: Pick<EventMilestone, 'locked' | 'done' | 'completedAt'>): MilestoneState {
  if (m.locked) return 'locked';
  if (m.done || m.completedAt) return 'done';
  return 'open';
}

export const taskDone = (t: Pick<EventTask, 'done' | 'completedAt'>) => !!(t.done || t.completedAt);

/** Milestones in order with their state, and how many are done. */
export function milestoneSummary(items: readonly EventMilestone[] | undefined): { done: number; total: number; states: MilestoneState[] } {
  const states = (items ?? []).map(milestoneState);
  return { done: states.filter((s) => s === 'done').length, total: states.length, states };
}

/** The first milestone that is open and not finished — the one to highlight. */
export function currentMilestoneIndex(items: readonly EventMilestone[] | undefined, currentKey?: string | null): number {
  const list = items ?? [];
  if (currentKey) {
    const i = list.findIndex((m) => m.key === currentKey);
    if (i >= 0 && milestoneState(list[i]) === 'open') return i;
  }
  return list.findIndex((m) => milestoneState(m) === 'open');
}

/** "54 of 108" progress for a counter task, only when the server sent both numbers. */
export function counterOf(t: Pick<EventTask, 'kind' | 'config' | 'state'>): { count: number; target: number } | null {
  if (t.kind !== 'counter') return null;
  const target = Number(t.config?.target);
  const count = Number(t.state?.count ?? 0);
  if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(count)) return null;
  return { count: Math.max(0, Math.min(count, target)), target };
}

/* ───────────────────────────────────────────────────────────── rewards ── */

/** What finishing earns, summed from `rewards[]`: coins, badges (count + any names), certificate. */
export function rewardSummary(rewards: readonly EventReward[] | undefined): { coins: number; badgeCount: number; badgeNames: string[]; certificate: boolean } {
  let coins = 0;
  let badgeCount = 0;
  const badgeNames: string[] = [];
  let certificate = false;
  for (const r of rewards ?? []) {
    if (r.kind === 'coins' && Number(r.coins) > 0) coins += Number(r.coins);
    else if (r.kind === 'badge') {
      badgeCount += 1;
      const n = r.badgeName || r.badgeSlug;
      if (n) badgeNames.push(n);
    } else if (r.kind === 'certificate') certificate = true;
  }
  return { coins, badgeCount, badgeNames, certificate };
}

/* ─────────────────────────────────────────────────────────────── venue ── */

/** The Directions URL: coordinates when both exist, else a search on the address; null when neither. */
export function directionsUrl(v: { name?: string; city?: string; address?: string; lat?: number | null; lng?: number | null } | undefined): string | null {
  if (!v) return null;
  if (typeof v.lat === 'number' && typeof v.lng === 'number' && Number.isFinite(v.lat) && Number.isFinite(v.lng)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lng}`;
  }
  const q = [v.name, v.address, v.city].filter(Boolean).join(', ');
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

/** "Venue, City" for a one-line label. */
export const venueLine = (v: { name?: string; city?: string } | undefined) => [v?.name, v?.city].filter(Boolean).join(', ');

/** A parsed cache entry, or null when it is not the shape we wrote. */
export function parseCache<T>(raw: string | null, ok: (v: unknown) => boolean): T | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    return ok(v) ? (v as T) : null;
  } catch {
    return null;
  }
}
