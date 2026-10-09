import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName, Type } from '@/components/ui';

export type ListenChip = { key: string; label: string; icon: IconName };
export type ListenTrack = { id: string; title: string; artist: string; len: string };

/** The dark "Listen now" card: category chips and one track row. Everything opens the Bhajan tab. */
export function ListenCard({
  title,
  link,
  chips,
  track,
  playLabel,
  onOpen,
}: {
  title: string;
  link: string;
  chips: ListenChip[];
  track?: ListenTrack;
  playLabel: string;
  onOpen: () => void;
}) {
  return (
    <LinearGradient colors={['#5A1414', '#3A0E0E']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} style={styles.card}>
      <View style={styles.head}>
        <Type v="titleMd" color="#FFFFFF">
          {title}
        </Type>
        <Pressable accessibilityRole="link" onPress={onOpen} hitSlop={10}>
          <Type v="labelMd" color="#F6D27A">
            {link} ›
          </Type>
        </Pressable>
      </View>
      {chips.length > 0 && (
        <View style={styles.chips}>
          {chips.map((ch) => (
            <Pressable key={ch.key} accessibilityRole="button" onPress={onOpen} style={styles.chip}>
              <View style={styles.chipIcon}>
                <Icon name={ch.icon} size={18} color="#F6D27A" />
              </View>
              <Type v="labelSm" color="#FFFFFF" center numberOfLines={2}>
                {ch.label}
              </Type>
            </Pressable>
          ))}
        </View>
      )}
      {track && (
        <Pressable accessibilityRole="button" accessibilityLabel={playLabel} onPress={onOpen} style={styles.song}>
          <View style={styles.play}>
            <Icon name="play" size={16} color="#3A0E0E" filled />
          </View>
          <View style={{ flex: 1 }}>
            <Type v="titleSm" color="#FFFFFF" numberOfLines={1}>
              {track.title}
            </Type>
            {!!track.artist && (
              <Type v="labelSm" color="#FFFFFF" numberOfLines={1} style={{ opacity: 0.8 }}>
                {track.artist}
              </Type>
            )}
          </View>
          {!!track.len && (
            <Type v="labelSm" color="#FFFFFF" style={{ opacity: 0.85 }}>
              {track.len}
            </Type>
          )}
        </Pressable>
      )}
    </LinearGradient>
  );
}

const glass = { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' } as const;
const styles = StyleSheet.create({
  card: { borderRadius: 22, padding: 16, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { ...glass, flex: 1, minHeight: 96, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 6 },
  chipIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  song: { ...glass, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14 },
  play: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F6D27A', alignItems: 'center', justifyContent: 'center' },
});
