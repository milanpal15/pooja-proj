/**
 * The Yatra route (docs/EVENTS.md section 11.1): validation of the `route` block, the figures computed on save, and the detail's
 * `route` view. Pure: no database, no clock of its own.
 */
import { nearestOnPath, pathLengthKm, round } from '../lib/geo.js';
import { doneKeysOf, milestoneOpenState } from '../engine/rules.js';

export const OFF_ROUTE_WARN_M = 1000;
export const MAX_PATH_POINTS = 500;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const hasStarted = (schedule, now) => !schedule || schedule.mode === 'always' || !schedule.startsAt || new Date(schedule.startsAt).getTime() <= new Date(now).getTime();
const isoOf = (d) => (d ? new Date(d).toISOString() : null);

/** Validates the operator's `route` object; returns the block to store (without computed figures) or undefined. `c` is validate.js's collector. */
export function normalizeRoute(c, v) {
  if (!isObj(v)) { c.add('route', 'The route block must be an object.'); return undefined; }
  const coord = (path, x, min, max) => {
    const n = typeof x === 'string' && x.trim() !== '' ? Number(x) : x;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) { c.add(path, `Must be a number from ${min} to ${max}.`); return null; }
    return n;
  };
  const end = (name, x) => {
    const p = `route.${name}`;
    if (!isObj(x)) { c.add(p, `Give the ${name} point.`); return null; }
    return {
      name: c.str(`${p}.name`, x.name, { max: 80 }), nameHi: c.str(`${p}.nameHi`, x.nameHi, { max: 80 }),
      lat: coord(`${p}.lat`, x.lat, -90, 90), lng: coord(`${p}.lng`, x.lng, -180, 180),
    };
  };
  const start = end('start', v.start);
  const finish = end('end', v.end);
  const mapReveal = c.oneOf('route.mapReveal', v.mapReveal, ['all', 'unlocked'], 'all');
  let path = [];
  if (!Array.isArray(v.path) || v.path.length < 2 || v.path.length > MAX_PATH_POINTS) c.add('route.path', `The path needs 2 to ${MAX_PATH_POINTS} points.`);
  else {
    path = v.path.map((pt, i) => {
      if (!Array.isArray(pt) || pt.length !== 2) { c.add(`route.path.${i}`, 'Must be [latitude, longitude].'); return null; }
      const lat = coord(`route.path.${i}`, pt[0], -90, 90);
      const lng = coord(`route.path.${i}`, pt[1], -180, 180);
      return lat === null || lng === null ? null : [lat, lng];
    });
    if (path.some((p) => p === null)) path = [];
  }
  if (!start || !finish || start.lat === null || start.lng === null || finish.lat === null || finish.lng === null || path.length < 2) return undefined;
  // The path begins at the start and ends at the end: the two ends are snapped to those coordinates (the dashboard does the same).
  path = [[start.lat, start.lng], ...path.slice(1, -1), [finish.lat, finish.lng]];
  return { start, end: finish, path, mapReveal, lengthKm: round(pathLengthKm(path), 3) };
}

/**
 * Fills `config.routeKm` / `config.offRouteM` of every `location` task from the route (and removes them when there is no valid route),
 * and collects the `off_route` warnings. Mutates the normalised `out.milestones` in place.
 */
export function applyRoute(milestones, route, warnings) {
  (milestones?.items ?? []).forEach((m, i) => {
    m.tasks.forEach((t, j) => {
      if (t.kind !== 'location') return;
      const cfg = t.config;
      delete cfg.routeKm;
      delete cfg.offRouteM;
      if (!route || !Number.isFinite(cfg.lat) || !Number.isFinite(cfg.lng)) return;
      const near = nearestOnPath(route.path, [cfg.lat, cfg.lng]);
      cfg.routeKm = round(near.routeKm, 3);
      cfg.offRouteM = Math.round(near.distanceM);
      if (near.distanceM > OFF_ROUTE_WARN_M) warnings?.push({ path: `milestones.items.${i}.tasks.${j}.config`, code: 'off_route', distanceM: cfg.offRouteM });
    });
  });
}

/**
 * The detail's `route` (null without a route block). Stops are the `location` tasks of the milestones, ordered by `routeKm` (ties by
 * milestone then task order); `order` is 1-based over ALL stops so a stop keeps its number. States: `done`; `locked` (the milestone
 * is not open: opens later, waits for the one before it, its window closed, or the event has not started); `next` = the first
 * open, not-done stop; else `open`. `mapReveal:'unlocked'` leaves locked stops out of `stops` (the progress totals stay true).
 */
export function routeView(e, now, st = null) {
  if (!e.route || !(e.blocks ?? []).includes('route')) return null;
  const r = e.route;
  const ms = e.milestones;
  const t = new Date(now).getTime();
  const doneMs = doneKeysOf(ms, st?.results?.keys() ?? []);
  const started = hasStarted(e.schedule, now);
  const raw = [];
  (ms?.items ?? []).forEach((m, i) => {
    const open = started && milestoneOpenState(ms, i, doneMs, t, e.schedule).open;
    m.tasks.forEach((task) => {
      if (task.kind !== 'location') return;
      const c = task.config ?? {};
      const routeKm = Number.isFinite(c.routeKm) ? c.routeKm : round(nearestOnPath(r.path, [c.lat, c.lng]).routeKm, 3);
      const row = st?.tasks?.get(`${m.key}/${task.key}`);
      raw.push({ m, task, c, routeKm, done: !!row?.completedAt, completedAt: isoOf(row?.completedAt), locked: !open, seq: raw.length });
    });
  });
  raw.sort((a, b) => a.routeKm - b.routeKm || a.seq - b.seq);
  let nextFound = false;
  const all = raw.map((s, i) => {
    let state = 'open';
    if (s.done) state = 'done';
    else if (s.locked) state = 'locked';
    else if (!nextFound) { state = 'next'; nextFound = true; }
    return {
      milestoneKey: s.m.key, taskKey: s.task.key, order: i + 1, title: s.m.title, titleHi: s.m.titleHi || '',
      name: s.c.name, nameHi: s.c.nameHi || '', note: s.c.note || '', lat: s.c.lat, lng: s.c.lng, radiusM: s.c.radiusM, routeKm: s.routeKm,
      done: s.done, completedAt: s.completedAt, locked: s.locked && !s.done, state,
    };
  });
  const doneStops = all.filter((s) => s.done);
  return {
    start: r.start, end: r.end, path: r.path, lengthKm: r.lengthKm, mapReveal: r.mapReveal ?? 'all',
    stops: r.mapReveal === 'unlocked' ? all.filter((s) => s.state !== 'locked') : all,
    progress: { doneKm: doneStops.length ? Math.max(...doneStops.map((s) => s.routeKm)) : 0, totalKm: r.lengthKm, stopsDone: doneStops.length, stopsTotal: all.length },
  };
}
