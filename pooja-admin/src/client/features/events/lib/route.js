/**
 * Pure rules for an event's route and its stops (docs/EVENTS.md §11). No
 * React, no fetching: `node --test` pins them.
 *
 * Principle 0 holds here too: nothing tests a task KIND. A "stop" is any task
 * whose kind declares `lat` and `lng` in its `configSchema` (the registry
 * decides), so a future kind with a place on the map gets the same picker.
 */
import { boundsOf, inRange, isPoint, nearestOnPath, pathLengthKm } from '../../../lib/geo.js';
import { fieldsOf } from './schema.js';

export const MAX_PATH_POINTS = 500;
export const MAX_VIA = MAX_PATH_POINTS - 2;
export const OFF_ROUTE_M = 1000; // the server warns beyond this
export const RADIUS_MIN = 50;
export const RADIUS_MAX = 2000;
export const RADIUS_DEFAULT = 150;
export const NAME_MAX = 80;
export const NOTE_MAX = 160;
export const REVEAL = [
  { value: 'all', label: 'Show every stop' },
  { value: 'unlocked', label: 'Only unlocked stops' },
];

const str = (v) => (typeof v === 'string' ? v : '');
const t = (v) => String(v ?? '').trim();
const num = (v) => (v === '' || v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/* ------------------------------------------------------------- the route -- */
const pin = (p = {}) => ({ name: str(p.name), nameHi: str(p.nameHi), lat: num(p.lat), lng: num(p.lng) });

/** An empty route block. `via` = the path points between start and end. */
export const blankRoute = () => ({ start: pin(), end: pin(), via: [], mapReveal: 'all', lengthKm: null, pathSig: '' });

/** The API's `route` (path includes start and end) -> the draft shape. Missing parts are blank. */
export function routeFrom(r) {
  if (!r || typeof r !== 'object') return blankRoute();
  const path = Array.isArray(r.path) ? r.path.filter(isPoint) : [];
  const start = pin(r.start);
  const end = pin(r.end);
  if (start.lat == null && path.length) [start.lat, start.lng] = path[0];
  if (end.lat == null && path.length > 1) [end.lat, end.lng] = path[path.length - 1];
  const route = { start, end, via: path.length > 2 ? path.slice(1, -1) : [], mapReveal: r.mapReveal === 'unlocked' ? 'unlocked' : 'all', lengthKm: num(r.lengthKm), pathSig: '' };
  route.pathSig = pathSig(route);
  return route;
}

const pointOf = (p) => (p && p.lat != null && p.lng != null && Number.isFinite(p.lat) && Number.isFinite(p.lng) ? [p.lat, p.lng] : null);

/** The full path `[start, ...via, end]`, leaving out an end that is not set yet. */
export function effectivePath(route) {
  if (!route) return [];
  return [pointOf(route.start), ...(route.via || []), pointOf(route.end)].filter(isPoint);
}

/** A string identifying the path, to tell whether a server-computed value still applies. */
export function pathSig(route) {
  return effectivePath(route).map((p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`).join(';');
}

/** Live length, km (haversine). The server's `lengthKm` wins while the path is unchanged since the last save. */
export function routeLengthKm(route) {
  const local = pathLengthKm(effectivePath(route));
  if (route?.lengthKm != null && route.pathSig && route.pathSig === pathSig(route)) return route.lengthKm;
  return local;
}

/** The draft -> the API `route` (never `lengthKm`: the server computes it). */
export function routeBody(route) {
  const p = (x) => ({ name: t(x.name), nameHi: t(x.nameHi), lat: x.lat, lng: x.lng });
  return { start: p(route.start), end: p(route.end), path: effectivePath(route), mapReveal: route.mapReveal === 'unlocked' ? 'unlocked' : 'all' };
}

/** Same { 'path.to.field': message } shape as the API's 400 `fields`. */
export function routeProblems(route) {
  const e = {};
  for (const [which, label] of [['start', 'start'], ['end', 'end']]) {
    const p = route[which];
    if (!t(p.name)) e[`route.${which}.name`] = `Name the ${label}`;
    else if (t(p.name).length > NAME_MAX) e[`route.${which}.name`] = `At most ${NAME_MAX} characters`;
    if (t(p.nameHi).length > NAME_MAX) e[`route.${which}.nameHi`] = `At most ${NAME_MAX} characters`;
    if (!pointOf(p)) e[`route.${which}.point`] = `Place the ${label} on the map or enter its coordinates`;
    else if (!inRange(pointOf(p))) e[`route.${which}.point`] = 'Latitude is −90 to 90 and longitude −180 to 180';
  }
  if ((route.via || []).length > MAX_VIA) e['route.path'] = `A path has up to ${MAX_PATH_POINTS} points`;
  else if ((route.via || []).some((v) => !inRange(v))) e['route.path'] = 'A path point is outside the valid coordinates';
  else if (effectivePath(route).length < 2) e['route.path'] = 'A path needs a start and an end';
  return e;
}

/* ---------------------------------------------------------------- stops -- */
/** True when a kind's `configSchema` declares both `lat` and `lng`. */
export function isGeoSchema(schema) {
  const keys = fieldsOf(schema).map((f) => f.key);
  return keys.includes('lat') && keys.includes('lng');
}

/** Problems with a place's config: { field: message }. `keys` = the fields the kind declares. */
export function geoProblems(config = {}, keys = ['lat', 'lng', 'radiusM', 'name', 'note']) {
  const e = {};
  const lat = num(config.lat);
  const lng = num(config.lng);
  if (lat == null) e.lat = 'Pick the place on the map or enter its latitude';
  else if (lat < -90 || lat > 90) e.lat = 'Latitude is −90 to 90';
  if (lng == null) e.lng = 'Pick the place on the map or enter its longitude';
  else if (lng < -180 || lng > 180) e.lng = 'Longitude is −180 to 180';
  if (keys.includes('radiusM') && config.radiusM !== '' && config.radiusM != null) {
    const r = Number(config.radiusM);
    if (!Number.isFinite(r) || r < RADIUS_MIN || r > RADIUS_MAX) e.radiusM = `Radius is ${RADIUS_MIN} to ${RADIUS_MAX} m`;
  }
  if (keys.includes('name')) {
    if (!t(config.name)) e.name = 'Name the place';
    else if (t(config.name).length > NAME_MAX) e.name = `At most ${NAME_MAX} characters`;
  }
  if (keys.includes('nameHi') && t(config.nameHi).length > NAME_MAX) e.nameHi = `At most ${NAME_MAX} characters`;
  if (keys.includes('note') && t(config.note).length > NOTE_MAX) e.note = `At most ${NOTE_MAX} characters`;
  return e;
}

/** The place a stop config points at, `[lat, lng]`, or null. */
export const stopPoint = (config) => {
  const lat = num(config?.lat);
  const lng = num(config?.lng);
  return lat != null && lng != null && inRange([lat, lng]) ? [lat, lng] : null;
};

/** Signature of a stop's place on a path: a stored `routeKm` is only valid while it matches. */
export function stopSig(config, route) {
  const p = stopPoint(config);
  return p ? `${p[0].toFixed(6)},${p[1].toFixed(6)}|${pathSig(route)}` : '';
}

/** Where a stop sits on the path: { routeKm, offRouteM }, local; the saved server value wins while nothing moved. */
export function stopPlacement(config, route) {
  const p = stopPoint(config);
  const n = p ? nearestOnPath(effectivePath(route), p) : null;
  if (!n) return { routeKm: null, offRouteM: null, fromServer: false };
  const sig = stopSig(config, route);
  if (config._sig && config._sig === sig && num(config.routeKm) != null) {
    return { routeKm: num(config.routeKm), offRouteM: num(config.offRouteM) ?? n.distanceM, fromServer: true };
  }
  return { routeKm: n.routeKm, offRouteM: n.distanceM, fromServer: false };
}

/**
 * Every place-task of the draft, in milestone order:
 * [{ mi, ti, milestoneKey, taskKey, title, name, nameHi, point, radiusM, routeKm, offRouteM, fromServer }].
 * `kinds` is the registry; a task whose kind is unknown counts when its config carries lat and lng.
 */
export function stopsOf(items, route, kinds = []) {
  const out = [];
  (items || []).forEach((m, mi) => {
    (m.tasks || []).forEach((k, ti) => {
      const kind = kinds.find((x) => x.kind === k.kind);
      const geo = kind ? isGeoSchema(kind.configSchema) : k.config && 'lat' in k.config && 'lng' in k.config;
      if (!geo) return;
      const point = stopPoint(k.config);
      const place = stopPlacement(k.config, route);
      out.push({
        mi, ti, milestoneKey: m.key, taskKey: k.key, title: m.title, name: t(k.config.name) || m.title || `Milestone ${mi + 1}`, nameHi: str(k.config.nameHi),
        point, radiusM: num(k.config.radiusM) ?? RADIUS_DEFAULT, ...place,
      });
    });
  });
  return out;
}

/** Stops with a place, sorted by km along the path (ties keep milestone order). */
export function stopsInPathOrder(stops) {
  return stops
    .filter((s) => s.point && s.routeKm != null)
    .map((s, i) => ({ s, i }))
    .sort((a, b) => a.s.routeKm - b.s.routeKm || a.i - b.i)
    .map(({ s }, n) => ({ ...s, order: n + 1 }));
}

/**
 * Reorder the milestones that hold a stop by km along the path. Milestones
 * without a stop keep their places; the stops' milestones fill, in sorted
 * order, the slots they occupied. Returns the same array when already in order.
 */
export function orderMilestonesByRoute(items, route, kinds = []) {
  const stops = stopsOf(items, route, kinds).filter((s) => s.point && s.routeKm != null);
  const first = new Map(); // milestone index -> its first stop's km
  stops.forEach((s) => { if (!first.has(s.mi)) first.set(s.mi, s.routeKm); });
  const slots = [...first.keys()].sort((a, b) => a - b);
  const sorted = slots.slice().sort((a, b) => first.get(a) - first.get(b) || a - b);
  if (sorted.every((v, i) => v === slots[i])) return items;
  const next = items.slice();
  slots.forEach((slot, i) => { next[slot] = items[sorted[i]]; });
  return next;
}
export const isInPathOrder = (items, route, kinds = []) => orderMilestonesByRoute(items, route, kinds) === items;

/* ------------------------------------------------------------- warnings -- */
/**
 * The save response's `warnings:[{path,code:'off_route',distanceM}]` -> a map
 * "mi:ti" -> warning. The path may name the stop by index ("milestones[2].tasks[0].config",
 * "milestones.items.2.tasks.0") or carry `milestoneKey` / `taskKey`.
 */
export function warningsByStop(warnings, items) {
  const out = {};
  for (const w of Array.isArray(warnings) ? warnings : []) {
    let mi = -1;
    let ti = -1;
    const m = String(w?.path ?? '').match(/milestones(?:\.items)?[.[](\d+)\]?\.tasks[.[](\d+)/);
    if (m) { mi = Number(m[1]); ti = Number(m[2]); }
    else if (w?.milestoneKey) {
      mi = (items || []).findIndex((x) => x.key === w.milestoneKey);
      ti = mi >= 0 ? Math.max(0, items[mi].tasks.findIndex((k) => k.key === w.taskKey)) : -1;
    }
    if (mi >= 0 && ti >= 0) out[`${mi}:${ti}`] = w;
  }
  return out;
}
/** Which milestone a warning is about: its title, or "Milestone 3". '' when the path names none. */
export function warningWhere(w, items) {
  const m = String(w?.path ?? '').match(/milestones(?:\.items)?[.[](\d+)/);
  if (m) return items?.[Number(m[1])]?.title || `Milestone ${Number(m[1]) + 1}`;
  const i = (items || []).findIndex((x) => x.key === w?.milestoneKey);
  return i >= 0 ? items[i].title || `Milestone ${i + 1}` : '';
}
export function warningText(w) {
  if (!w) return '';
  if (w.code === 'off_route') return `This stop is ${w.distanceM >= 1000 ? `${(w.distanceM / 1000).toFixed(1)} km` : `${Math.round(w.distanceM)} m`} from the path. It is saved, but check the pin.`;
  return w.message || String(w.code || 'Warning');
}
/** The same warning, computed here while editing. */
export function localOffRoute(offRouteM) {
  return offRouteM != null && offRouteM > OFF_ROUTE_M ? { code: 'off_route', distanceM: offRouteM } : null;
}

/** Frame for the whole route + stops on a map. */
export const routeBounds = (route, stops = []) => boundsOf([...effectivePath(route), ...stops.map((s) => s.point).filter(Boolean)]);
