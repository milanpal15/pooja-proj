/**
 * Pure geometry for maps (docs/EVENTS.md §11). Points are `[lat, lng]` in
 * degrees; distances are metres unless a name says Km. No React, no DOM, so
 * `node --test` pins it.
 *
 * "Along the path" follows the server's definition: the distance from the
 * start, measured along the path, to the path's point nearest the place.
 * Here the nearest point may lie inside a segment (a continuous projection),
 * which equals the nearest-vertex answer for a densely drawn path.
 */

const R = 6371008.8; // mean Earth radius, metres
const rad = (d) => (d * Math.PI) / 180;

export const isPoint = (p) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
export const inRange = (p) => isPoint(p) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180;

/** Great-circle distance between two `[lat, lng]` points, metres. */
export function haversineM(a, b) {
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Cumulative metres at each vertex of a path (first is 0). */
export function cumulativeM(path) {
  const out = [0];
  for (let i = 1; i < path.length; i += 1) out.push(out[i - 1] + haversineM(path[i - 1], path[i]));
  return out;
}

/** Length of a path, km (0 for fewer than two points). */
export function pathLengthKm(path) {
  const pts = (path || []).filter(isPoint);
  return pts.length < 2 ? 0 : cumulativeM(pts)[pts.length - 1] / 1000;
}

/**
 * The point of `path` nearest `pt`: `{ point, distanceM, routeKm, segment, t }`
 * (`segment` = index of the segment's first vertex, `t` = 0..1 along it), or
 * null for an empty path. A one-point path is that point at 0 km.
 */
export function nearestOnPath(path, pt) {
  const p = (path || []).filter(isPoint);
  if (!p.length || !isPoint(pt)) return null;
  if (p.length === 1) return { point: p[0], distanceM: haversineM(p[0], pt), routeKm: 0, segment: 0, t: 0 };
  const cum = cumulativeM(p);
  let best = null;
  for (let i = 0; i < p.length - 1; i += 1) {
    // Local flat projection around the segment (accurate over the short spans of a drawn path).
    const lat0 = rad((p[i][0] + p[i + 1][0]) / 2);
    const kx = Math.cos(lat0);
    const ax = p[i][1] * kx; const ay = p[i][0];
    const bx = p[i + 1][1] * kx; const by = p[i + 1][0];
    const px = pt[1] * kx; const py = pt[0];
    const dx = bx - ax; const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    const point = [p[i][0] + (p[i + 1][0] - p[i][0]) * t, p[i][1] + (p[i + 1][1] - p[i][1]) * t];
    const distanceM = haversineM(point, pt);
    if (!best || distanceM < best.distanceM) {
      best = { point, distanceM, routeKm: (cum[i] + haversineM(p[i], point)) / 1000, segment: i, t };
    }
  }
  return best;
}

/**
 * Snap a clicked place to the path when it is within `maxM`. Returns
 * `{ point, snapped, routeKm, distanceM }`; `point` is the snapped point or
 * the original one.
 */
export function snapToPath(path, pt, maxM) {
  const n = nearestOnPath(path, pt);
  if (!n) return { point: pt, snapped: false, routeKm: null, distanceM: null };
  if (n.distanceM <= maxM) return { point: n.point, snapped: true, routeKm: n.routeKm, distanceM: n.distanceM };
  return { point: pt, snapped: false, routeKm: n.routeKm, distanceM: n.distanceM };
}

/** Ground metres covered by one screen pixel at a latitude and web-mercator zoom (512px tiles). */
export const metresPerPixel = (lat, zoom) => (40075016.686 * Math.cos(rad(lat))) / (512 * 2 ** zoom);

/** A circle as a closed GeoJSON ring of `[lng, lat]` (map order). */
export function circleRing(center, radiusM, steps = 64) {
  const [lat, lng] = center;
  const dLat = (radiusM / R) * (180 / Math.PI);
  const dLng = dLat / Math.max(0.01, Math.cos(rad(lat)));
  const ring = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = (i / steps) * 2 * Math.PI;
    ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return ring;
}

/** `[[minLng,minLat],[maxLng,maxLat]]` around points, or null when there are none. */
export function boundsOf(points) {
  const p = (points || []).filter(isPoint);
  if (!p.length) return null;
  return [
    [Math.min(...p.map((x) => x[1])), Math.min(...p.map((x) => x[0]))],
    [Math.max(...p.map((x) => x[1])), Math.max(...p.map((x) => x[0]))],
  ];
}

/**
 * Read "19.0760, 72.8777" as copied from any maps app. Accepts comma, space or
 * semicolon separators, brackets, a trailing degree sign, N/S/E/W letters
 * ("19.076 N, 72.8777 E") and a maps URL carrying "@lat,lng". Returns
 * `{ lat, lng }` or null.
 */
export function parseCoords(text) {
  let s = String(text ?? '').trim();
  if (!s) return null;
  const at = s.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (at) s = `${at[1]}, ${at[2]}`;
  const dir = [...s.matchAll(/(-?\d+(?:\.\d+)?)\s*°?\s*([NSEW])\b/gi)];
  if (dir.length === 2) {
    let lat = null; let lng = null;
    for (const [, v, d] of dir) {
      const n = Number(v) * (/[SW]/i.test(d) ? -1 : 1);
      if (/[NS]/i.test(d)) lat = n; else lng = n;
    }
    if (lat != null && lng != null && inRange([lat, lng])) return { lat, lng };
    return null;
  }
  const nums = s.replace(/[()[\]°]/g, ' ').split(/[\s,;]+/).filter(Boolean);
  if (nums.length !== 2 || !nums.every((n) => /^[-+]?\d+(?:\.\d+)?$/.test(n))) return null;
  const lat = Number(nums[0]); const lng = Number(nums[1]);
  return inRange([lat, lng]) ? { lat, lng } : null;
}

/** "19.07600, 72.87770" */
export const formatCoords = (lat, lng, digits = 5) => (Number.isFinite(lat) && Number.isFinite(lng) ? `${lat.toFixed(digits)}, ${lng.toFixed(digits)}` : '');

/** "420 m" below 1 km, else "12.4 km". */
export const distanceLabel = (m) => (m == null || !Number.isFinite(m) ? '—' : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`);
/** "12.4 km" from kilometres, one decimal. */
export const kmLabel = (km) => (km == null || !Number.isFinite(km) ? '—' : `${(Math.round(km * 10) / 10).toFixed(1)} km`);

/** The map style: `VITE_MAP_STYLE_URL` if set, else OpenFreeMap. The OSM volunteer tile servers are never used (their policy forbids app traffic). */
export const DEFAULT_MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
export function resolveStyleUrl(configured) {
  const v = String(configured ?? '').trim();
  if (!v || /tile\.openstreetmap\.org/i.test(v)) return DEFAULT_MAP_STYLE;
  return v;
}
