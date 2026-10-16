/** The route map's GeoJSON sources. Pure; tested in route.test.mjs. */
import {
  emptyCollection,
  type LineCollection,
  point,
  type PointCollection,
  type PolygonCollection,
} from '../../../components/map/geojson';
import type { EventRoute } from '@/lib/api';

import { circleRing, placeLabel, type ResolvedStop, splitPath, stopKey } from './route';

export type StopProps = { key: string; state: string; label: string; name: string; selected: boolean };
export type EndProps = { kind: 'start' | 'end'; label: string };
export type PathProps = { done: boolean };

/** The path in two lines: solid up to `doneKm`, dashed after. */
export function pathCollection(route: Pick<EventRoute, 'path'> | null | undefined, doneKm: number): LineCollection<PathProps> {
  const { done, rest } = splitPath(route?.path, doneKm);
  const features: LineCollection<PathProps>['features'] = [];
  if (done.length >= 2) features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: done }, properties: { done: true } });
  if (rest.length >= 2) features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: rest }, properties: { done: false } });
  return { type: 'FeatureCollection', features };
}

/** Numbered stops by state. The number is the stop's place along the path; the selected one carries its name. */
export function stopsCollection(stops: readonly ResolvedStop[], selectedKey: string | null, lang: string | null): PointCollection<StopProps> {
  return {
    type: 'FeatureCollection',
    features: stops.map((s) =>
      point(s, {
        key: stopKey(s),
        state: s.state,
        label: String(s.order),
        name: placeLabel(s, lang),
        selected: stopKey(s) === selectedKey,
      }),
    ),
  };
}

/** Start and end markers. `labels` are the words "Start" / "End" (already translated). */
export function endsCollection(
  route: Pick<EventRoute, 'start' | 'end'> | null | undefined,
  labels: { start: string; end: string },
): PointCollection<EndProps> {
  const features: PointCollection<EndProps>['features'] = [];
  if (route?.start) features.push(point(route.start, { kind: 'start', label: labels.start }));
  if (route?.end) features.push(point(route.end, { kind: 'end', label: labels.end }));
  return { type: 'FeatureCollection', features };
}

/** The reach circle of one stop (the next, or the one the devotee tapped). */
export function radiusCollection(stop: ResolvedStop | null | undefined): PolygonCollection<{ key: string }> {
  if (!stop) return { type: 'FeatureCollection', features: [] };
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [circleRing(stop, stop.radiusM)] }, properties: { key: stopKey(stop) } }],
  };
}

export { emptyCollection };
