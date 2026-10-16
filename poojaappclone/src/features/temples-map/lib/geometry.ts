/** Pure map maths — no React, no native module; tested in geometry.test.mjs. */

export type LatLng = { lat: number; lng: number };
/** West, south, east, north (GeoJSON order, what MapLibre's `fitBounds` takes). */
export type Bounds = [west: number, south: number, east: number, north: number];
export type SearchArea = LatLng & { radius: number };

const EARTH_M = 6_371_000;
const M_PER_DEG_LAT = 111_320;
const rad = (d: number) => (d * Math.PI) / 180;

/** A usable position. The dashboard stores 0,0 for "not set", which is the Gulf of Guinea, not a temple. */
export function hasCoords(c: { lat?: number; lng?: number } | null | undefined): c is LatLng {
  if (!c) return false;
  const { lat, lng } = c;
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  return !(lat === 0 && lng === 0);
}

/** Great-circle distance in metres. */
export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(rad(a.lat)) * Math.cos(rad(b.lat));
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The box around some points, grown to at least `minSpanDeg` each way (centred) so a single point
 * or two neighbours do not fit at street level. Null when no point has coordinates.
 */
export function boundsOf(points: readonly LatLng[], minSpanDeg = 0.05): Bounds | null {
  const ok = points.filter(hasCoords);
  if (!ok.length) return null;
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const p of ok) {
    w = Math.min(w, p.lng);
    e = Math.max(e, p.lng);
    s = Math.min(s, p.lat);
    n = Math.max(n, p.lat);
  }
  const grow = (lo: number, hi: number, limit: number): [number, number] => {
    if (hi - lo >= minSpanDeg) return [lo, hi];
    const mid = (lo + hi) / 2;
    return [Math.max(-limit, mid - minSpanDeg / 2), Math.min(limit, mid + minSpanDeg / 2)];
  };
  const [w2, e2] = grow(w, e, 180);
  const [s2, n2] = grow(s, n, 90);
  return [w2, s2, e2, n2];
}

/** Centre of a box. */
export function centerOf(b: Bounds): LatLng {
  return { lat: (b[1] + b[3]) / 2, lng: (b[0] + b[2]) / 2 };
}

/** Radius (metres) of the circle inscribed in a box — what a "search this area" covers — clamped. */
export function radiusForBounds(b: Bounds, min = 500, max = 25_000): number {
  const c = centerOf(b);
  const heightM = Math.abs(b[3] - b[1]) * M_PER_DEG_LAT;
  const widthM = Math.abs(b[2] - b[0]) * M_PER_DEG_LAT * Math.cos(rad(c.lat));
  const r = Math.min(heightM, widthM) / 2;
  if (!Number.isFinite(r)) return min;
  return Math.round(Math.min(max, Math.max(min, r)));
}

/**
 * Has the camera moved enough from the last search to be worth offering another? A pan of at least
 * `max(minMoveM, fraction × last radius)`, or a zoom-out that more than ~doubles the area. Zooming IN
 * never qualifies: what is on screen is already a subset of what was fetched.
 */
export function movedFarEnough(
  last: SearchArea | null,
  now: SearchArea,
  minMoveM = 800,
  fraction = 0.35,
): boolean {
  if (!last) return true;
  if (haversineM(last, now) >= Math.max(minMoveM, last.radius * fraction)) return true;
  return now.radius > last.radius * 1.8;
}

/** Whether to show "Search this area" for the settled camera. */
export function shouldOfferSearch(
  last: SearchArea | null,
  view: (SearchArea & { zoom: number }) | null,
  minZoom = 9,
): boolean {
  if (!view || view.zoom < minZoom) return false;
  return movedFarEnough(last, view);
}
