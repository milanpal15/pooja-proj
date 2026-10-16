import { hasCoords, type LatLng } from './geometry';

/** GeoJSON building blocks for map sources. Pure. */

export type PointFeature<P> = {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: P;
};
export type PointCollection<P> = { type: 'FeatureCollection'; features: PointFeature<P>[] };

export type LineFeature<P> = {
  type: 'Feature';
  geometry: { type: 'LineString'; coordinates: [number, number][] };
  properties: P;
};
export type LineCollection<P> = { type: 'FeatureCollection'; features: LineFeature<P>[] };

export type PolygonFeature<P> = {
  type: 'Feature';
  geometry: { type: 'Polygon'; coordinates: [number, number][][] };
  properties: P;
};
export type PolygonCollection<P> = { type: 'FeatureCollection'; features: PolygonFeature<P>[] };

export const point = <P>(c: LatLng, properties: P): PointFeature<P> => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
  properties,
});

export const emptyCollection = <P>(): PointCollection<P> => ({ type: 'FeatureCollection', features: [] });

/** A single usable point, or an empty collection. */
export function singlePoint(c: LatLng | null | undefined): PointCollection<Record<string, never>> {
  return c && hasCoords(c) ? { type: 'FeatureCollection', features: [point(c, {})] } : emptyCollection();
}
