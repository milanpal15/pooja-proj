/**
 * Deriving screen state from progress responses — pure (progress.test.mjs). The server decides what
 * is done; these helpers only fold its answers into the detail the screen already has.
 */
import type { CompletionSheet, EventDetail, EventMe, EventMilestone, EventTask, ProgressResponse } from '@/lib/api';

import { counterOf, taskDone } from './events-logic';

export function findTask(detail: Pick<EventDetail, 'milestones'> | null | undefined, mKey: string, tKey: string): { milestone: EventMilestone; task: EventTask } | null {
  const milestone = detail?.milestones?.items?.find((m) => m.key === mKey);
  const task = milestone?.tasks?.find((t) => t.key === tKey);
  return milestone && task ? { milestone, task } : null;
}

/** The detail with the caller's `me` replaced (join / leave / progress all return it). */
export function applyMe(detail: EventDetail, me: EventMe | null | undefined): EventDetail {
  return me === undefined ? detail : { ...detail, me };
}

/** Folds a progress response into the detail: the task's state, the milestone's flag, and `me`. */
export function applyProgress(detail: EventDetail, mKey: string, res: ProgressResponse): EventDetail {
  const withRoute = applyRoute(detail, mKey, res);
  const items = withRoute.milestones?.items;
  if (!items) return applyMe(withRoute, res.me);
  const next = items.map((m) => {
    if (m.key !== mKey) return m;
    const tasks = m.tasks?.map((t) =>
      t.key === res.task.key ? { ...t, state: res.task.state ?? t.state, done: !!res.task.done, completedAt: res.task.completedAt ?? t.completedAt ?? null } : t,
    );
    const justDone = !!res.milestone.done;
    return { ...m, tasks, ...(justDone ? { done: true, completedAt: m.completedAt ?? res.task.completedAt ?? null } : {}) };
  });
  return applyMe({ ...withRoute, milestones: { ...withRoute.milestones, items: next } }, res.me);
}

/**
 * A completed `location` task marks its stop on the route done, bumps `stopsDone` and moves `doneKm`
 * to the furthest completed stop (docs/EVENTS.md §11.1) — so the map updates before the re-read lands.
 * The re-read (`reload`) stays the truth; this only avoids a stale frame.
 */
function applyRoute(detail: EventDetail, mKey: string, res: ProgressResponse): EventDetail {
  const route = detail.route;
  if (!route || !res.task.done) return detail;
  const hit = route.stops.find((s) => s.milestoneKey === mKey && s.taskKey === res.task.key);
  if (!hit || hit.done) return detail;
  const stops = route.stops.map((s) => (s === hit ? { ...s, done: true, completedAt: res.task.completedAt ?? null, state: 'done' as const } : s));
  return {
    ...detail,
    route: {
      ...route,
      stops,
      progress: {
        ...route.progress,
        stopsDone: stops.filter((s) => s.done).length,
        doneKm: Math.max(route.progress.doneKm ?? 0, hit.routeKm ?? 0),
      },
    },
  };
}

/** Today's row on a Continue card: the title of the milestone the server names as current. */
export function todayTitle(
  currentKey: string | null | undefined,
  items: readonly Pick<EventMilestone, 'key' | 'title' | 'titleHi'>[] | undefined,
  lang: string | null,
): string {
  if (!currentKey) return '';
  const m = items?.find((x) => x.key === currentKey);
  if (!m) return '';
  return lang === 'hi' && m.titleHi?.trim() ? m.titleHi : m.title;
}

/** The numbered "Today" row: 1-based position and title of the milestone the server names as current. */
export function todayRow(
  currentKey: string | null | undefined,
  items: readonly Pick<EventMilestone, 'key' | 'title' | 'titleHi'>[] | undefined,
  lang: string | null,
): { index: number; title: string } | null {
  const title = todayTitle(currentKey, items, lang);
  if (!title) return null;
  return { index: (items ?? []).findIndex((x) => x.key === currentKey) + 1, title };
}

/** The "how it was completed" lines in the reader's language (blank ones dropped). */
export function howLines(c: Pick<CompletionSheet, 'how'>, lang: string | null): string[] {
  return (c.how ?? []).map((h) => (lang === 'hi' && h.textHi?.trim() ? h.textHi : h.text)).filter((s) => !!s && s.trim() !== '');
}

/** Pips for the progress card: one per milestone up to 14, else the card falls back to a bar. */
export function pips(p: { done: number; total: number }): boolean[] | null {
  if (!(p.total > 0) || p.total > 14) return null;
  return Array.from({ length: p.total }, (_, i) => i < p.done);
}

/** What a task row offers: which kind of action, from the task and the milestone's openness. */
export function taskAction(task: Pick<EventTask, 'kind' | 'config' | 'state' | 'done' | 'completedAt'>): 'done' | 'mark' | 'count' | 'none' {
  if (taskDone(task)) return 'done';
  if (task.kind === 'self_mark') return 'mark';
  if (task.kind === 'counter') return counterOf(task as EventTask) ? 'count' : 'none';
  return 'none';
}

/** The share-sheet text. No link is invented: the deep link is the app's own scheme. */
export function shareText(template: string, vars: { title: string; event: string; slug: string }): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String((vars as Record<string, string>)[k]) : ''));
}

export type TaskFailure = {
  key: 'ev_task_locked' | 'ev_task_closed' | 'ev_task_join_first' | 'ev_task_update' | 'ev_task_offline' | 'ev_task_signin' | 'ev_task_failed';
  /** The detail changed under us: re-read it. */
  reload: boolean;
};

/** Maps a refused progress report to what the screen says. `status` 0 means no answer was received. */
export function taskFailure(status: number, code?: string): TaskFailure {
  if (status === 0) return { key: 'ev_task_offline', reload: false };
  if (status === 401) return { key: 'ev_task_signin', reload: false };
  if (status === 403 && code === 'not_registered') return { key: 'ev_task_join_first', reload: true };
  if (status === 409 && code === 'locked') return { key: 'ev_task_locked', reload: true };
  if (status === 409 && code === 'closed') return { key: 'ev_task_closed', reload: true };
  if (status === 422) return { key: 'ev_task_update', reload: false };
  return { key: 'ev_task_failed', reload: status === 404 };
}

/** True when the event needs a registration the caller does not have, so tasks cannot be done yet. */
export function needsJoin(e: Pick<EventDetail, 'registration' | 'blocks' | 'me'>): boolean {
  const mode = e.registration?.mode;
  return e.blocks.includes('registration') && !!mode && mode !== 'none' && !e.me?.registered;
}
