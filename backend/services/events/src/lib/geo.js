/** Pure geometry for the Yatra route and the `location` task (docs/EVENTS.md section 11). No database, no clock. */

const EARTH_M = 6_371_008.8;
const rad = (d) => (d * Math.PI) / 180;

/** Great-circle distance in metres between `[lat, lng]` pairs. */
export function haversineM(a, b) {
  const [lat1, lng1] = a;
  const [lat2, lng2] = b;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Length of a `[[lat,lng], ...]` polyline in km. */
export function pathLengthKm(path) {
  let m = 0;
  for (let i = 1; i < path.length; i += 1) m += haversineM(path[i - 1], path[i]);
  return m / 1000;
}

/**
 * The point of the polyline nearest to `p`, measured along the path.
 * Each straight segment is projected onto a local flat plane (accurate to well under a metre over the few km a segment spans),
 * the foot of the perpendicular is clamped to the segment, and the distance is then measured with haversine.
 *
 * @returns {{ distanceM: number, routeKm: number, point: [number, number], segment: number }}
 *   `routeKm` = km from the first point to the nearest point along the path; `segment` = index of the segment it lies on.
 */
export function nearestOnPath(path, p) {
  if (!Array.isArray(path) || path.length === 0) return null;
  if (path.length === 1) return { distanceM: haversineM(path[0], p), routeKm: 0, point: [...path[0]], segment: 0 };
  let best = null;
  let walked = 0; // metres from the start to the beginning of the current segment
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    const segM = haversineM(a, b);
    const k = Math.cos(rad((a[0] + b[0]) / 2));
    const ax = a[1] * k; const ay = a[0];
    const bx = b[1] * k; const by = b[0];
    const px = p[1] * k; const py = p[0];
    const dx = bx - ax; const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    const point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const distanceM = haversineM(point, p);
    if (!best || distanceM < best.distanceM) best = { distanceM, routeKm: (walked + segM * t) / 1000, point, segment: i };
    walked += segM;
  }
  return best;
}

/** Rounds to `places` decimals. */
export const round = (n, places = 0) => { const f = 10 ** places; return Math.round(n * f) / f; };
