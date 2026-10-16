import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { useContent } from '@/providers/content';

import { MapCanvas } from './components/MapCanvas';
import { MapHeader } from './components/MapHeader';
import { MapPill } from './components/MapPill';
import { MapStatus, type MapStatusKind } from './components/MapStatus';
import { PlaceSheet } from './components/PlaceSheet';
import { TempleSheet } from './components/TempleSheet';
import { useLiveMap } from './hooks/use-live-map';
import { usePerformPooja } from './hooks/use-perform-pooja';
import { DEDUPE_RADIUS_M, MAX_PLACES } from './constants/map';
import { formatPlaceDistance, placeName } from './lib/format';
import { buildManagedCollection, buildPlacesCollection, singlePoint } from './lib/places-geojson';

const FALLBACK = { backdrop: ['#2A1206', '#120703'] as [string, string], trim: '#E4572E' };

/** The live map screen: header, the map with its floating controls, and the selection sheet. */
export function LiveTemplesMap() {
  const router = useRouter();
  const { t } = useLanguage();
  const { deityName } = useContent();
  const ctl = useLiveMap();
  const perform = usePerformPooja();
  const {
    lang,
    nearby,
    selectedTemple,
    selectedPlace,
    templeList,
    cameraRef,
    onSelectKey,
    zoomInto,
    clearSelection,
    onRegionDidChange,
    onMapReady,
    onMapFailed,
  } = ctl;

  const managed = useMemo(() => buildManagedCollection(templeList), [templeList]);
  const osm = useMemo(
    () => buildPlacesCollection(nearby.places, templeList, lang, { dedupeM: DEDUPE_RADIUS_M, max: MAX_PLACES }),
    [nearby.places, templeList, lang],
  );
  const selection = useMemo(() => singlePoint(ctl.selectedPoint), [ctl.selectedPoint]);
  const userDot = useMemo(() => singlePoint(ctl.user), [ctl.user]);

  const theme = selectedTemple ?? templeList[0] ?? FALLBACK;
  const placeTitle = selectedPlace ? placeName(selectedPlace, lang) : '';

  let status: { kind: MapStatusKind; message: string; action?: string; onAction?: () => void } | null = null;
  if (ctl.styleFailed) status = { kind: 'styleFailed', message: t('map_style_failed') };
  else if (nearby.status === 'loading') status = { kind: 'loading', message: t('map_searching') };
  else if (nearby.status === 'error')
    status = { kind: 'error', message: t('map_load_failed'), action: t('map_retry'), onAction: ctl.retry };
  else if (nearby.status === 'ready' && osm.features.length === 0)
    status = { kind: 'empty', message: t('map_none_nearby') };
  else if (ctl.zoomHint) status = { kind: 'hint', message: t('map_zoom_hint') };

  return (
    <View style={[styles.root, { backgroundColor: theme.backdrop[1] }]}>
      <SafeAreaView style={styles.safe}>
        <MapHeader
          eyebrow={t('pilgrimage_map')}
          title={selectedTemple ? selectedTemple.name : placeTitle || t('choose_temple')}
          location={
            selectedTemple
              ? selectedTemple.location
              : selectedPlace
                ? t('map_nearby_temple')
                : `${ctl.mappable.length} ${t('tap_marker')}`
          }
          locationColor={theme.trim}
        />

        <View style={styles.viewport}>
          <MapCanvas
            cameraRef={cameraRef}
            onSelectKey={onSelectKey}
            onClusterPress={zoomInto}
            onBackgroundPress={clearSelection}
            onRegionDidChange={onRegionDidChange}
            onLoaded={onMapReady}
            onLoadFailed={onMapFailed}
            osm={osm} managed={managed} selection={selection} userDot={ctl.user ? userDot : singlePoint(null)} />

          <View style={styles.topBar} pointerEvents="box-none">
            <MapPill label={t('map_back')} icon="back" onPress={() => router.back()} />
          </View>

          <View style={styles.centerStack} pointerEvents="box-none">
            {ctl.offerSearch ? (
              <MapPill label={t('map_search_area')} icon="search" onPress={ctl.searchHere} />
            ) : null}
            {status ? (
              <MapStatus
                kind={status.kind}
                message={status.message}
                actionLabel={status.action}
                onAction={status.onAction}
              />
            ) : null}
          </View>

          <View style={styles.controls} pointerEvents="box-none">
            {ctl.mappable.length > 0 ? (
              <MapPill label={t('map_all_temples')} icon="temple" onPress={ctl.fitAll} />
            ) : null}
            <MapPill label={t('map_near_me')} icon="mapPin" busy={ctl.locating} onPress={ctl.locate} />
          </View>

          <Type v="bodySm" color="rgba(24,8,6,0.8)" style={styles.attribution} pointerEvents="none">
            {nearby.attribution}
          </Type>
        </View>

        {selectedPlace ? (
          <PlaceSheet
            name={placeTitle}
            distance={formatPlaceDistance(selectedPlace.distanceM, lang)}
            deity={selectedPlace.deity}
            address={selectedPlace.address}
            directionsLabel={t('map_directions')}
            onDirections={() =>
              ctl.openDirections({ lat: selectedPlace.lat, lng: selectedPlace.lng, name: placeTitle })
            }
          />
        ) : (
          <TempleSheet
            selected={selectedTemple}
            deityName={deityName}
            performLabel={t('perform_pooja')}
            placeholder={t('tap_to_begin')}
            onPerform={perform}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  safe: { flex: 1, overflow: 'hidden' },
  viewport: { flex: 1, marginTop: 10, overflow: 'hidden', backgroundColor: '#1a0f0a' },
  topBar: { position: 'absolute', top: 10, left: 12, flexDirection: 'row' },
  centerStack: { position: 'absolute', top: 62, left: 12, right: 12, alignItems: 'center', gap: 8 },
  controls: { position: 'absolute', right: 12, bottom: 34, alignItems: 'flex-end', gap: 8 },
  attribution: { position: 'absolute', left: 8, bottom: 8, fontSize: 11, lineHeight: 14, backgroundColor: 'rgba(255,255,255,0.7)', paddingHorizontal: 4, borderRadius: 4 },
});
