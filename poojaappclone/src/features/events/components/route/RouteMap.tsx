import type { CameraRef, PressEventWithFeatures } from '@maplibre/maplibre-react-native';
import { useMemo, useRef } from 'react';
import { type NativeSyntheticEvent, Pressable, StyleSheet, View } from 'react-native';

import { FIT_PADDING, TEXT_FONT, USER_COLOR } from '@/components/map/constants';
import { singlePoint } from '@/components/map/geojson';
import type { LatLng } from '@/components/map/geometry';
import { maplibre } from '@/components/map/maplibre';
import { Type } from '@/components/ui';
import { MAP_STYLE_URL } from '@/constants/config';
import type { EventRoute } from '@/lib/api';
import { Radius, useTheme } from '@/theme';

import { endsCollection, pathCollection, radiusCollection, stopsCollection } from '../../lib/route-geojson';
import { type ResolvedStop, routeBounds } from '../../lib/route';

const FRAME = { ...FIT_PADDING, top: 44, bottom: 44, left: 40, right: 40 };

/**
 * The Yatra on a real map (MapLibre + OpenFreeMap, the shared lazy-guarded module): the path in two
 * lines (solid gold up to `doneKm`, dashed after), start/end markers, numbered stops coloured by state,
 * the selected stop's reach circle, and the devotee's dot. Pins are GeoJSON layers, not React views, so
 * a 60-stop route costs a handful of layers. Renders nothing when the native module is missing (the
 * Route block then shows the stop list instead).
 *
 * A done stop shows its number on green rather than a check glyph: the style's glyph set
 * (Noto Sans) has no U+2713, and a missing glyph would draw nothing.
 */
