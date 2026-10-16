import { emptyCollection, type PointCollection, type PointFeature, point, singlePoint } from '../../../components/map/geojson';
import { hasCoords, haversineM } from '../../../components/map/geometry';
import { type MapLang, placeName } from './format';

/** GeoJSON for the map's sources. Pure; tested in places-geojson.test.mjs. */

export { emptyCollection, singlePoint };
export type { PointCollection, PointFeature };

/** The part of a nearby place the map needs (`NearbyTemple` from the API satisfies it). */
export type PlaceLike = {
  id: string;
  name: string;
  nameHi?: string | null;
  lat: number;
  lng: number;
};

/** The part of a dashboard temple the map needs (`Temple` satisfies it). */
export type ManagedLike = {
  id: string;
  name: string;
  accent: string;
  trim: string;
  coords: { lat: number; lng: number };
};

export type PlaceProps = { key: string; label: string };
export type ManagedProps = { key: string; id: string; label: string; accent: string; trim: string };

/** Stable feature keys: the OSM id as served, and `temple:<slug>` for dashboard temples. */
export const managedKey = (id: string) => `temple:${id}`;

/** Dashboard temples that have a real position. */
export function mappableTemples<T extends ManagedLike>(temples: readonly T[]): T[] {
  return temples.filter((t) => hasCoords(t.coords));
}

export function buildManagedCollection(temples: readonly ManagedLike[]): PointCollection<ManagedProps> {
  const seen = new Set<string>();
  const features: PointFeature<ManagedProps>[] = [];
  for (const t of mappableTemples(temples)) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    features.push(
      point(t.coords, {
        key: managedKey(t.id),
        id: t.id,
        label: t.name,
        accent: t.accent,
        trim: t.trim,
      }),
    );
  }
  return { type: 'FeatureCollection', features };
}

/**
 * Nearby OSM places as features. Drops places without a usable position, duplicate ids, and any place
 * within `dedupeM` of a dashboard temple (it is drawn as that temple instead). Order is the input's
 * (the API sends nearest first) and at most `max` are kept, so the same response always yields the
 * same collection and keys.
 */
export function buildPlacesCollection(
  places: readonly PlaceLike[],
  managed: readonly ManagedLike[],
  lang: MapLang,
  { dedupeM = 150, max = 80 }: { dedupeM?: number; max?: number } = {},
): PointCollection<PlaceProps> {
  const anchors = mappableTemples(managed).map((t) => t.coords);
  const seen = new Set<string>();
  const features: PointFeature<PlaceProps>[] = [];
  for (const p of places) {
    if (features.length >= max) break;
    if (!p || !p.id || seen.has(p.id) || !hasCoords(p)) continue;
    if (anchors.some((a) => haversineM(a, p) <= dedupeM)) continue;
    seen.add(p.id);
    features.push(point(p, { key: p.id, label: placeName(p, lang) }));
  }
  return { type: 'FeatureCollection', features };
}

/** A single point (the selection ring, the user's dot), or an empty collection. */
