import { Modal, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CircleButton } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { Space, useTheme } from '@/theme';

import { LocationRationale } from '../LocationRationale';
import { AutoCheckInRow, ProgressCard, SessionStopCard } from './RouteBits';
import type { RouteSessionValue } from './RouteSession';
import { SessionMap } from './SessionMap';

/**
 * The route map full screen: a Modal over the event detail (so the session — selection, check-in,
 * the one location watcher — is the very same). The Android back button closes it (`onRequestClose`).
 * The map exists only while it is open; the banner's map is unmounted for that time.
 */
export function RouteFullScreen({ s }: { s: RouteSessionValue }) {
  const { c } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const open = s.host === 'fullscreen';

  return (
    <Modal visible={open} animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={s.closeFullscreen}>
      <View style={[styles.root, { backgroundColor: c.surface }]}>
        <SessionMap s={s} style={StyleSheet.absoluteFill} pillStyle={{ top: insets.top + Space.sm + 84, right: Space.sm }} />

        <View pointerEvents="box-none" style={[styles.top, { paddingTop: insets.top + Space.sm }]}>
          <CircleButton name="close" label={t('ev_route_fullscreen_close')} onPress={s.closeFullscreen} />
          <View pointerEvents="none" style={styles.flex}>
            <ProgressCard s={s} />
          </View>
        </View>

        <View pointerEvents="box-none" style={[styles.bottom, { paddingBottom: insets.bottom + Space.sm }]}>
          <ScrollView style={{ maxHeight: height * 0.45 }} contentContainerStyle={styles.sheet} showsVerticalScrollIndicator={false}>
            <SessionStopCard s={s} />
            <AutoCheckInRow s={s} />
          </ScrollView>
        </View>

        {/* The rationale lives HERE while full screen is open (the block's copy is hidden), so it opens above the map. */}
        <LocationRationale perm={s.perm} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'flex-start', gap: Space.sm, paddingHorizontal: Space.sm },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: Space.sm },
  sheet: { gap: Space.sm },
});
