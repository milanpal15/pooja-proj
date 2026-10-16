import type { CameraRef, GeoJSONSourceRef, PressEventWithFeatures, ViewStateChangeEvent } from '@maplibre/maplibre-react-native';
import { useRef } from 'react';
import { type NativeSyntheticEvent, StyleSheet } from 'react-native';
import type { Ref } from 'react';

import { MAP_STYLE_URL } from '@/constants/config';

import { SOURCE_IDS, TEXT_FONT } from '../constants/map';
import { maplibre } from '@/components/map/maplibre';
import type { ManagedProps, PlaceProps, PointCollection } from '../lib/places-geojson';

const OSM_COLOR = '#1F7A8C';
const OSM_CLUSTER = '#14566A';
const USER_COLOR = '#2979FF';

/**
 * The real map: OpenFreeMap vector tiles, with
 *  - nearby OSM temples in ONE clustered GeoJSON source (native clustering — hundreds of points
 *    cost a few layers, not hundreds of React views),
 *  - dashboard temples as larger pins in their own accent/trim colours (a handful of features),
 *  - a ring around the selection, and the devotee's own dot.
 * Renders nothing when the native module is missing (the screen never gets here then).
 */
export function MapCanvas({
  cameraRef,
  onSelectKey,
  onClusterPress,
  onBackgroundPress,
  onRegionDidChange,
  onLoaded,
  onLoadFailed,
  osm,
  managed,
  selection,
  userDot,
}: {
  cameraRef: Ref<CameraRef>;
  onSelectKey: (key: string) => void;
  /** A cluster was tapped: zoom into it. */
  onClusterPress: (center: [number, number], zoom: number) => void;
  onBackgroundPress: () => void;
  onRegionDidChange: (e: NativeSyntheticEvent<ViewStateChangeEvent>) => void;
  onLoaded: () => void;
  onLoadFailed: () => void;
  osm: PointCollection<PlaceProps>;
  managed: PointCollection<ManagedProps>;
  selection: PointCollection<Record<string, never>>;
  userDot: PointCollection<Record<string, never>>;
}) {
  const osmRef = useRef<GeoJSONSourceRef>(null);
  const ML = maplibre;
  if (!ML) return null;

  const onOsmPress = (e: NativeSyntheticEvent<PressEventWithFeatures>) => {
    e.stopPropagation();
    const f = e.nativeEvent.features?.[0];
    if (!f) return;
    const props = (f.properties ?? {}) as Record<string, unknown>;
    if (props.cluster) {
      const at = (f.geometry as unknown as { coordinates: [number, number] }).coordinates;
      osmRef.current
        ?.getClusterExpansionZoom(Number(props.cluster_id))
        .then((z) => onClusterPress(at, z))
        .catch(() => onClusterPress(at, 12));
    } else if (typeof props.key === 'string') {
      onSelectKey(props.key);
    }
  };

  const onManagedPress = (e: NativeSyntheticEvent<PressEventWithFeatures>) => {
    e.stopPropagation();
    const key = (e.nativeEvent.features?.[0]?.properties as Record<string, unknown> | undefined)?.key;
    if (typeof key === 'string') onSelectKey(key);
  };

  return (
    <ML.Map
      style={StyleSheet.absoluteFill}
      mapStyle={MAP_STYLE_URL}
      logo={false}
      compass={false}
      attribution
      attributionPosition={{ bottom: 6, right: 6 }}
      touchRotate={false}
      touchPitch={false}
      onPress={onBackgroundPress}
      onRegionDidChange={onRegionDidChange}
      onDidFinishLoadingMap={onLoaded}
      onDidFailLoadingMap={onLoadFailed}>
      <ML.Camera ref={cameraRef} initialViewState={{ center: [78.9, 22.6], zoom: 3.6 }} />

      <ML.GeoJSONSource
        ref={osmRef}
        id={SOURCE_IDS.osm}
        data={osm as never}
        cluster
        clusterRadius={46}
        clusterMaxZoom={13}
        onPress={onOsmPress}>
        <ML.Layer
          id="osm-clusters"
          type="circle"
          filter={['has', 'point_count']}
          paint={{
            'circle-color': OSM_CLUSTER,
            'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 30, 23],
            'circle-stroke-color': '#FFFFFF',
            'circle-stroke-width': 2,
          }}
        />
        <ML.Layer
          id="osm-cluster-count"
          type="symbol"
          filter={['has', 'point_count']}
          layout={{
            'text-field': ['get', 'point_count_abbreviated'],
            'text-font': TEXT_FONT,
            'text-size': 12,
            'text-allow-overlap': true,
          }}
          paint={{ 'text-color': '#FFFFFF' }}
        />
        <ML.Layer
          id="osm-points"
          type="circle"
          filter={['!', ['has', 'point_count']]}
          paint={{
            'circle-color': OSM_COLOR,
            'circle-radius': 6,
            'circle-stroke-color': '#FFFFFF',
            'circle-stroke-width': 1.5,
          }}
        />
      </ML.GeoJSONSource>

      <ML.GeoJSONSource id={SOURCE_IDS.selection} data={selection as never}>
        <ML.Layer
          id="selection-ring"
          type="circle"
          paint={{
            'circle-color': 'rgba(255,255,255,0.12)',
            'circle-radius': 19,
            'circle-stroke-color': '#FFFFFF',
            'circle-stroke-width': 3,
          }}
        />
      </ML.GeoJSONSource>

      <ML.GeoJSONSource id={SOURCE_IDS.managed} data={managed as never} onPress={onManagedPress}>
        <ML.Layer
          id="managed-halo"
          type="circle"
          paint={{
            'circle-color': ['get', 'accent'],
            'circle-opacity': 0.3,
            'circle-radius': 17,
          }}
        />
        <ML.Layer
          id="managed-pin"
          type="circle"
          paint={{
            'circle-color': ['get', 'accent'],
            'circle-radius': 9.5,
            'circle-stroke-color': ['get', 'trim'],
            'circle-stroke-width': 3,
          }}
        />
        <ML.Layer
          id="managed-label"
          type="symbol"
          layout={{
            'text-field': ['get', 'label'],
            'text-font': TEXT_FONT,
            'text-size': 12,
            'text-offset': [0, 1.7],
            'text-anchor': 'top',
            'text-max-width': 9,
          }}
          paint={{
            'text-color': '#2A0A0A',
            'text-halo-color': '#FFFFFF',
            'text-halo-width': 1.5,
          }}
        />
      </ML.GeoJSONSource>

      <ML.GeoJSONSource id={SOURCE_IDS.user} data={userDot as never}>
        <ML.Layer
          id="user-dot"
          type="circle"
          paint={{
            'circle-color': USER_COLOR,
            'circle-radius': 7,
            'circle-stroke-color': '#FFFFFF',
            'circle-stroke-width': 3,
          }}
        />
      </ML.GeoJSONSource>
    </ML.Map>
  );
}
