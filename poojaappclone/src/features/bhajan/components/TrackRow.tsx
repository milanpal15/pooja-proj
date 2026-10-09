import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { Saffron, Kumkum, Gold, Space, useTheme } from '@/theme';

import type { Track } from '../types';

const ART = [
  [Saffron[300], Kumkum[600]],
  ['#4B6A8A', '#1F3550'],
  [Gold[200], Gold[400]],
  ['#E2744A', '#9A3412'],
] as const;

const hash = (s: string) => [...s].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7);

/** A track: art, title/artist, a play button and an overflow menu. */
export function TrackRow({
  track: tr,
  active,
  playing,
  favourite,
  onPlay,
  onMore,
}: {
  track: Track;
  active: boolean;
  playing: boolean;
  favourite: boolean;
  onPlay: () => void;
  onMore: () => void;
}) {
  const { c } = useTheme();
  const { t } = useLanguage();
  return (
    <View style={[styles.row, { borderBottomColor: c.glassBorder }]}>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPlay} style={styles.main}>
        <LinearGradient
          colors={ART[hash(tr.id) % ART.length] as unknown as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.art}>
          {active && <Icon name={playing ? 'pause' : 'play'} size={18} color="#FFFFFF" filled />}
        </LinearGradient>
        <View style={{ flex: 1, gap: 1 }}>
          <Type v="titleSm" numberOfLines={1} tone={active ? 'goldInk' : 'onSurface'} style={{ fontSize: 15 }}>
            {tr.title}
          </Type>
          <Type v="bodySm" tone="onSurfaceVariant" numberOfLines={1}>
            {[tr.artist, tr.len].filter(Boolean).join(' · ')}
          </Type>
        </View>
        {favourite && <Icon name="heart" size={16} color={c.gold} filled />}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={active && playing ? 'Pause' : 'Play'}
        onPress={onPlay}
        style={[styles.play, { borderColor: Saffron[300] }]}>
        <Icon name={active && playing ? 'pause' : 'play'} size={18} color={Saffron[300]} filled />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={t('bp_more')} onPress={onMore} hitSlop={6} style={styles.more}>
        <Type v="titleLg" tone="onSurfaceVariant">
          ⋮
        </Type>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Space.sm + 2, minHeight: 52 },
  art: { width: 52, height: 52, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  play: { width: 42, height: 42, borderRadius: 21, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  more: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
});
