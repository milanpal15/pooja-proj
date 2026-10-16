/**
 * Location milestones, the pure half (docs/EVENTS.md §11) — no React, no native modules, tested in
 * route.test.mjs. The server decides whether a stop is reached; everything here only prepares what to
 * show and what to report, and never says "I'm there".
 */
import { formatDistance } from '../../../components/map/distance';
import { type Bounds, boundsOf, haversineM, type LatLng } from '../../../components/map/geometry';
import type { EventRoute, LocationReport, RouteProgress, RouteStop, RouteStopState } from '@/lib/api';

import { fill } from './events-logic';
import { taskFailure, type TaskFailure } from './progress';

/** Server limits (§11.2), mirrored so the app does not send what is certain to be refused. */
export const MAX_ACCURACY_M = 100;
/** The check-in button's slack: radius + min(accuracy, this). The server still decides. */
export const MAX_SLACK_M = 50;
/** An automatic report for one stop is retried no sooner than this after a refusal. */
export const AUTO_RETRY_MS = 20_000;

export type ResolvedStop = RouteStop & { state: RouteStopState };

export const stopKey = (s: Pick<RouteStop, 'milestoneKey' | 'taskKey'>) => `${s.milestoneKey}:${s.taskKey}`;

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Stops with a usable position, in path order. */
export function orderedStops(stops: readonly RouteStop[] | undefined | null): RouteStop[] {
  return (stops ?? [])
    .filter((s) => s && finite(s.lat) && finite(s.lng) && Math.abs(s.lat) <= 90 && Math.abs(s.lng) <= 180)
    .slice()
    .sort((a, b) => (finite(a.order) && finite(b.order) && a.order !== b.order ? a.order - b.order : (a.routeKm ?? 0) - (b.routeKm ?? 0)));
}

/**
 * Each stop's state from what is known: done, locked, else `next` for the FIRST open stop along the
 * path and `open` for the rest. The server sends `state` too; this does not depend on it, so an older
 * or partial payload still draws correctly.
 */
export function resolveStops(stops: readonly RouteStop[] | undefined | null): ResolvedStop[] {
  let nextFound = false;
  return orderedStops(stops).map((s) => {
    let state: RouteStopState;
    if (s.done) state = 'done';
    else if (s.locked) state = 'locked';
    else if (!nextFound) {
      state = 'next';
      nextFound = true;
    } else state = 'open';
    return { ...s, state };
  });
}

export const nextStop = (stops: readonly ResolvedStop[]): ResolvedStop | null => stops.find((s) => s.state === 'next') ?? null;

/** Stops that can be checked into right now. */
export const openStops = (stops: readonly ResolvedStop[]): ResolvedStop[] => stops.filter((s) => s.state === 'next' || s.state === 'open');

export const distanceToStop = (user: LatLng | null | undefined, stop: Pick<RouteStop, 'lat' | 'lng'>): number | null =>
  user && finite(user.lat) && finite(user.lng) ? haversineM(user, stop) : null;

/** The Check in button: inside radius + min(accuracy, 50 m). Without a fix it is off. */
export function canCheckIn(distanceM: number | null, radiusM: number, accuracyM?: number | null): boolean {
  if (distanceM == null || !finite(distanceM) || !finite(radiusM)) return false;
  const slack = finite(accuracyM) && accuracyM >= 0 ? Math.min(accuracyM, MAX_SLACK_M) : 0;
  return distanceM <= radiusM + slack;
}

/* ───────────────────────────────────────────────────────────────── auto check-in ── */

export type Fix = { lat: number; lng: number; accuracyM?: number | null; mocked?: boolean };

/**
 * Which stop (if any) an automatic report should be sent for, given a fix. Conditions, all of them:
 *  - the switch is on and the fix is not flagged mocked;
 *  - the fix is good: an accuracy that is known and <= 100 m;
 *  - the stop is open (not done, not locked) and the fix is INSIDE its radius (no slack: the server
 *    uses the plain radius);
 *  - the stop has not already been reported this session (`reported`), and was not tried within the
 *    last `AUTO_RETRY_MS` (`triedAt`: a refusal such as too_far must not become a loop).
 * With several candidates the nearest wins.
 */
