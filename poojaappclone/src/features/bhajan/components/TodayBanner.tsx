import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { Sandal, Saffron, Space } from '@/theme';

import type { Track } from '../types';

/** "Today's mantra" featured banner. The caller renders it only when a track exists. */
export function TodayBanner({ track, onListen }: { track: Track; onListen: () => void }) {
  const { t } = useLanguage();
  return (
    <LinearGradient
      colors={[Saffron[200], Saffron[400]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}>
      <View pointerEvents="none" style={styles.blob} />
      <View style={{ flex: 1, gap: 6 }}>
        <Type v="labelMd" color={Sandal[950]} style={{ fontWeight: '700', letterSpacing: 0.7, fontSize: 12 }}>
          {t('bp_todays_mantra').toUpperCase()}
        </Type>
        <Type v="titleLg" color={Sandal[950]} numberOfLines={2} style={{ fontSize: 18, lineHeight: 23, fontWeight: '700', maxWidth: 220 }}>
          {track.title}
        </Type>
        {!!track.artist && (
          <Type v="bodySm" color={Saffron[800]} numberOfLines={1}>
            {track.artist}
          </Type>
        )}
        <Pressable accessibilityRole="button" onPress={onListen} style={styles.btn}>
          <Icon name="play" size={14} color={Sandal[50]} filled />
          <Type v="labelMd" color={Sandal[50]} style={{ fontWeight: '700' }}>
            {t('bp_listen')}
          </Type>
        </Pressable>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, padding: Space.md, flexDirection: 'row', overflow: 'hidden' },
  blob: { position: 'absolute', right: -20, top: -10, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.3)' },
  btn: { alignSelf: 'flex-start', marginTop: 6, height: 34, paddingHorizontal: 16, borderRadius: 17, backgroundColor: Sandal[950], flexDirection: 'row', alignItems: 'center', gap: 6 },
});
