import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DEITIES, type Deity } from '@/constants/deities';

/** Small circular murti bust used inside the strip pills. */
export function DeityAvatar({ deity, size = 30 }: { deity: Deity; size?: number }) {
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: deity.robe },
      ]}>
      <View
        style={{
          width: size * 0.62,
          height: size * 0.62,
          borderRadius: size * 0.31,
          backgroundColor: deity.body,
          marginTop: size * 0.1,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: size * 0.08,
          width: size * 0.42,
          height: size * 0.14,
          borderRadius: size * 0.07,
          backgroundColor: deity.trim,
        }}
      />
    </View>
  );
}

/**
 * The horizontally scrolling deity selector. Tapping a pill swaps the idol in
 * the sanctum below.
 */
export function DeityStrip({
  selected,
  onSelect,
}: {
  selected: Deity;
  onSelect: (d: Deity) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}>
      {/* Bhakti reels shortcut, mirroring the reference layout */}
      <Pressable style={[styles.pill, styles.reelPill]}>
        <View style={styles.playCircle}>
          <View style={styles.playTriangle} />
        </View>
        <Text style={styles.reelLabel}>भक्ति रील्स</Text>
      </Pressable>

      <View style={styles.divider} />

      {DEITIES.map((d) => {
        const active = d.id === selected.id;
        return (
          <Pressable
            key={d.id}
            onPress={() => onSelect(d)}
            style={[styles.pill, active && { backgroundColor: d.trim }]}>
            <DeityAvatar deity={d} />
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {d.name}
            </Text>
          </Pressable>
        );
      })}

      <Pressable style={styles.addButton}>
        <Text style={styles.addPlus}>+</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: { paddingHorizontal: 10, gap: 8, alignItems: 'center', paddingVertical: 6 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingLeft: 4,
    paddingRight: 12,
    paddingVertical: 4,
  },
  label: { fontSize: 13, fontWeight: '600', color: '#3A2A10' },
  labelActive: { color: '#FFFFFF' },
  reelPill: { paddingLeft: 4 },
  reelLabel: { fontSize: 13, fontWeight: '700', color: '#3A2A10' },
  playCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#E23744',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playTriangle: {
    width: 0,
    height: 0,
    borderTopWidth: 6,
    borderBottomWidth: 6,
    borderLeftWidth: 10,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#FFFFFF',
    marginLeft: 3,
  },
  divider: { width: 1, height: 26, backgroundColor: 'rgba(255,255,255,0.5)' },
  avatar: { alignItems: 'center', overflow: 'hidden' },
  addButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E28A1B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  addPlus: { color: '#FFFFFF', fontSize: 20, fontWeight: '700', marginTop: -2 },
});
