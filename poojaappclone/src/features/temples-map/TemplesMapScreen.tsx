import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useContent } from '@/providers/content';
import { useLanguage } from '@/i18n';

import { MapHeader } from './components/MapHeader';
import { MapViewport } from './components/MapViewport';
import { TempleSheet } from './components/TempleSheet';
import { useTempleMap } from './hooks/use-temple-map';

export function TemplesMapScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  // Temples now carry their deity's slug; the display name comes from the
  // dashboard so an admin-added deity reads correctly here too.
  const { deityName, templeList } = useContent();
  const { selected, focusOn, resetView, camera, cameraStyle, onViewport } = useTempleMap();

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
          onPerform={(s) =>
            router.push({
              pathname: '/pooja',
              // `ts` is a nonce so re-selecting the same deity still restarts
              // the aarti (identical params would otherwise skip the reset).
              params: { deity: s.deity, ts: String(Date.now()) },
            })
          }
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  safe: { flex: 1, overflow: 'hidden' },
});
