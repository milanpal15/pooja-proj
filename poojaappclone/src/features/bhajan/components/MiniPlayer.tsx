import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Type } from '@/components/ui';

import { BottomTabInset, Kumkum, Saffron, Space, useTheme } from '@/theme';

import type { Track } from '../types';

/** Mini player, docked above the tab bar. */
export function MiniPlayer({
  track,
  playing,
  onToggle,
}: {
  track: Track;
  playing: boolean;
  onToggle: () => void;
}) {
  const { c } = useTheme();
  return (
    <View style={[styles.mini, { backgroundColor: c.onSurface }]}>
      <View style={styles.miniRow}>
        <LinearGradient colors={[Saffron[300], Kumkum[600]]} style={styles.artSmall} />
        <View style={{ flex: 1, gap: 1 }}>
          <Type v="titleSm" numberOfLines={1} color={c.surface}>
            {track.title}
          </Type>
          <Type v="bodySm" color={c.surface} numberOfLines={1} style={{ opacity: 0.75 }}>
            {track.artist}
          </Type>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause' : 'Play'}
          onPress={onToggle}
          style={({ pressed }) => [styles.playBtn, { opacity: pressed ? 0.85 : 1 }]}>
          <Icon name={playing ? 'pause' : 'play'} size={24} color={c.surface} filled />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mini: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: BottomTabInset + Space.sm,
    borderRadius: 18,
    elevation: 8,
  },
  miniRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  artSmall: {
    width: 42,
    height: 42,
    borderRadius: 10,
  },
  playBtn: {
    width: 32,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