export function RouteMap({
  route,
  stops,
  selectedKey,
  focus,
  user,
  lang,
  labels,
  wholeLabel,
  a11y,
  onSelect,
  onLoaded,
  onFailed,
}: {
  route: EventRoute;
  stops: readonly ResolvedStop[];
  selectedKey: string | null;
  /** The stop whose reach circle is drawn (the selected one, else the next). */
  focus: ResolvedStop | null;
  user: LatLng | null;
  lang: string | null;
  labels: { start: string; end: string };
  wholeLabel: string;
  a11y: string;
  onSelect: (key: string | null) => void;
  onLoaded?: () => void;
  onFailed: () => void;
}) {
  const { c } = useTheme();
  const camera = useRef<CameraRef>(null);
  const ML = maplibre;

  const bounds = useMemo(() => routeBounds(route, stops), [route, stops]);
  const lines = useMemo(() => pathCollection(route, route.progress?.doneKm ?? 0), [route]);
  const pins = useMemo(() => stopsCollection(stops, selectedKey, lang), [stops, selectedKey, lang]);
  const ends = useMemo(() => endsCollection(route, labels), [route, labels]);
  const circle = useMemo(() => radiusCollection(focus), [focus]);
  const dot = useMemo(() => singlePoint(user), [user]);

  if (!ML) return null;

  const onStopPress = (e: NativeSyntheticEvent<PressEventWithFeatures>) => {
    e.stopPropagation();
    const key = (e.nativeEvent.features?.[0]?.properties as Record<string, unknown> | undefined)?.key;
    if (typeof key === 'string') onSelect(key);
  };

  const fit = () => {
    try {
      if (bounds) camera.current?.fitBounds(bounds, { padding: FRAME, duration: 600 });
    } catch {
      /* map not ready yet */
    }
  };

  const stateColor: unknown = ['match', ['get', 'state'], 'done', c.success, 'next', c.accent, 'open', c.primary, 'locked', '#8E8576', c.primary];
  const GOLD = c.gold;

  return (
    <View style={[styles.wrap, { borderColor: c.outlineVariant }]} accessibilityLabel={a11y}>
      <ML.Map
        style={StyleSheet.absoluteFill}
        mapStyle={MAP_STYLE_URL}
        logo={false}
        compass={false}
        attribution
        attributionPosition={{ bottom: 6, right: 6 }}
        touchRotate={false}
        touchPitch={false}
        onPress={() => onSelect(null)}
        onDidFinishLoadingMap={onLoaded}
        onDidFailLoadingMap={onFailed}>
        <ML.Camera
          ref={camera}
          initialViewState={bounds ? { bounds, padding: FRAME } : { center: [route.start.lng, route.start.lat], zoom: 10 }}
        />

        <ML.GeoJSONSource id="route-path" data={lines as never}>
          <ML.Layer
            id="route-rest"
            type="line"
            filter={['==', ['get', 'done'], false]}
            layout={{ 'line-cap': 'butt', 'line-join': 'round' }}
            paint={{ 'line-color': '#6B5A3C', 'line-width': 3, 'line-dasharray': [2, 2], 'line-opacity': 0.85 }}
          />
          <ML.Layer
            id="route-done-casing"
            type="line"
            filter={['==', ['get', 'done'], true]}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': '#FFFFFF', 'line-width': 8, 'line-opacity': 0.9 }}
          />
          <ML.Layer
            id="route-done"
            type="line"
            filter={['==', ['get', 'done'], true]}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': GOLD, 'line-width': 5 }}
          />
        </ML.GeoJSONSource>

        <ML.GeoJSONSource id="route-radius" data={circle as never}>
          <ML.Layer id="route-radius-fill" type="fill" paint={{ 'fill-color': c.accent, 'fill-opacity': 0.18 }} />
          <ML.Layer id="route-radius-line" type="line" paint={{ 'line-color': c.accent, 'line-width': 2 }} />
        </ML.GeoJSONSource>

        <ML.GeoJSONSource id="route-ends" data={ends as never}>
          <ML.Layer
            id="route-ends-dot"
            type="circle"
            paint={{
              'circle-color': ['match', ['get', 'kind'], 'start', c.success, c.primary],
              'circle-radius': 7,
              'circle-stroke-color': '#FFFFFF',
              'circle-stroke-width': 3,
            }}
          />
          <ML.Layer
            id="route-ends-label"
            type="symbol"
            layout={{ 'text-field': ['get', 'label'], 'text-font': TEXT_FONT, 'text-size': 11, 'text-offset': [0, -1.4], 'text-anchor': 'bottom', 'text-allow-overlap': true }}
            paint={{ 'text-color': '#2A0A0A', 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.5 }}
          />
        </ML.GeoJSONSource>

        <ML.GeoJSONSource id="route-stops" data={pins as never} onPress={onStopPress}>
          <ML.Layer
            id="route-stop-selected"
            type="circle"
            filter={['==', ['get', 'selected'], true]}
            paint={{ 'circle-color': 'rgba(255,255,255,0.0)', 'circle-radius': 21, 'circle-stroke-color': c.accent, 'circle-stroke-width': 3 }}
          />
          <ML.Layer
            id="route-stop-pin"
            type="circle"
            paint={{
              'circle-color': stateColor as never,
              'circle-radius': ['match', ['get', 'state'], 'next', 15, 12],
              'circle-stroke-color': '#FFFFFF',
              'circle-stroke-width': 2.5,
              'circle-opacity': ['match', ['get', 'state'], 'locked', 0.75, 1],
            }}
          />
          <ML.Layer
            id="route-stop-number"
            type="symbol"
            layout={{ 'text-field': ['get', 'label'], 'text-font': TEXT_FONT, 'text-size': 12, 'text-allow-overlap': true, 'text-ignore-placement': true }}
            paint={{ 'text-color': '#FFFFFF' }}
          />
          <ML.Layer
            id="route-stop-name"
            type="symbol"
            filter={['==', ['get', 'selected'], true]}
            layout={{ 'text-field': ['get', 'name'], 'text-font': TEXT_FONT, 'text-size': 12, 'text-offset': [0, 2.2], 'text-anchor': 'top', 'text-max-width': 9 }}
            paint={{ 'text-color': '#2A0A0A', 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.5 }}
          />
        </ML.GeoJSONSource>

        <ML.GeoJSONSource id="route-user" data={dot as never}>
          <ML.Layer
            id="route-user-dot"
            type="circle"
            paint={{ 'circle-color': USER_COLOR, 'circle-radius': 7, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 3 }}
          />
        </ML.GeoJSONSource>
      </ML.Map>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={wholeLabel}
        onPress={fit}
        style={[styles.pill, { backgroundColor: c.containerLowest, borderColor: c.outlineVariant }]}>
        <Type v="labelMd" tone="primary">
          {wholeLabel}
        </Type>
      </Pressable>
    </View>
  );
}

// Deliberately NOT `overflow:'hidden'` + a corner radius: that combination clips a native map view to
// nothing on Android (see AGENTS.md §5). The hairline frame is enough.
const styles = StyleSheet.create({
  wrap: { height: 340, borderWidth: StyleSheet.hairlineWidth, backgroundColor: '#E9E4D6' },
  pill: {
    position: 'absolute',
    top: 10,
    right: 10,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