export function autoCheckInTarget(input: {
  enabled: boolean;
  fix: Fix | null | undefined;
  stops: readonly ResolvedStop[];
  reported: ReadonlySet<string>;
  triedAt: Readonly<Record<string, number>>;
  now: number;
}): ResolvedStop | null {
  const { enabled, fix, stops, reported, triedAt, now } = input;
  if (!enabled || !fix || fix.mocked) return null;
  if (!finite(fix.accuracyM) || fix.accuracyM > MAX_ACCURACY_M || fix.accuracyM < 0) return null;
  let best: ResolvedStop | null = null;
  let bestD = Infinity;
  for (const s of openStops(stops)) {
    const key = stopKey(s);
    if (reported.has(key)) continue;
    const t = triedAt[key];
    if (t != null && now - t < AUTO_RETRY_MS) continue;
    const d = haversineM(fix, s);
    if (d <= s.radiusM && d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

/** The report body from an `expo-location` position (Android sets `mocked`). Accuracy is left out when unknown. */
export function reportFromPosition(pos: {
  coords: { latitude: number; longitude: number; accuracy?: number | null };
  timestamp?: number;
  mocked?: boolean;
}): LocationReport {
  const acc = pos.coords.accuracy;
  const at = finite(pos.timestamp) ? pos.timestamp : Date.now();
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    ...(finite(acc) && acc >= 0 ? { accuracyM: Math.round(acc) } : {}),
    mocked: pos.mocked === true,
    at: new Date(at).toISOString(),
  };
}

/* ───────────────────────────────────────────────────────────────────── messages ── */

export type LocationFailureKey =
  | TaskFailure['key']
  | 'ev_loc_too_far'
  | 'ev_loc_weak'
  | 'ev_loc_mock'
  | 'ev_loc_implausible'
  | 'ev_loc_too_fast';

export type LocationFailure = {
  key: LocationFailureKey;
  /** Placeholders for the message (distances already formatted for the language). */
  vars: Record<string, string>;
  /** The detail changed under us: re-read it. */
  reload: boolean;
  /** Do not try this stop again automatically (the cause will not fix itself). */
  final: boolean;
};

/**
 * A refused (or unanswered) location report -> what the devotee reads. `status` 0 = no answer. Anything
 * not specific to location falls through to the shared task messages (locked / closed / not_registered /
 * offline / sign-in).
 */
export function locationFailure(status: number, code: string | undefined, body: Record<string, unknown> | undefined, lang: string | null): LocationFailure {
  const l = lang === 'hi' ? 'hi' : 'en';
  const num = (v: unknown) => (finite(v) ? v : NaN);
  if (code === 'mock_location') return { key: 'ev_loc_mock', vars: {}, reload: false, final: true };
  if (code === 'weak_fix') return { key: 'ev_loc_weak', vars: { max: formatDistance(num(body?.maxM) || MAX_ACCURACY_M, l) }, reload: false, final: false };
  if (code === 'implausible_move') return { key: 'ev_loc_implausible', vars: {}, reload: false, final: false };
  if (code === 'too_fast' || status === 429) return { key: 'ev_loc_too_fast', vars: {}, reload: false, final: false };
  if (code === 'too_far') {
    return {
      key: 'ev_loc_too_far',
      vars: { distance: formatDistance(num(body?.distanceM), l) || '—', radius: formatDistance(num(body?.radiusM), l) || '—' },
      reload: false,
      final: false,
    };
  }
  const f = taskFailure(status, code);
  return { key: f.key, vars: {}, reload: f.reload, final: f.key === 'ev_task_locked' || f.key === 'ev_task_closed' || f.key === 'ev_task_join_first' };
}

/** "12.4" / "31" — one decimal, dropped when it is .0. */
export function kmText(km: number): string {
  if (!finite(km) || km < 0) return '0';
  const r = Math.round(km * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** "12.4 of 31 km · 3 of 7 stops": `template` has {done} {total} {stops} {stopsTotal}. */
export function progressLine(p: RouteProgress | null | undefined, template: string): string {
  if (!p) return '';
  const total = finite(p.totalKm) ? p.totalKm : 0;
  return fill(template, {
    done: kmText(Math.min(p.doneKm ?? 0, total || p.doneKm || 0)),
    total: kmText(total),
    stops: Math.max(0, p.stopsDone ?? 0),
    stopsTotal: Math.max(0, p.stopsTotal ?? 0),
  });
}

/** Share of the path done, 0..1 (for a thin progress bar). */
export function progressRatio(p: RouteProgress | null | undefined): number {
  if (!p || !(p.totalKm > 0)) return 0;
  return Math.min(1, Math.max(0, p.doneKm / p.totalKm));
}

/* ─────────────────────────────────────────────────────────────────────── path ── */

const pathLngLat = (path: readonly (readonly [number, number])[] | undefined | null): [number, number][] =>
  (path ?? []).filter((p) => Array.isArray(p) && finite(p[0]) && finite(p[1])).map((p) => [p[1], p[0]] as [number, number]);

/**
 * Splits the path (`[lat,lng]` points) at `doneKm` along it: `done` is the part already covered,
 * `rest` the part ahead, both in GeoJSON order `[lng,lat]`, sharing the split point so the line has no
 * gap. `doneKm <= 0` -> all rest; `>= length` -> all done.
 */
export function splitPath(path: readonly (readonly [number, number])[] | undefined | null, doneKm: number): { done: [number, number][]; rest: [number, number][] } {
  const pts = pathLngLat(path);
  if (pts.length < 2) return { done: [], rest: pts };
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + haversineM({ lat: pts[i - 1][1], lng: pts[i - 1][0] }, { lat: pts[i][1], lng: pts[i][0] }) / 1000);
  }
  const at = finite(doneKm) ? doneKm : 0;
  if (at <= 0) return { done: [], rest: pts };
  if (at >= cum[cum.length - 1]) return { done: pts, rest: [] };
  let i = 1;
  while (i < cum.length && cum[i] < at) i++;
  const seg = cum[i] - cum[i - 1];
  const f = seg > 0 ? (at - cum[i - 1]) / seg : 0;
  const split: [number, number] = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f];
  return { done: [...pts.slice(0, i), split], rest: [split, ...pts.slice(i)] };
}

/** The box that frames the whole journey: path, start, end and every stop. Null when nothing is placeable. */
export function routeBounds(route: Pick<EventRoute, 'path' | 'start' | 'end'> | null | undefined, stops: readonly RouteStop[] = []): Bounds | null {
  if (!route) return null;
  const pts: LatLng[] = [
    ...(route.path ?? []).map((p) => ({ lat: p[0], lng: p[1] })),
    ...[route.start, route.end].filter(Boolean).map((p) => ({ lat: p.lat, lng: p.lng })),
    ...stops.map((s) => ({ lat: s.lat, lng: s.lng })),
  ];
  return boundsOf(pts, 0.02);
}

/** A circle on the ground as a ring of points (the map's own circles are in pixels, not metres). */
export function circleRing(center: LatLng, radiusM: number, steps = 48): [number, number][] {
  const ring: [number, number][] = [];
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.max(0.01, Math.cos((center.lat * Math.PI) / 180)));
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    ring.push([center.lng + dLng * Math.cos(a), center.lat + dLat * Math.sin(a)]);
  }
  ring.push(ring[0]);
  return ring;
}

/** "Name" of a stop/endpoint in the reader's language (Hindi only when written). */
export const placeLabel = (p: { name?: string; nameHi?: string }, lang: string | null): string => {
  const hi = p.nameHi?.trim();
  return lang === 'hi' && hi ? hi : (p.name ?? '');
};

/** The place a `location` task asks for, from its config; null when the config is unusable. */
export function locationPlace(task: { config?: Record<string, unknown> | null }): { name: string; nameHi?: string; note?: string } | null {
  const cfg = task.config ?? {};
  const name = typeof cfg.name === 'string' ? cfg.name.trim() : '';
  if (!name) return null;
  return {
    name,
    ...(typeof cfg.nameHi === 'string' && cfg.nameHi.trim() ? { nameHi: cfg.nameHi.trim() } : {}),
    ...(typeof cfg.note === 'string' && cfg.note.trim() ? { note: cfg.note.trim() } : {}),
  };
}
