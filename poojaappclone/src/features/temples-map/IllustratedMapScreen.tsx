import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { useContent } from '@/providers/content';

import { MapHeader } from './components/MapHeader';
import { MapViewport } from './components/MapViewport';
import { TempleSheet } from './components/TempleSheet';
import { usePerformPooja } from './hooks/use-perform-pooja';
import { useTempleMap } from './hooks/use-temple-map';

/**
 * Today's illustrated pilgrimage map. It is the fallback when the installed build has no native map
 * module (an older dev client, Expo Go), so it must stay dependency-free of MapLibre. `note` is the
 * one-line "live map needs the latest build" explanation.
 */
export function IllustratedMapScreen({ note }: { note?: string }) {
  const { t } = useLanguage();
  // Temples now carry their deity's slug; the display name comes from the
  // dashboard so an admin-added deity reads correctly here too.
  const { deityName, templeList } = useContent();
  const { selected, focusOn, resetView, camera, cameraStyle, onViewport } = useTempleMap();
  const perform = usePerformPooja();

  const theme = selected ?? templeList[0];

  return (
    <View style={[styles.root, { backgroundColor: theme.backdrop[1] }]}>
      <SafeAreaView style={styles.safe}>
        <MapHeader
          eyebrow={t('pilgrimage_map')}
          title={selected ? selected.name : t('choose_temple')}
          location={selected ? selected.location : `${templeList.length} ${t('tap_marker')}`}
          locationColor={theme.trim}
        />

        {note ? (
          <Type v="labelMd" color="rgba(255,255,255,0.6)" center style={styles.note}>
            {note}
          </Type>
        ) : null}

        <MapViewport
          temples={templeList}
          selectedId={selected?.id}
          camera={camera}
          cameraStyle={cameraStyle}
          trim={theme.trim}
          resetLabel={t('reset_view')}
          onLayoutSize={onViewport}
          onSelect={focusOn}
          onReset={resetView}
        />

        <TempleSheet
          selected={selected}
          deityName={deityName}
          performLabel={t('perform_pooja')}
          placeholder={t('tap_to_begin')}
          onPerform={perform}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  safe: { flex: 1, overflow: 'hidden' },
  note: { paddingHorizontal: 24, paddingTop: 6 },
});
