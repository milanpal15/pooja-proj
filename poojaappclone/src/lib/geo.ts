/**
 * Distance maths for "temples near me".
 *
 * Deliberately no Google Places here. The temple catalogue is curated — it is
 * what e-Chadhava, pooja booking and the admin panel all hang off — so
 * "nearby" means "nearest of ours", which is a sort over five rows, not a
 * metered API call. Places becomes worth its cost only when the product wants
 * discovery beyond the catalogue, and then it belongs on the server behind
 * `/v1/temples/nearby` with the key nowhere near the bundle.
 */

export type Coords = { lat: number; lng: number };

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Great-circle distance in kilometres.
 *
 * Haversine rather than the equirectangular approximation: India spans about
 * 30° of latitude, and the flat approximation drifts by several kilometres
 * over Kashi-to-Madurai distances — enough to reorder the list wrongly.
 */
function distanceKm(a: Coords, b: Coords): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Human distance. Precision falls off with magnitude, because "1,847.3 km" is
 * false precision — nobody plans a pilgrimage on the hundred metres.
 */
export function formatDistance(km: number, locale: 'en' | 'hi' = 'en'): string {
  const unit = locale === 'hi' ? { m: 'मी', km: 'कि.मी.' } : { m: 'm', km: 'km' };

  if (km < 1) return `${Math.round(km * 1000)} ${unit.m}`;
  if (km < 10) return `${km.toFixed(1)} ${unit.km}`;
  return `${Math.round(km).toLocaleString(locale === 'hi' ? 'hi-IN' : 'en-IN')} ${unit.km}`;
}

/** Sort a list by distance from `origin`, nearest first. */
export function byDistanceFrom<T extends { coords: Coords }>(
  origin: Coords,
  items: readonly T[],
): (T & { km: number })[] {
  return items
    .map((item) => ({ ...item, km: distanceKm(origin, item.coords) }))
    .sort((a, b) => a.km - b.km);
}
